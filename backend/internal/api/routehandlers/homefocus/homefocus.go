package homefocus

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

const cacheKey = "home_focus"
const cacheTTL = 10 * time.Minute

type response struct {
	Heading     string             `json:"heading"`
	Description string             `json:"description"`
	Cards       []models.FocusCard `json:"cards"`
}

// GET /home-focus
func GetHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var resp response
		if rdb.GetJSON(r.Context(), cacheKey, &resp) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}

		section, err := models.GetFocusSection(r.Context(), db)
		if err != nil {
			log.Printf("get focus section error: %v", err)
			http.Error(w, "could not fetch areas of focus", http.StatusInternalServerError)
			return
		}
		cards, err := models.GetAllFocusCards(r.Context(), db)
		if err != nil {
			log.Printf("get focus cards error: %v", err)
			http.Error(w, "could not fetch areas of focus", http.StatusInternalServerError)
			return
		}
		for i := range cards {
			if cards[i].ImageKey != "" {
				cards[i].ImageURL = utils.GetPublicURL(cards[i].ImageKey)
			}
		}

		resp = response{Heading: section.Heading, Description: section.Description, Cards: cards}
		rdb.SetJSON(r.Context(), cacheKey, resp, cacheTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// PUT /admin/home-focus
func UpdateSectionHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.UpdateFocusSectionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Heading = strings.TrimSpace(req.Heading)
		req.Description = strings.TrimSpace(req.Description)
		if req.Heading == "" {
			http.Error(w, "heading is required", http.StatusBadRequest)
			return
		}

		if err := models.UpdateFocusSection(r.Context(), db, req); err != nil {
			log.Printf("update focus section error: %v", err)
			http.Error(w, "could not update areas of focus", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PUT /admin/home-focus/cards/{position}
func UpdateCardHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		position, err := strconv.Atoi(mux.Vars(r)["position"])
		if err != nil || position < 1 || position > 4 {
			http.Error(w, "invalid card position", http.StatusBadRequest)
			return
		}

		var req models.UpdateFocusCardRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Title = strings.TrimSpace(req.Title)
		req.LinkURL = strings.TrimSpace(req.LinkURL)
		if req.Title == "" || req.LinkURL == "" {
			http.Error(w, "title and link are required", http.StatusBadRequest)
			return
		}

		if req.ImageKey == "" {
			current, err := models.GetFocusCard(r.Context(), db, position)
			if err == nil {
				req.ImageKey = current.ImageKey
			}
		}

		if err := models.UpdateFocusCard(r.Context(), db, position, req); err != nil {
			log.Printf("update focus card error: %v", err)
			http.Error(w, "could not update card", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// POST /admin/home-focus/upload-url
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

		uploadURL, key, err := utils.GeneratePresignedFocusUploadURL(req.Filename)
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
