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
	"github.com/lavanyaarora/server/internal/mailer"
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
	ID                  uuid.UUID                `json:"id"`
	PhoneNumber         string                   `json:"phone_number"`
	Username            *string                  `json:"username,omitempty"`
	Email               *string                  `json:"email,omitempty"`
	PlainPassword       *string                  `json:"plain_password,omitempty"`
	Role                string                   `json:"role"`
	CustomerType        string                   `json:"customer_type"`
	SpecialTileImageURL string                   `json:"special_tile_image_url,omitempty"`
	IsPhoneVerified     bool                     `json:"is_phone_verified"`
	OnboardingStep      int                      `json:"onboarding_step"`
	LastLoginAt         *string                  `json:"last_login_at,omitempty"`
	CreatedAt           string                   `json:"created_at"`
	Orders              []models.Order           `json:"orders"`
	Documents           []models.PartnerDocument `json:"documents"`
	Rid                 *string                  `json:"rid,omitempty"`
	BillingAddress      *string                  `json:"billing_address,omitempty"`
	ShippingAddress     *string                  `json:"shipping_address,omitempty"`
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
			ID:                  user.ID,
			PhoneNumber:         user.PhoneNumber,
			Username:            user.Username,
			Email:               user.Email,
			PlainPassword:       user.PlainPassword,
			Role:                user.Role,
			CustomerType:        user.CustomerType,
			SpecialTileImageURL: user.SpecialTileImageURL,
			IsPhoneVerified:     user.IsPhoneVerified,
			OnboardingStep:      user.OnboardingStep,
			CreatedAt:           user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			Orders:              orders,
			Documents:           documents,
			Rid:                 user.Rid,
			BillingAddress:      user.BillingAddress,
			ShippingAddress:     user.ShippingAddress,
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

// POST /admin/marg-parties/{rid}/create-partner — creates a new partner
// account from a Marg party record, auto-linking it via rid. phone_number
// and password are required; username/email/billing_address/
// shipping_address are optional (typically prefilled from the Marg party
// on the frontend, but still editable there before submit) — the partner
// can add their email themselves later from their profile.
func CreatePartnerFromMargPartyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rid := mux.Vars(r)["rid"]
		if rid == "" {
			http.Error(w, "invalid rid", http.StatusBadRequest)
			return
		}

		var body struct {
			PhoneNumber     string  `json:"phone_number"`
			Password        string  `json:"password"`
			Email           string  `json:"email"`
			Username        *string `json:"username,omitempty"`
			BillingAddress  *string `json:"billing_address,omitempty"`
			ShippingAddress *string `json:"shipping_address,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.PhoneNumber == "" {
			http.Error(w, "phone_number is required", http.StatusBadRequest)
			return
		}
		if err := utils.ValidatePasswordStrength(body.Password); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if existing, _ := models.GetUserByPhone(r.Context(), db, body.PhoneNumber); existing != nil {
			http.Error(w, "a user with this phone number already exists", http.StatusConflict)
			return
		}
		if linked, err := models.GetUserByRid(r.Context(), db, rid); err == nil && linked != nil {
			http.Error(w, "this Marg party is already linked to a partner account", http.StatusConflict)
			return
		}

		var email *string
		if body.Email != "" {
			email = &body.Email
		}
		userID, err := models.CreateUser(r.Context(), db, body.PhoneNumber, body.Password, body.Username, email, "partner", nil, nil, nil)
		if err != nil {
			log.Printf("create partner from marg party error: %v", err)
			http.Error(w, "could not create partner", http.StatusInternalServerError)
			return
		}
		if err := models.UpdateRid(r.Context(), db, userID, &rid); err != nil {
			log.Printf("link new partner to marg party rid error: %v", err)
		}
		if body.BillingAddress != nil || body.ShippingAddress != nil {
			if err := models.UpdateAddresses(r.Context(), db, userID, body.BillingAddress, body.ShippingAddress); err != nil {
				log.Printf("set new partner address error: %v", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"user_id": userID.String(), "phone_number": body.PhoneNumber})
	}
}

// PUT /admin/partners/{id}/rid — link a partner to their Marg party record
// (margmaster_party.rid). Admin-only, set manually since Marg's party list
// has no direct link back to a Moulins account. Empty string clears it.
func UpdatePartnerRidHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			Rid string `json:"rid"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var rid *string
		if body.Rid != "" {
			rid = &body.Rid
		}

		if err := models.UpdateRid(r.Context(), db, userID, rid); err != nil {
			log.Printf("update partner rid error: %v", err)
			http.Error(w, "could not update rid", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "rid updated"})
	}
}

// PUT /admin/partners/{id}/email — admin sets/changes a partner's email.
// Empty string clears it. Mirrors what a partner can already do themselves
// via PUT /profile/email.
func UpdatePartnerEmailHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateEmail(r.Context(), db, userID, body.Email); err != nil {
			log.Printf("update partner email error: %v", err)
			http.Error(w, "could not update email", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "email updated"})
	}
}

