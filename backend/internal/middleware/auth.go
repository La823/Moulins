package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "authorization header required", http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "invalid authorization format", http.StatusUnauthorized)
			return
		}

		claims, err := utils.ValidateToken(parts[1])
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "user_id", claims.UserID.String())
		ctx = context.WithValue(ctx, "role", claims.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := r.Context().Value("role").(string)
		if !ok || role != "admin" {
			http.Error(w, "admin access required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func StaffOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := r.Context().Value("role").(string)
		if !ok || (role != "admin" && role != "employee") {
			http.Error(w, "staff access required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission checks that the employee has a specific permission.
// Results are cached in Redis for 5 minutes per user+permission pair.
func RequirePermission(db *pgxpool.Pool, permission string, rdb *cache.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, _ := r.Context().Value("role").(string)

			if role == "admin" {
				next.ServeHTTP(w, r)
				return
			}

			userIDStr, _ := r.Context().Value("user_id").(string)
			userID, err := uuid.Parse(userIDStr)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			cacheKey := fmt.Sprintf("perm:%s:%s", userID, permission)
			var has bool
			if rdb.GetJSON(r.Context(), cacheKey, &has) {
				if !has {
					http.Error(w, "you don't have permission to access this", http.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			has, err = models.HasPermission(r.Context(), db, userID, permission)
			if err != nil {
				http.Error(w, "could not verify permissions", http.StatusInternalServerError)
				return
			}
			rdb.SetJSON(r.Context(), cacheKey, has, 5*time.Minute)

			if !has {
				http.Error(w, "you don't have permission to access this", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// InvalidatePermissions removes cached permission checks for a user.
func InvalidatePermissions(ctx context.Context, rdb *cache.Client, userID uuid.UUID) {
	keys := make([]string, len(models.ValidPermissions))
	for i, p := range models.ValidPermissions {
		keys[i] = fmt.Sprintf("perm:%s:%s", userID, p.Key)
	}
	rdb.Del(ctx, keys...)
}
