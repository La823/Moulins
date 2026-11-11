package orders

import (
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/margede"
)

// The staff order page's rates drawer: what the chosen partner was charged
// for a product before, and — when they have never been billed for it — the
// product's latest sale bills to anyone, with the customer and rate.

const recentRatesTTL = 10 * time.Minute

// the partner's own history, cached a little shorter: a new bill should show soon
const partnerRatesTTL = 5 * time.Minute

type partnerRates struct {
	Linked bool                `json:"linked"` // the partner has a Marg party
	Times  int                 `json:"times"`
	Last   *margede.RatePoint  `json:"last"`
	Points []margede.RatePoint `json:"points"` // most recent first, at most 10
	Min    *float64            `json:"min_rate"`
	Max    *float64            `json:"max_rate"`
}

// recentSale is one line of a recent sale bill of the product.
type recentSale struct {
	Date     time.Time `json:"date"`
	BillNo   string    `json:"bill_no"`
	Customer string    `json:"customer"`
	City     string    `json:"city"`
	Qty      float64   `json:"qty"`
	Free     float64   `json:"free"`
	Rate     float64   `json:"rate"`
}

// GET /admin/orders/product-rates/{productId}?partner=<uuid>
// {partner: {linked, times, last, points, min_rate, max_rate}, recent: [...]}
// recent is only filled when the partner has no history for the product.
func ProductRatesHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product", http.StatusBadRequest)
			return
		}
		out := map[string]any{"recent": []recentSale{}}
		partnerHas := false
		if partner, err := uuid.Parse(r.URL.Query().Get("partner")); err == nil {
			key := "rates:" + partner.String() + ":" + productID.String()
			var ph partnerRates
			if !rdb.GetJSON(r.Context(), key, &ph) {
				h, err := margede.GetRateHistory(r.Context(), db, partner, []string{productID.String()}, nil, 10)
				if err != nil {
					log.Printf("product rates %s partner %s: %v", productID, partner, err)
					http.Error(w, "could not load the rates", http.StatusInternalServerError)
					return
				}
				p := h.Products[productID.String()]
				ph = partnerRates{Linked: h.PartyCode != nil, Times: p.Times, Last: p.Last, Points: p.Points, Min: p.MinRate, Max: p.MaxRate}
				rdb.SetJSON(r.Context(), key, ph, partnerRatesTTL)
			}
			partnerHas = len(ph.Points) > 0
			out["partner"] = ph
		}
		if !partnerHas {
			key := "products:recent-rates:" + productID.String()
			var recent []recentSale
			if !rdb.GetJSON(r.Context(), key, &recent) {
				if recent, err = recentSales(r, db, productID); err != nil {
					log.Printf("product rates %s recent: %v", productID, err)
					http.Error(w, "could not load the rates", http.StatusInternalServerError)
					return
				}
				rdb.SetJSON(r.Context(), key, recent, recentRatesTTL)
			}
			out["recent"] = recent
		}
		writeQuickJSON(w, out)
	}
}

// recentSales is the product's last ten sale bill lines with a rate, to anyone.
func recentSales(r *http.Request, db *pgxpool.Pool, productID uuid.UUID) ([]recentSale, error) {
	rows, err := db.Query(r.Context(), `
		SELECT b.bill_date::timestamptz, COALESCE(b.bill_no, ''), COALESCE(l.name, b.party_code, ''), COALESCE(l.city, ''),
		       COALESCE(i.qty, 0)::float8, COALESCE(i.free, 0)::float8, i.rate::float8
		FROM products p
		JOIN marg_ede_bill_items i ON i.product_pid::text = p.marg_code AND NOT i.is_deleted
		JOIN marg_ede_bills b ON b.voucher = i.voucher
		LEFT JOIN LATERAL (
			SELECT ld.name, ld.city FROM marg_ede_ledger ld
			WHERE ld.party_code = b.party_code AND NOT ld.is_deleted ORDER BY ld.marg_id LIMIT 1
		) l ON TRUE
		WHERE p.id = $1 AND b.bill_type = 'S' AND b.bill_mode IS DISTINCT FROM 'challan' -- sale bills, not challans
		  AND NOT b.is_deleted AND NOT b.is_cancelled AND COALESCE(i.rate, 0) > 0
		ORDER BY b.bill_date DESC, b.bill_no DESC
		LIMIT 10`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []recentSale{}
	for rows.Next() {
		var s recentSale
		if err := rows.Scan(&s.Date, &s.BillNo, &s.Customer, &s.City, &s.Qty, &s.Free, &s.Rate); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
