package homehighlights

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

const cacheKey = "home_highlights"
const cacheTTL = 10 * time.Minute

func withResolvedURLs(h models.HomeHighlights) models.HomeHighlights {
	if h.Card1ImageKey != "" {
		h.Card1ImageURL = utils.GetPublicURL(h.Card1ImageKey)
	}
	if h.Card2ImageKey != "" {
		h.Card2ImageURL = utils.GetPublicURL(h.Card2ImageKey)
	}
	return h
}

// GET /home-highlights
func GetHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var h models.HomeHighlights
		if rdb.GetJSON(r.Context(), cacheKey, &h) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(h)
			return
		}

		h, err := models.GetHomeHighlights(r.Context(), db)
		if err != nil {
			log.Printf("get home highlights error: %v", err)
			http.Error(w, "could not fetch home highlights", http.StatusInternalServerError)
			return
		}
		h = withResolvedURLs(h)

		rdb.SetJSON(r.Context(), cacheKey, h, cacheTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(h)
	}
}

// PUT /admin/home-highlights
func UpdateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.UpdateHomeHighlightsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		req.Heading = strings.TrimSpace(req.Heading)
		req.Card1ButtonText = strings.TrimSpace(req.Card1ButtonText)
		req.Card1LinkURL = strings.TrimSpace(req.Card1LinkURL)
		req.Card2ButtonText = strings.TrimSpace(req.Card2ButtonText)
		req.Card2LinkURL = strings.TrimSpace(req.Card2LinkURL)

		if req.Heading == "" || req.Card1ButtonText == "" || req.Card1LinkURL == "" ||
			req.Card2ButtonText == "" || req.Card2LinkURL == "" {
			http.Error(w, "heading, button text and link are required for both cards", http.StatusBadRequest)
			return
		}

		// Keep existing image if a new one wasn't uploaded in this request.
		current, err := models.GetHomeHighlights(r.Context(), db)
		if err == nil {
			if req.Card1ImageKey == "" {
				req.Card1ImageKey = current.Card1ImageKey
			}
			if req.Card2ImageKey == "" {
				req.Card2ImageKey = current.Card2ImageKey
			}
		}

		if err := models.UpdateHomeHighlights(r.Context(), db, req); err != nil {
			log.Printf("update home highlights error: %v", err)
			http.Error(w, "could not update home highlights", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// POST /admin/home-highlights/upload-url
func UploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
			http.Error(w, "filename is required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedHighlightUploadURL(req.Filename)
		if err != nil {
			log.Printf("presign error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}
