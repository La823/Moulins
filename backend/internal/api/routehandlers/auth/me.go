package auth

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func MeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		user, err := models.GetUserByID(r.Context(), db, userID)
		if err != nil {
			log.Printf("me handler error: %v", err)
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}

		if user.Role == "employee" {
			perms, err := models.GetPermissions(r.Context(), db, user.ID)
			if err != nil {
				log.Printf("permissions fetch error: %v", err)
			} else {
				user.Permissions = perms
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}
