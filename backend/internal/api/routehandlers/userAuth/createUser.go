package userauth

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func CreateUserHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		// Limit request body to 1MB
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		// Parse request body
		var req models.CreateUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		// Basic validation
		if req.PhoneNumber == "" || req.Password == "" {
			http.Error(w, "phone_number and password are required", http.StatusBadRequest)
			return
		}

		// Call repository function
		userID, err := models.CreateUser(
			r.Context(),
			db,
			req.PhoneNumber,
			req.Password,
			req.Username,
			req.Email,
			req.Role,
		)

		if err != nil {
			log.Printf("failed to create user: %v", err)
			http.Error(w, "could not create user", http.StatusInternalServerError)
			return
		}

		// Success response
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)

		json.NewEncoder(w).Encode(models.CreateUserResponse{
			UserID: userID,
		})
	}
}
