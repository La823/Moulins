package margmaster

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
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
		catalogStatus := r.URL.Query().Get("catalogStatus")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		offset := (page - 1) * marginProductsPageSize

		result, err := models.GetMargProductsWithBatches(r.Context(), db, search, company, catalogStatus, marginProductsPageSize, offset)
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

// PUT /admin/marg-parties/{id}/status — marks a synced party active or
// duplicate. Marg's party list accumulates duplicates and we cannot clean
// them up on their side, so the flag lives here; the sync never overwrites
// it, so it survives the next pull.
func UpdatePartyStatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid party id", http.StatusBadRequest)
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if !models.MargPartyStatuses[body.Status] {
			http.Error(w, "status must be \"active\" or \"duplicate\"", http.StatusBadRequest)
			return
		}

		if err := models.SetMargPartyStatus(r.Context(), db, id, body.Status); err != nil {
			log.Printf("update marg party status: %v", err)
			http.Error(w, "could not update status", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated", "status": body.Status})
	}
}

// GET /admin/products/{id}/batches — the product's live Marg batches, each
// with its code, expiry, stock and MRP, ordered FEFO (earliest expiry first).
//
// Feeds the MRP picker on the product page: staff choose a batch and its MRP
// is written into products.mrp, which stays the one place a product's MRP
// lives. The first entry is the FEFO batch, which is the sensible default.
func ProductBatchesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		codes, err := models.GetProductMargCodesBatch(r.Context(), db, []uuid.UUID{id})
		if err != nil {
			log.Printf("product batches: marg code lookup: %v", err)
			http.Error(w, "could not load batches", http.StatusInternalServerError)
			return
		}
		baseCode, ok := codes[id]
		if !ok || baseCode == "" {
			// Not linked to Marg, so there are no batches to choose from.
			// An empty list, not an error — the picker just has nothing to show.
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"batches": []any{}})
			return
		}

		batches, err := models.GetLiveMargBatchesByBaseCode(r.Context(), db, baseCode)
		if err != nil {
			log.Printf("product batches: %v", err)
			http.Error(w, "could not load batches", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"batches": batches})
	}
}

// PUT /admin/products/{id}/batches/{batchId}/current — makes a batch the
// product's current batch and copies its MRP into products.mrp. It stays
// current until it sells out, at which point the next sync moves the flag on
// to the next batch in FEFO order.
func SetCurrentBatchHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		productID, err := uuid.Parse(vars["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		batchID, err := uuid.Parse(vars["batchId"])
		if err != nil {
			http.Error(w, "invalid batch id", http.StatusBadRequest)
			return
		}

		switch err := models.SetCurrentBatch(r.Context(), db, productID, batchID); {
		case errors.Is(err, models.ErrBatchNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		case errors.Is(err, models.ErrBatchNoStock):
			http.Error(w, "this batch has no stock, so it cannot be the current batch", http.StatusBadRequest)
			return
		case err != nil:
			log.Printf("set current batch: %v", err)
			http.Error(w, "could not set the current batch", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}
