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

// DenyRole blocks a single role from a route while leaving every other
// role untouched — used to keep doctor-role users to catalog/profile
// browsing only, by blocking them from order/cart creation without having
// to enumerate every other role that's allowed.
func DenyRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if reqRole, _ := r.Context().Value("role").(string); reqRole == role {
				http.Error(w, "not available for this account type", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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

// RequireAnyPermission passes if the employee has at least one of the given
// permissions — used where a route is shared by two independently-gated
// features (e.g. the partner search picker used by both the notifications
// composer and the broadcast-list editor).
func RequireAnyPermission(db *pgxpool.Pool, permissions []string, rdb *cache.Client) func(http.Handler) http.Handler {
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

			for _, permission := range permissions {
				cacheKey := fmt.Sprintf("perm:%s:%s", userID, permission)
				var has bool
				if rdb.GetJSON(r.Context(), cacheKey, &has) {
					if has {
						next.ServeHTTP(w, r)
						return
					}
					continue
				}

				has, err = models.HasPermission(r.Context(), db, userID, permission)
				if err != nil {
					http.Error(w, "could not verify permissions", http.StatusInternalServerError)
					return
				}
				rdb.SetJSON(r.Context(), cacheKey, has, 5*time.Minute)

				if has {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, "you don't have permission to access this", http.StatusForbidden)
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
