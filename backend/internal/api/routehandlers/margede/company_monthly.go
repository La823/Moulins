package margede

import (
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// GET /admin/marg-analysis/monthly-companies?gst=0 — each month's sales and
// profit for Moulins products and for everyone else's, for the net sales
// charts' split.
func CompanyMonthlyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.CompanyMonthly(r.Context(), db, exGST(r))
		if err != nil {
			log.Printf("company monthly: %v", err)
			http.Error(w, "could not build the split", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"months": out})
	}
}
