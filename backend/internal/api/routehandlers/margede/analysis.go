package margede

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func rankFilter(r *http.Request) margede.RankFilter {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	period, _ := strconv.Atoi(q.Get("period"))
	return margede.RankFilter{Mode: q.Get("mode"), Search: q.Get("search"), Sort: q.Get("sort"), Dir: q.Get("dir"), Page: page,
		Period: period, IncludeCurrent: q.Get("current") == "1"}
}

// GET /admin/marg-analysis/parties?mode=sales|purchases&sort=avg&dir=desc&search=&page=
// &period=0..12 (0 = year so far, N = last N months)&current=1 (count the
// running month)
func AnalysisPartiesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.RankParties(r.Context(), db, rankFilter(r))
		if err != nil {
			log.Printf("marg analysis parties: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// GET /admin/marg-analysis/products?sort=avg&dir=desc&search=&page=
func AnalysisProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.RankProducts(r.Context(), db, rankFilter(r))
		if err != nil {
			log.Printf("marg analysis products: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// GET /admin/marg-analysis/monthly
func AnalysisMonthlyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.MonthlyOverview(r.Context(), db)
		if err != nil {
			log.Printf("marg analysis monthly: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"months": out})
	}
}

// GET /admin/marg-analysis/best-months?limit=50&all=1 (all=1: every
// month, not just each customer's best)
func AnalysisBestMonthsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		out, err := margede.BestMonths(r.Context(), db, limit, r.URL.Query().Get("all") != "1")
		if err != nil {
			log.Printf("marg analysis best months: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"rows": out})
	}
}

// GET /admin/marg-analysis/slipping?days=45
func AnalysisSlippingHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days, _ := strconv.Atoi(r.URL.Query().Get("days"))
		out, err := margede.Slipping(r.Context(), db, days)
		if err != nil {
			log.Printf("marg analysis slipping: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"rows": out})
	}
}

// GET /admin/marg-analysis/products/{pid}?period=0..12&current=1 — one
// product: totals, buyers and month-by-month sales for the product page.
func AnalysisProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, err := strconv.ParseInt(mux.Vars(r)["pid"], 10, 64)
		if err != nil {
			http.Error(w, "invalid product", http.StatusBadRequest)
			return
		}
		f := rankFilter(r)
		out, err := margede.AnalyzeProduct(r.Context(), db, pid, f.Period, f.IncludeCurrent)
		if errors.Is(err, margede.ErrProductNotFound) {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("marg analysis product %d: %v", pid, err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}
