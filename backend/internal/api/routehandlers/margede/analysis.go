package margede

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
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
	recent, _ := strconv.Atoi(q.Get("recent_days"))
	return margede.RankFilter{Mode: q.Get("mode"), Search: q.Get("search"), Sort: q.Get("sort"), Dir: q.Get("dir"), Page: page,
		Period: period, IncludeCurrent: q.Get("current") == "1", Company: q.Get("company"), ExGST: exGST(r), RecentDays: recent}
}

// exGST: gst=0 asks for amounts without GST (default: with, as on the bill).
func exGST(r *http.Request) bool { return r.URL.Query().Get("gst") == "0" }

// GET /admin/marg-analysis/parties?mode=sales|purchases&sort=avg&dir=desc&search=&page=
// &period=0..12 (0 = year so far, N = last N months)&current=1 (count the
// running month). Every analysis report takes gst=0 for amounts without GST.
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

// GET /admin/marg-analysis/products?sort=avg&dir=desc&search=&page=&company=IB|ID|IC
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
		out, err := margede.MonthlyOverview(r.Context(), db, exGST(r))
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
		out, err := margede.BestMonths(r.Context(), db, limit, r.URL.Query().Get("all") != "1", exGST(r))
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
		out, err := margede.Slipping(r.Context(), db, days, exGST(r))
		if err != nil {
			log.Printf("marg analysis slipping: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"rows": out})
	}
}

// GET /admin/marg-analysis/cities?period=&current=&gst= — the period's
// sales split by the customer's city.
func AnalysisCitiesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.SalesByCity(r.Context(), db, rankFilter(r))
		if err != nil {
			log.Printf("marg analysis cities: %v", err)
			http.Error(w, "could not build report", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// GET /admin/marg-analysis/not-selling?days=30&gst= — products bought in
// this year (first purchase at least `days` ago), slowest sellers first.
func AnalysisNotSellingHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 30
		if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil {
			days = v
		}
		out, err := margede.NotSelling(r.Context(), db, days, exGST(r))
		if err != nil {
			log.Printf("marg analysis not selling: %v", err)
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

// GET /admin/marg-stock/batches/{id} — one stock batch (Marg stock id): its
// opening, every bill line that moved it, and how that compares with
// Marg's current stock.
func BatchHistoryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
		if err != nil {
			http.Error(w, "invalid batch", http.StatusBadRequest)
			return
		}
		out, err := margede.GetBatchHistory(r.Context(), db, id)
		if errors.Is(err, margede.ErrBatchNotFound) {
			http.Error(w, "batch not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("marg batch %d history: %v", id, err)
			http.Error(w, "could not load batch", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// GET /admin/partners/{id}/rate-history?products=<uuid>,<uuid>&exclude_order=<uuid>
// — what the partner was charged before for each product: Marg sale bills
// and earlier app orders. For the order page's rate column.
func RateHistoryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partnerID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid partner id", http.StatusBadRequest)
			return
		}
		var products []string
		for _, p := range strings.Split(r.URL.Query().Get("products"), ",") {
			if _, err := uuid.Parse(strings.TrimSpace(p)); err == nil {
				products = append(products, strings.TrimSpace(p))
			}
		}
		var exclude *uuid.UUID
		if e, err := uuid.Parse(r.URL.Query().Get("exclude_order")); err == nil {
			exclude = &e
		}
		out, err := margede.GetRateHistory(r.Context(), db, partnerID, products, exclude, 100)
		if err != nil {
			log.Printf("rate history %s: %v", partnerID, err)
			http.Error(w, "could not load rate history", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// GET /admin/marg-analysis/demand — every product's monthly consumption
// (2, 3, 6 and 12-month averages), usable stock, days of cover, and whether
// it needs ordering (under 90 days at the 3-month average).
func AnalysisDemandHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		shelf := margede.DefaultShelfDays
		if v, err := strconv.Atoi(r.URL.Query().Get("shelf")); err == nil {
			shelf = v
		}
		out, err := margede.Demand(r.Context(), db, margede.DemandOptions{ShelfDays: shelf})
		if err != nil {
			log.Printf("marg analysis demand: %v", err)
			http.Error(w, "could not load demand analysis", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

// GET /admin/marg-analysis/products/{pid}/expiry?shelf=90 — the product's
// demand row with every batch in stock and whether it sells before expiry.
func ProductExpiryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, err := strconv.ParseInt(mux.Vars(r)["pid"], 10, 64)
		if err != nil {
			http.Error(w, "invalid product", http.StatusBadRequest)
			return
		}
		shelf := margede.DefaultShelfDays
		if v, err := strconv.Atoi(r.URL.Query().Get("shelf")); err == nil {
			shelf = v
		}
		out, err := margede.Demand(r.Context(), db, margede.DemandOptions{Product: &pid, ShelfDays: shelf, AllBatches: true})
		if err != nil {
			log.Printf("product %d expiry: %v", pid, err)
			http.Error(w, "could not load expiry outlook", http.StatusInternalServerError)
			return
		}
		resp := map[string]any{"shelf_days": out.ShelfDays, "months": out.Months, "row": nil}
		if len(out.Rows) > 0 {
			resp["row"] = out.Rows[0]
		}
		writeJSON(w, resp)
	}
}
