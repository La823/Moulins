package auth

import (
	"context"
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

		// a visitor's id is in visitors, not users
		if role, _ := r.Context().Value("role").(string); role == models.RoleVisitor {
			v, err := models.GetVisitor(r.Context(), db, userID)
			if err != nil {
				http.Error(w, "user not found", http.StatusNotFound)
				return
			}
			// "last active" on the admin Visitors page; off the request path
			go func() {
				if err := models.TouchVisitorSeen(context.Background(), db, userID); err != nil {
					log.Printf("visitor last-seen update error: %v", err)
				}
			}()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(v)
			return
		}

		cacheKey := fmt.Sprintf("user:%s", userID)
		var user models.User
		if rdb.GetJSON(r.Context(), cacheKey, &user) {
			attachTeamSettings(r, db, &user)
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

		u.TeamSettings = nil // cached without it; added fresh on every request
		rdb.SetJSON(r.Context(), cacheKey, u, 5*time.Minute)
		attachTeamSettings(r, db, u)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(u)
	}
}

// attachTeamSettings adds a team member's settings from their partner. Read
// on every request (one small query, team members only) so that a partner's
// change reaches the member's app without waiting for the user cache.
func attachTeamSettings(r *http.Request, db *pgxpool.Pool, u *models.User) {
	if u.Role != models.RoleTeamMember {
		return
	}
	s, err := models.GetTeamSettings(r.Context(), db, u.ID)
	if err != nil {
		log.Printf("team settings for %s: %v", u.ID, err)
		s = models.DefaultTeamSettings
	}
	u.TeamSettings = &s
}
