package manufacturers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
)

// actorID returns the acting staff user's ID for audit logging, or nil.
func actorID(r *http.Request) *uuid.UUID {
	id, err := uuid.Parse(r.Context().Value("user_id").(string))
	if err != nil {
		return nil
	}
	return &id
}

const cacheKey = "manufacturers"
const cacheTTL = 10 * time.Minute

func ListHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var list []models.Manufacturer
		if rdb.GetJSON(r.Context(), cacheKey, &list) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(list)
			return
		}

		list, err := models.GetAllManufacturers(r.Context(), db)
		if err != nil {
			log.Printf("list manufacturers error: %v", err)
			http.Error(w, "could not fetch manufacturers", http.StatusInternalServerError)
			return
		}

		rdb.SetJSON(r.Context(), cacheKey, list, cacheTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		m, err := models.GetManufacturerByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(m)
	}
}

func CreateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateManufacturerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		if req.Emails == nil {
			req.Emails = []string{}
		}

		id, err := models.CreateManufacturer(r.Context(), db, req)
		if err != nil {
			log.Printf("create manufacturer error: %v", err)
			http.Error(w, "could not create manufacturer", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)
		models.LogAction(r.Context(), db, actorID(r), "manufacturer.created", "manufacturer", &id, fmt.Sprintf("Created manufacturer %q", req.Name))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

func UpdateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req models.CreateManufacturerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		if req.Emails == nil {
			req.Emails = []string{}
		}

		if err := models.UpdateManufacturer(r.Context(), db, id, req); err != nil {
			log.Printf("update manufacturer error: %v", err)
			http.Error(w, "could not update", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)
		models.LogAction(r.Context(), db, actorID(r), "manufacturer.updated", "manufacturer", &id, fmt.Sprintf("Updated manufacturer %q", req.Name))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

func DeleteHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if err := models.DeleteManufacturer(r.Context(), db, id); err != nil {
			log.Printf("delete manufacturer error: %v", err)
			http.Error(w, "could not delete", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), cacheKey)
		models.LogAction(r.Context(), db, actorID(r), "manufacturer.deleted", "manufacturer", &id, "Deleted a manufacturer")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}
