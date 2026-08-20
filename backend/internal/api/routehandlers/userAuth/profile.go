package userauth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// PUT /profile/password — a user changes their own password, given their
// current one. Every logged-in role can use this (partner, doctor,
// employee, admin) — it only touches the caller's own account.
func UpdateMyPasswordHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		var req struct {
			CurrentPassword string `json:"current_password"`
			NewPassword     string `json:"new_password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		hash, err := models.GetPasswordHash(r.Context(), db, userID)
		if err != nil {
			log.Printf("get password hash error: %v", err)
			http.Error(w, "could not change password", http.StatusInternalServerError)
			return
		}
		if err := utils.CheckPassword(hash, req.CurrentPassword); err != nil {
			http.Error(w, "current password is incorrect", http.StatusUnauthorized)
			return
		}
		if err := utils.ValidatePasswordStrength(req.NewPassword); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := models.UpdateUserPassword(r.Context(), db, userID, req.NewPassword); err != nil {
			log.Printf("update own password error: %v", err)
			http.Error(w, "could not change password", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "password updated"})
	}
}

// PUT /profile/transport-mode — a partner sets their own default order
// transport mode ("courier" or "transport"), pre-filled at checkout.
func UpdateMyTransportModeHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		var req struct {
			DefaultTransportMode string `json:"default_transport_mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateDefaultTransportMode(r.Context(), db, userID, req.DefaultTransportMode); err != nil {
			log.Printf("update transport mode error: %v", err)
			http.Error(w, "transport_mode must be 'courier' or 'transport'", http.StatusBadRequest)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PUT /profile/address — a user sets their own billing/shipping address.
// Either field may be omitted (nil pointer) to leave it unchanged.
func UpdateMyAddressHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		var req struct {
			BillingAddress  *string `json:"billing_address"`
			ShippingAddress *string `json:"shipping_address"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateAddresses(r.Context(), db, userID, req.BillingAddress, req.ShippingAddress); err != nil {
			log.Printf("update address error: %v", err)
			http.Error(w, "could not update address", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// PUT /profile/email — a user adds/changes their own email address. Not
// required at signup or when created from a Marg party — this lets them
// fill it in themselves whenever they're ready (e.g. so order/status mail
// has somewhere to go).
func UpdateMyEmailHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		var req struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateEmail(r.Context(), db, userID, req.Email); err != nil {
			log.Printf("update email error: %v", err)
			http.Error(w, "could not update email", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), fmt.Sprintf("user:%s", userID))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// GET /profile/balance — a partner's own current ledger balance from Marg
// ERP, looked up via their linked rid. Returns balance: null (not an
// error) if they don't have an rid set yet, or if that rid has no synced
// Marg party record — either way there's nothing to show, not a failure.
func GetMyBalanceHandler(db *pgxpool.Pool) http.HandlerFunc {
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

		w.Header().Set("Content-Type", "application/json")

		user, err := models.GetUserByID(r.Context(), db, userID)
		if err != nil || user.Rid == nil || *user.Rid == "" {
			json.NewEncoder(w).Encode(map[string]any{"balance": nil})
			return
		}

		party, err := models.GetMargPartyByRid(r.Context(), db, *user.Rid)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]any{"balance": nil})
			return
		}

		json.NewEncoder(w).Encode(map[string]any{
			"balance":   party.Balance,
			"synced_at": party.SyncedAt,
		})
	}
}
