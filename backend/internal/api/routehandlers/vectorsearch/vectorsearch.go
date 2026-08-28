package vectorsearch

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	vs "github.com/lavanyaarora/server/internal/vectorsearch"
)

// backfillInterval paces requests under Voyage's free-tier 3 RPM limit.
const backfillInterval = 21 * time.Second

// POST /admin/vector-search/backfill — kicks off a background embed of
// every product into Qdrant, paced to stay under Voyage's rate limit.
// Runs detached from the request (context.Background(), not r.Context())
// since it can take many minutes for the full catalog — the response
// returns immediately with the product count, progress is in the logs.
func BackfillHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		products, _, err := models.GetAllProducts(r.Context(), db, false, "", "", "", "", 0, 0, false)
		if err != nil {
			log.Printf("vector search backfill: list products error: %v", err)
			http.Error(w, "could not list products", http.StatusInternalServerError)
			return
		}

		go func() {
			ctx := context.Background()
			synced, failed := 0, 0
			for i, p := range products {
				if i > 0 {
					time.Sleep(backfillInterval)
				}
				if err := vs.SyncProductByID(ctx, db, p.ID); err != nil {
					log.Printf("vector search backfill: sync %s failed: %v", p.ID, err)
					failed++
					continue
				}
				synced++
			}
			log.Printf("vector search backfill: done — synced %d, failed %d", synced, failed)
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"total":   len(products),
			"message": "backfill started in background, paced to respect rate limits — check server logs for progress",
		})
	}
}

// POST /admin/vector-search/ask — retrieval-augmented Q&A over the
// product catalog.
func AskHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Question string `json:"question"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Question == "" {
			http.Error(w, "question is required", http.StatusBadRequest)
			return
		}

		answer, err := vs.Ask(r.Context(), db, req.Question)
		if err != nil {
			log.Printf("vector search ask error: %v", err)
			http.Error(w, "could not answer question", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"answer": answer})
	}
}
