package units

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

const cacheKey = "units"
const cacheTTL = 10 * time.Minute

// GET /products/units
func ListHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var list []models.Unit
		if rdb.GetJSON(r.Context(), cacheKey, &list) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(list)
			return
		}

		list, err := models.GetAllUnits(r.Context(), db)
		if err != nil {
			log.Printf("list units error: %v", err)
			http.Error(w, "could not fetch units", http.StatusInternalServerError)
			return
		}

		rdb.SetJSON(r.Context(), cacheKey, list, cacheTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// POST /admin/units
func CreateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
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

		id, err := models.CreateUnit(r.Context(), db, name)
		if err != nil {
			log.Printf("create unit error: %v", err)
			http.Error(w, "could not create unit (it may already exist)", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// DELETE /admin/units/{id}
func DeleteHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteUnit(r.Context(), db, id); err != nil {
			log.Printf("delete unit error: %v", err)
			http.Error(w, "could not delete unit", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}
