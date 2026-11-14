package margede

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// GET /admin/marg-analysis/customer-ratings — every customer this financial
// year with their rating (two h-indices), profit and Moulins/third-party split.
func CustomerRatingsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.GetCustomerRatings(r.Context(), db)
		if err != nil {
			log.Printf("customer ratings: %v", err)
			http.Error(w, "could not work out the customer ratings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}
