package margede

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// GET /admin/marg-analysis/years/monthly?gst= — company sales, credit notes
// and purchases month by month over every year on record (Day Book years,
// then the live bills).
func AnalysisYearsMonthlyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		months, err := margede.SalesByYear(r.Context(), db, exGST(r))
		if err != nil {
			log.Printf("analysis years monthly: %v", err)
			http.Error(w, "could not load sales by year", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(months)
	}
}

// GET /admin/marg-analysis/years/customers?gst= — every customer's sales
// per financial year.
func AnalysisYearsCustomersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := margede.CustomerSalesByYear(r.Context(), db, exGST(r))
		if err != nil {
			log.Printf("analysis years customers: %v", err)
			http.Error(w, "could not load customer sales by year", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}
