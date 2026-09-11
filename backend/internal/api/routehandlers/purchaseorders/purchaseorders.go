// Package purchaseorders now only serves the "last PO for this product"
// lookup used by the new-PO form's preview/prefill. The live purchase_orders
// table it used to CRUD against has been dropped — new POs are created
// directly into purchase_order_master (see purchaseordermaster.CreateHandler)
// and this lookup queries that table (models.GetLastMasterPOByProductName).
package purchaseorders

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// GET /admin/purchase-orders/last-by-product?product_name=...
func LastByProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productName := r.URL.Query().Get("product_name")
		w.Header().Set("Content-Type", "application/json")

		po, err := models.GetLastMasterPOByProductName(r.Context(), db, productName)
		if err != nil || po == nil {
			w.Write([]byte("null"))
			return
		}
		json.NewEncoder(w).Encode(po)
	}
}
