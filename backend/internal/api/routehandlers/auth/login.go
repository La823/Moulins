package auth

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

type LoginRequest struct {
	PhoneNumber string `json:"phone_number"`
	Password    string `json:"password"`
}

type LoginResponse struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

func LoginHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.PhoneNumber == "" || req.Password == "" {
			http.Error(w, "phone_number and password are required", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByPhone(r.Context(), db, req.PhoneNumber)
		if err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, "invalid phone number or password", http.StatusUnauthorized)
				return
			}
			log.Printf("login error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}

		if err := utils.CheckPassword(user.PasswordHash, req.Password); err != nil {
			http.Error(w, "invalid phone number or password", http.StatusUnauthorized)
			return
		}

		token, err := utils.GenerateToken(user.ID, user.Role)
		if err != nil {
			log.Printf("token generation error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}

		// Update last login timestamp
		_ = models.UpdateLastLogin(r.Context(), db, user.ID)

		// Attach permissions for employees
		if user.Role == "employee" {
			perms, err := models.GetPermissions(r.Context(), db, user.ID)
			if err != nil {
				log.Printf("permissions fetch error: %v", err)
			} else {
				user.Permissions = perms
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(LoginResponse{
			Token: token,
			User:  *user,
		})
	}
}