// PUT /admin/partners/{id}/phone — admin changes a partner's login phone
// number. Rejects if another user already has it (phone is the login
// identity, so it must stay unique).
func UpdatePartnerPhoneHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			PhoneNumber string `json:"phone_number"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.PhoneNumber == "" {
			http.Error(w, "phone_number is required", http.StatusBadRequest)
			return
		}

		if err := models.UpdatePhoneNumber(r.Context(), db, userID, body.PhoneNumber); err != nil {
			if err == models.ErrPhoneTaken {
				http.Error(w, "a user with this phone number already exists", http.StatusConflict)
				return
			}
			log.Printf("update partner phone error: %v", err)
			http.Error(w, "could not update phone number", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "phone number updated"})
	}
}

// PUT /admin/partners/{id}/address — admin sets/changes a partner's
// billing/shipping address. Mirrors what a partner can already do
// themselves via PUT /profile/address. Either field may be omitted (nil)
// to leave it unchanged.
func UpdatePartnerAddressHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			BillingAddress  *string `json:"billing_address"`
			ShippingAddress *string `json:"shipping_address"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateAddresses(r.Context(), db, userID, body.BillingAddress, body.ShippingAddress); err != nil {
			log.Printf("update partner address error: %v", err)
			http.Error(w, "could not update address", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "address updated"})
	}
}

// POST /admin/partners/{id}/send-email/{key} — staff manually triggers one
// of the "manual" trigger_mode email templates for this partner. Each key
// needs its own data-building + prerequisite check below; add a case here
// whenever a new manual template is introduced.
func SendPartnerEmailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		userID, err := uuid.Parse(vars["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}
		key := vars["key"]

		user, err := models.GetUserByIDFull(r.Context(), db, userID)
		if err != nil {
			http.Error(w, "partner not found", http.StatusNotFound)
			return
		}
		if user.Email == nil || *user.Email == "" {
			http.Error(w, "this partner has no email on file", http.StatusBadRequest)
			return
		}

		name := "there"
		if user.Username != nil && *user.Username != "" {
			name = *user.Username
		}

		var data any
		switch key {
		case "partner_welcome_credentials":
			if user.PlainPassword == nil || *user.PlainPassword == "" {
				http.Error(w, "no password on file for this account", http.StatusBadRequest)
				return
			}
			data = struct {
				CustomerName string
				Phone        string
				Password     string
			}{
				CustomerName: name,
				Phone:        user.PhoneNumber,
				Password:     *user.PlainPassword,
			}
		default:
			http.Error(w, "unknown or non-manual email template", http.StatusBadRequest)
			return
		}

		subject, body, err := mailer.Render(r.Context(), db, key, data)
		if err != nil {
			log.Printf("send partner email: render failed for %s: %v", key, err)
			http.Error(w, "could not render email", http.StatusInternalServerError)
			return
		}
		if err := mailer.Send(r.Context(), mailer.ConfigFromEnv(), *user.Email, subject, body); err != nil {
			log.Printf("send partner email: send failed for %s: %v", key, err)
			http.Error(w, "could not send email", http.StatusInternalServerError)
			return
		}
		if err := models.LogEmailSend(r.Context(), db, key, "email", "partner", userID, *user.Email, sendEmailActorID(r)); err != nil {
			log.Printf("send partner email: log send failed for %s: %v", key, err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "sent"})
	}
}

// sendEmailActorID returns the acting staff user's ID for send-log
// attribution, or nil if it can't be parsed from the request context.
func sendEmailActorID(r *http.Request) *uuid.UUID {
	id, err := uuid.Parse(r.Context().Value("user_id").(string))
	if err != nil {
		return nil
	}
	return &id
}

// GET /admin/partners/{id}/send-log — every recorded email send for this
// partner, most recent first (e.g. the welcome-credentials email).
func PartnerSendLogHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}
		entries, err := models.ListEmailSendLog(r.Context(), db, "partner", userID)
		if err != nil {
			log.Printf("partner send log error: %v", err)
			http.Error(w, "could not fetch send log", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"entries": entries})
	}
}

// POST /admin/partners/special-tile-upload-url
// body: { "customer_id": "...", "filename": "..." }
func SpecialTileUploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			CustomerID string `json:"customer_id"`
			Filename   string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CustomerID == "" || req.Filename == "" {
			http.Error(w, "customer_id and filename are required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedSpecialTileUploadURL(req.CustomerID, req.Filename)
		if err != nil {
			log.Printf("presign special tile error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}

// PUT /admin/partners/{id}/special-tile-image
// body: { "image_key": "..." } — empty string clears it.
func UpdatePartnerSpecialTileImageHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var body struct {
			ImageKey string `json:"image_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var key *string
		if body.ImageKey != "" {
			key = &body.ImageKey
		}

		if err := models.UpdateSpecialTileImage(r.Context(), db, userID, key); err != nil {
			log.Printf("update special tile image error: %v", err)
			http.Error(w, "could not update tile image", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
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
