package userauth

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// ExpectedPayment is what the app's "Expected payment" box shows on a
// partner's dashboard. Amount nil means nothing to show yet: the app shows
// a dash, not an error.
type ExpectedPayment struct {
	Amount  *float64   `json:"amount"`
	DueDate *time.Time `json:"due_date"` // optional: shown as "Due 5 Dec 2026"
	Note    *string    `json:"note"`     // optional: one short line under the amount
}

// expectedPaymentFor works out a partner's expected payment.
//
// HOOK IT UP HERE: put the real calculation in this function (for example
// from Marg bills, the cheque register or the ledger, using user.Rid) and
// fill in Amount (and DueDate / Note if wanted). Nothing else needs to
// change: the route, the response shape and the app already handle it.
func expectedPaymentFor(ctx context.Context, db *pgxpool.Pool, user *models.User) (ExpectedPayment, error) {
	_ = ctx
	_ = db
	_ = user
	return ExpectedPayment{}, nil // not calculated yet
}

// GET /profile/expected-payment: the logged-in partner's expected payment,
// calculated by expectedPaymentFor. Returns amount: null when there is
// nothing to show (no calculation yet, or none for this user).
func GetMyExpectedPaymentHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		if err != nil {
			json.NewEncoder(w).Encode(ExpectedPayment{})
			return
		}
		ep, err := expectedPaymentFor(r.Context(), db, user)
		if err != nil {
			http.Error(w, "could not work out the expected payment", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(ep)
	}
}
