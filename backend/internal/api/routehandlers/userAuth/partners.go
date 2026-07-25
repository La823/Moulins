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

func GetPartnersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := models.GetUsersByRole(r.Context(), db, "partner")
		if err != nil {
			log.Printf("failed to fetch partners: %v", err)
			http.Error(w, "could not fetch partners", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

type PartnerDetailResponse struct {
	ID              uuid.UUID                `json:"id"`
	PhoneNumber     string                   `json:"phone_number"`
	Username        *string                  `json:"username,omitempty"`
	Email           *string                  `json:"email,omitempty"`
	PlainPassword   *string                  `json:"plain_password,omitempty"`
	Role            string                   `json:"role"`
	CustomerType    string                   `json:"customer_type"`
	IsPhoneVerified bool                     `json:"is_phone_verified"`
	OnboardingStep  int                      `json:"onboarding_step"`
	LastLoginAt     *string                  `json:"last_login_at,omitempty"`
	CreatedAt       string                   `json:"created_at"`
	Orders          []models.Order           `json:"orders"`
	Documents       []models.PartnerDocument `json:"documents"`
}

func GetPartnerDetailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByIDFull(r.Context(), db, userID)
		if err != nil {
			log.Printf("get partner detail error: %v", err)
			http.Error(w, "partner not found", http.StatusNotFound)
			return
		}

		orders, err := models.GetOrdersByUser(r.Context(), db, userID)
		if err != nil {
			log.Printf("get partner orders error: %v", err)
			orders = []models.Order{}
		}

		documents, err := models.GetUserDocuments(r.Context(), db, userID)
		if err != nil {
			log.Printf("get partner documents error: %v", err)
			documents = []models.PartnerDocument{}
		}

		resp := PartnerDetailResponse{
			ID:              user.ID,
			PhoneNumber:     user.PhoneNumber,
			Username:        user.Username,
			Email:           user.Email,
			PlainPassword:   user.PlainPassword,
			Role:            user.Role,
			CustomerType:    user.CustomerType,
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

func VerifyPartnerDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
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

func UpdatePartnerPasswordHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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
			log.Printf("update partner password error: %v", err)
			http.Error(w, "could not update password", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "password updated"})
	}
}

// PUT /admin/partners/{id}/customer-type — switch a partner between the
// normal Moulins catalog and their own private "special" product division.
// Admin-only; never set at onboarding. Lives in the DB (and the cached user
// object), so the partner sees the change on their next /auth/me refresh.
func UpdatePartnerCustomerTypeHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			CustomerType string `json:"customer_type"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.CustomerType != "normal" && body.CustomerType != "special" {
			http.Error(w, "customer_type must be 'normal' or 'special'", http.StatusBadRequest)
			return
		}

		if err := models.UpdateCustomerType(r.Context(), db, userID, body.CustomerType); err != nil {
			log.Printf("update partner customer type error: %v", err)
			http.Error(w, "could not update customer type", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "customer type updated", "customer_type": body.CustomerType})
	}
}

func DeletePartnerHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteUser(r.Context(), db, userID); err != nil {
			log.Printf("delete partner error: %v", err)
			http.Error(w, "could not delete partner", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "partner deleted"})
	}
}
