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

type EmployeeDetailResponse struct {
	ID              uuid.UUID `json:"id"`
	PhoneNumber     string    `json:"phone_number"`
	Username        *string   `json:"username,omitempty"`
	Email           *string   `json:"email,omitempty"`
	PlainPassword   *string   `json:"plain_password,omitempty"`
	Role            string    `json:"role"`
	IsPhoneVerified bool      `json:"is_phone_verified"`
	LastLoginAt     *string   `json:"last_login_at,omitempty"`
	CreatedAt       string    `json:"created_at"`
	Permissions     []string  `json:"permissions"`
}

func GetEmployeeDetailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByIDFull(r.Context(), db, userID)
		if err != nil {
			log.Printf("get employee detail error: %v", err)
			http.Error(w, "employee not found", http.StatusNotFound)
			return
		}

		if user.Role != "employee" {
			http.Error(w, "user is not an employee", http.StatusBadRequest)
			return
		}

		perms, err := models.GetPermissions(r.Context(), db, userID)
		if err != nil {
			log.Printf("get employee permissions error: %v", err)
			perms = []string{}
		}

		resp := EmployeeDetailResponse{
			ID:              user.ID,
			PhoneNumber:     user.PhoneNumber,
			Username:        user.Username,
			Email:           user.Email,
			PlainPassword:   user.PlainPassword,
			Role:            user.Role,
			IsPhoneVerified: user.IsPhoneVerified,
			CreatedAt:       user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			Permissions:     perms,
		}

		if user.LastLoginAt != nil {
			s := user.LastLoginAt.Format("2006-01-02T15:04:05Z07:00")
			resp.LastLoginAt = &s
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func UpdateEmployeePasswordHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if len(body.Password) < 4 {
			http.Error(w, "password must be at least 4 characters", http.StatusBadRequest)
			return
		}

		if err := models.UpdateUserPassword(r.Context(), db, userID, body.Password); err != nil {
			log.Printf("update employee password error: %v", err)
			http.Error(w, "could not update password", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "password updated"})
	}
}

func DeleteEmployeeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByID(r.Context(), db, userID)
		if err != nil {
			log.Printf("delete employee lookup error: %v", err)
			http.Error(w, "employee not found", http.StatusNotFound)
			return
		}
		if user.Role != "employee" {
			http.Error(w, "user is not an employee", http.StatusBadRequest)
			return
		}

		if err := models.DeleteUser(r.Context(), db, userID); err != nil {
			log.Printf("delete employee error: %v", err)
			http.Error(w, "could not delete employee", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "employee deleted"})
	}
}
