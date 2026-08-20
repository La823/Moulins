package margmaster

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

const marginProductsPageSize = 50
const margPartiesPageSize = 50

// GET /admin/marg-products?search=&company=&page= — one page (50 per page)
// of deduped Marg products, each with its batch rows (and per-batch stock)
// nested under "batches", plus the total matching count and the full list
// of companies for the filter dropdown.
func ListProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := r.URL.Query().Get("search")
		company := r.URL.Query().Get("company")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		offset := (page - 1) * marginProductsPageSize

		result, err := models.GetMargProductsWithBatches(r.Context(), db, search, company, marginProductsPageSize, offset)
		if err != nil {
			log.Printf("list marg products error: %v", err)
			http.Error(w, "could not fetch marg products", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"products":  result.Products,
			"total":     result.Total,
			"page":      page,
			"page_size": marginProductsPageSize,
			"companies": result.Companies,
		})
	}
}

// GET /admin/marg-parties?search=&page= — one page (50 per page) of synced
// Marg party/ledger accounts, plus the total matching count.
func ListPartiesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := r.URL.Query().Get("search")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		offset := (page - 1) * margPartiesPageSize

		result, err := models.GetMargParties(r.Context(), db, search, margPartiesPageSize, offset)
		if err != nil {
			log.Printf("list marg parties error: %v", err)
			http.Error(w, "could not fetch marg parties", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"parties":   result.Parties,
			"total":     result.Total,
			"page":      page,
			"page_size": margPartiesPageSize,
		})
	}
}
