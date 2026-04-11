package userauth

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func ListAvailablePermissionsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"permissions": models.ValidPermissions,
		})
	}
}

func GetPermissionsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		perms, err := models.GetPermissions(r.Context(), db, userID)
		if err != nil {
			log.Printf("get permissions error: %v", err)
			http.Error(w, "could not fetch permissions", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]string{"permissions": perms})
	}
}

func SetPermissionsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			Permissions []string `json:"permissions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		// Validate permissions against centralized registry
		for _, p := range body.Permissions {
			if !models.IsValidPermission(p) {
				http.Error(w, "invalid permission: "+p, http.StatusBadRequest)
				return
			}
		}

		if err := models.SetPermissions(r.Context(), db, userID, body.Permissions); err != nil {
			log.Printf("set permissions error: %v", err)
			http.Error(w, "could not update permissions", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]string{"permissions": body.Permissions})
	}
}
