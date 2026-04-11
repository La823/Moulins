package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// Auth validates JWT token and adds user_id and role to request context
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

// AdminOnly ensures the authenticated user has admin role
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

// StaffOnly allows both admin and employee roles
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
// Admins always pass. Employees must have the permission in employee_permissions table.
func RequirePermission(db *pgxpool.Pool, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, _ := r.Context().Value("role").(string)

			// Admins bypass permission checks
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

			has, err := models.HasPermission(r.Context(), db, userID, permission)
			if err != nil {
				http.Error(w, "could not verify permissions", http.StatusInternalServerError)
				return
			}
			if !has {
				http.Error(w, "you don't have permission to access this", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
