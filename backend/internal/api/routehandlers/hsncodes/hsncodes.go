// Package hsncodes serves lookups against the HSN/SAC reference master.
package hsncodes

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// GET /admin/hsn-codes/{code}  — also accepts /admin/hsn-codes?code=...
// Returns the code's details as JSON, with its parent chain so a valid code
// that isn't in the sheet still resolves to something useful.
func LookupHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := mux.Vars(r)["code"]
		if code == "" {
			code = r.URL.Query().Get("code")
		}
		if code == "" {
			http.Error(w, "code is required", http.StatusBadRequest)
			return
		}
		result, err := models.LookupHsnCode(r.Context(), db, code)
		if err != nil {
			log.Printf("hsn lookup %q: %v", code, err)
			http.Error(w, "could not look up hsn code", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}

// GET /admin/hsn-codes/browse — paginated list with filters, for the
// browse screen. Returns the rate options too so the UI needs one call.
func BrowseHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		f := models.HsnBrowseFilters{
			Query:  q.Get("q"),
			HasGST: q.Get("has_gst"),
		}
		f.Page, _ = strconv.Atoi(q.Get("page"))
		f.Limit, _ = strconv.Atoi(q.Get("limit"))
		if lv, err := strconv.Atoi(q.Get("level")); err == nil {
			f.Level = lv
		}
		if rt := q.Get("rate"); rt != "" {
			if v, err := strconv.ParseFloat(rt, 64); err == nil {
				f.Rate = &v
			}
		}

		items, total, err := models.BrowseHsnCodes(r.Context(), db, f)
		if err != nil {
			log.Printf("hsn browse: %v", err)
			http.Error(w, "could not load hsn codes", http.StatusInternalServerError)
			return
		}
		rates, err := models.DistinctGstRates(r.Context(), db)
		if err != nil {
			log.Printf("hsn rates: %v", err)
			rates = nil
		}
		limit := f.Limit
		if limit < 1 || limit > 200 {
			limit = 50
		}
		pages := (total + limit - 1) / limit
		writeJSON(w, http.StatusOK, map[string]any{
			"items": items, "total": total, "page": max(f.Page, 1),
			"limit": limit, "total_pages": pages, "rate_options": rates,
		})
	}
}
