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
)

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
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}
