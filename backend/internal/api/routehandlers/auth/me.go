package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
)

func MeHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		cacheKey := fmt.Sprintf("user:%s", userID)
		var user models.User
		if rdb.GetJSON(r.Context(), cacheKey, &user) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&user)
			return
		}

		u, err := models.GetUserByID(r.Context(), db, userID)
		if err != nil {
			log.Printf("me handler error: %v", err)
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}

		if u.Role == "employee" {
			perms, err := models.GetPermissions(r.Context(), db, u.ID)
			if err != nil {
				log.Printf("permissions fetch error: %v", err)
			} else {
				u.Permissions = perms
			}
		}

		rdb.SetJSON(r.Context(), cacheKey, u, 5*time.Minute)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(u)
	}
}
