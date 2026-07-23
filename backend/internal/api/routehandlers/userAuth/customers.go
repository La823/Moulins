package userauth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func GetCustomersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := models.GetUsersByRole(r.Context(), db, "customer")
		if err != nil {
			log.Printf("failed to fetch customers: %v", err)
			http.Error(w, "could not fetch customers", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

type CustomerDetailResponse struct {
	ID              uuid.UUID               `json:"id"`
	PhoneNumber     string                  `json:"phone_number"`
	Username        *string                 `json:"username,omitempty"`
	Email           *string                 `json:"email,omitempty"`
	PlainPassword   *string                 `json:"plain_password,omitempty"`
	Role            string                  `json:"role"`
	IsPhoneVerified bool                    `json:"is_phone_verified"`
	OnboardingStep  int                     `json:"onboarding_step"`
	LastLoginAt     *string                 `json:"last_login_at,omitempty"`
	CreatedAt       string                  `json:"created_at"`
	Orders          []models.Order          `json:"orders"`
	Documents       []models.CustomerDocument `json:"documents"`
}

func GetCustomerDetailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByIDFull(r.Context(), db, userID)
		if err != nil {
			log.Printf("get customer detail error: %v", err)
			http.Error(w, "customer not found", http.StatusNotFound)
			return
		}

		orders, err := models.GetOrdersByUser(r.Context(), db, userID)
		if err != nil {
			log.Printf("get customer orders error: %v", err)
			orders = []models.Order{}
		}

		documents, err := models.GetUserDocuments(r.Context(), db, userID)
		if err != nil {
			log.Printf("get customer documents error: %v", err)
			documents = []models.CustomerDocument{}
		}

		resp := CustomerDetailResponse{
			ID:              user.ID,
			PhoneNumber:     user.PhoneNumber,
			Username:        user.Username,
			Email:           user.Email,
			PlainPassword:   user.PlainPassword,
			Role:            user.Role,
			IsPhoneVerified: user.IsPhoneVerified,
			OnboardingStep:  user.OnboardingStep,
			CreatedAt:       user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			Orders:          orders,
			Documents:       documents,
		}

		if user.LastLoginAt != nil {
			s := user.LastLoginAt.Format("2006-01-02T15:04:05Z07:00")
			resp.LastLoginAt = &s
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func VerifyCustomerDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		adminIDStr, _ := r.Context().Value("user_id").(string)
		adminID, err := uuid.Parse(adminIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var body struct {
			UserID          uuid.UUID `json:"user_id"`
			DocType         string    `json:"doc_type"`
			IsVerified      bool      `json:"is_verified"`
			RejectionReason *string   `json:"rejection_reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		if err := models.VerifyDocument(r.Context(), db, body.UserID, body.DocType, body.IsVerified, body.RejectionReason, adminID); err != nil {
			log.Printf("verify document error: %v", err)
			http.Error(w, "could not verify document", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "document updated"})
	}
}

func UpdateCustomerPasswordHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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
		if err := utils.ValidatePasswordStrength(body.Password); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := models.UpdateUserPassword(r.Context(), db, userID, body.Password); err != nil {
			log.Printf("update customer password error: %v", err)
			http.Error(w, "could not update password", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "password updated"})
	}
}

func DeleteCustomerHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteUser(r.Context(), db, userID); err != nil {
			log.Printf("delete customer error: %v", err)
			http.Error(w, "could not delete customer", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "customer deleted"})
	}
}
