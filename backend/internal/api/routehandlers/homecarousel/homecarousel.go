package homecarousel

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

const cacheKey = "home_carousel"
const cacheTTL = 10 * time.Minute

func withResolvedURL(s models.CarouselSlide) models.CarouselSlide {
	if s.ImageKey != "" {
		s.ImageURL = utils.GetPublicURL(s.ImageKey)
	}
	return s
}

// GET /home-carousel
func ListHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var slides []models.CarouselSlide
		if rdb.GetJSON(r.Context(), cacheKey, &slides) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(slides)
			return
		}

		slides, err := models.GetAllCarouselSlides(r.Context(), db)
		if err != nil {
			log.Printf("list home carousel error: %v", err)
			http.Error(w, "could not fetch home carousel", http.StatusInternalServerError)
			return
		}
		for i := range slides {
			slides[i] = withResolvedURL(slides[i])
		}

		rdb.SetJSON(r.Context(), cacheKey, slides, cacheTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(slides)
	}
}

// PUT /admin/home-carousel/{position}
func UpdateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		position, err := strconv.Atoi(mux.Vars(r)["position"])
		if err != nil || position < 1 {
			http.Error(w, "invalid slide position", http.StatusBadRequest)
			return
		}

		var req models.UpdateCarouselSlideRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		req.Heading = strings.TrimSpace(req.Heading)
		req.Description = strings.TrimSpace(req.Description)
		req.ButtonText = strings.TrimSpace(req.ButtonText)
		req.ButtonLink = strings.TrimSpace(req.ButtonLink)

		if req.Heading == "" || req.ButtonText == "" || req.ButtonLink == "" {
			http.Error(w, "heading, button text and link are required", http.StatusBadRequest)
			return
		}

		if req.ImageKey == "" {
			current, err := models.GetCarouselSlide(r.Context(), db, position)
			if err == nil {
				req.ImageKey = current.ImageKey
			}
		}

		if err := models.UpdateCarouselSlide(r.Context(), db, position, req); err != nil {
			log.Printf("update home carousel slide error: %v", err)
			http.Error(w, "could not update slide", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// POST /admin/home-carousel
func CreateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slide, err := models.CreateCarouselSlide(r.Context(), db)
		if err != nil {
			log.Printf("create home carousel slide error: %v", err)
			http.Error(w, "could not create slide", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(slide)
	}
}

// DELETE /admin/home-carousel/{position}
func DeleteHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		position, err := strconv.Atoi(mux.Vars(r)["position"])
		if err != nil || position < 1 {
			http.Error(w, "invalid slide position", http.StatusBadRequest)
			return
		}

		if err := models.DeleteCarouselSlide(r.Context(), db, position); err != nil {
			log.Printf("delete home carousel slide error: %v", err)
			http.Error(w, "could not delete slide", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/home-carousel/upload-url
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

		uploadURL, key, err := utils.GeneratePresignedCarouselUploadURL(req.Filename)
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
