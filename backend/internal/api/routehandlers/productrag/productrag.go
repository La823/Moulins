package productrag

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	rag "github.com/lavanyaarora/server/internal/productrag"
)

const (
	maxQuestionLen = 500
	answerTTL      = time.Hour
)

// POST /admin/product-assistant/ask — the product assistant in the admin
// panel. Identical questions within the hour are answered from cache.
func AdminAskHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		var req struct {
			Question string `json:"question"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		question := strings.Join(strings.Fields(req.Question), " ")
		if question == "" {
			http.Error(w, "question is required", http.StatusBadRequest)
			return
		}
		if utf8.RuneCountInString(question) > maxQuestionLen {
			http.Error(w, "question is too long", http.StatusBadRequest)
			return
		}

		// a repeated question costs nothing
		sum := sha256.Sum256([]byte(strings.ToLower(question)))
		cacheKey := "product-assistant:answer:" + hex.EncodeToString(sum[:])
		var answer rag.Answer
		if rdb.GetJSON(r.Context(), cacheKey, &answer) {
			writeJSON(w, answer)
			return
		}

		answer, err := rag.Ask(r.Context(), db, question)
		if errors.Is(err, rag.ErrDeclined) {
			writeJSON(w, rag.Answer{Answer: "Sorry, I can't help with that question.", Products: []rag.ProductCard{}})
			return
		}
		if errors.Is(err, rag.ErrBusy) {
			http.Error(w, "the assistant is busy — please try again in a minute", http.StatusServiceUnavailable)
			return
		}
		if err != nil {
			log.Printf("product assistant ask error: %v", err)
			http.Error(w, "could not answer right now", http.StatusInternalServerError)
			return
		}
		rdb.SetJSON(r.Context(), cacheKey, answer, answerTTL)
		writeJSON(w, answer)
	}
}

// POST /admin/product-assistant/reindex — re-syncs every public product in
// the background (unchanged ones are skipped, so it is cheap to repeat).
// Responds at once; the result is in the server log.
func ReindexHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			defer cancel()
			start := time.Now()
			st, err := rag.Sync(ctx, db, nil)
			if err != nil {
				log.Printf("product assistant reindex failed after %s: %v", time.Since(start).Round(time.Second), err)
				return
			}
			log.Printf("product assistant reindex done in %s: %d products, %d chunks written, %d removed, %d PDFs read",
				time.Since(start).Round(time.Second), st.Products, st.Embedded, st.Deleted, st.Documents)
		}()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]string{"message": "re-index started — progress is in the server log"})
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
