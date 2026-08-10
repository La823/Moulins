package transports

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
)

const cacheKey = "transports:all"
const cacheTTL = 10 * time.Minute

// GET /transports?mode=<any admin-managed mode name> — public, used by the
// checkout dropdown. Always caches the full unfiltered list (modes are now
// open-ended, so caching one entry per mode would mean tracking every mode
// name just to invalidate them) and filters by mode in-process.
func ListHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")

		var list []models.Transport
		if !rdb.GetJSON(r.Context(), cacheKey, &list) {
			var err error
			list, err = models.GetAllTransports(r.Context(), db, "")
			if err != nil {
				log.Printf("list transports error: %v", err)
				http.Error(w, "could not fetch transports", http.StatusInternalServerError)
				return
			}
			rdb.SetJSON(r.Context(), cacheKey, list, cacheTTL)
		}

		result := list
		if mode != "" {
			result = make([]models.Transport, 0, len(list))
			for _, t := range list {
				if t.Mode == mode {
					result = append(result, t)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func invalidateCache(r *http.Request, rdb *cache.Client) {
	rdb.Del(r.Context(), cacheKey)
}

// POST /admin/transports — staff, "orders" permission
func CreateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Mode      string  `json:"mode"`
			Name      string  `json:"name"`
			GstNumber *string `json:"gst_number"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(req.Name)
		if name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		valid, err := models.IsValidTransportMode(r.Context(), db, req.Mode)
		if err != nil {
			log.Printf("check transport mode error: %v", err)
			http.Error(w, "could not validate mode", http.StatusInternalServerError)
			return
		}
		if !valid {
			http.Error(w, "unknown transport mode — add it first", http.StatusBadRequest)
			return
		}
		if req.GstNumber != nil {
			trimmed := strings.TrimSpace(*req.GstNumber)
			if trimmed == "" {
				req.GstNumber = nil
			} else {
				req.GstNumber = &trimmed
			}
		}

		id, err := models.CreateTransport(r.Context(), db, req.Mode, name, req.GstNumber)
		if err != nil {
			log.Printf("create transport error: %v", err)
			http.Error(w, "could not create transport (it may already exist)", http.StatusInternalServerError)
			return
		}

		invalidateCache(r, rdb)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// PUT /admin/transports/{id} — staff, "orders" permission
func UpdateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			Name      string  `json:"name"`
			GstNumber *string `json:"gst_number"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(req.Name)
		if name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		if req.GstNumber != nil {
			trimmed := strings.TrimSpace(*req.GstNumber)
			if trimmed == "" {
				req.GstNumber = nil
			} else {
				req.GstNumber = &trimmed
			}
		}

		if err := models.UpdateTransport(r.Context(), db, id, name, req.GstNumber); err != nil {
			log.Printf("update transport error: %v", err)
			http.Error(w, "could not update transport", http.StatusInternalServerError)
			return
		}

		invalidateCache(r, rdb)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /admin/transports/{id} — staff, "orders" permission
func DeleteHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteTransport(r.Context(), db, id); err != nil {
			log.Printf("delete transport error: %v", err)
			http.Error(w, "could not delete transport", http.StatusInternalServerError)
			return
		}

		invalidateCache(r, rdb)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}
