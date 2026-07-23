package products

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// POST /products/{id}/view — record that the current user viewed this
// product. Fire-and-forget from the client; best-effort, not part of the
// public product-detail response so an anonymous/failed call never blocks
// viewing the page itself.
func RecordProductViewHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		if err := models.RecordProductView(r.Context(), db, getUserID(r), productID); err != nil {
			log.Printf("record product view error: %v", err)
			http.Error(w, "could not record view", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /recently-viewed — the current user's last-viewed products, most
// recent first, capped at 25.
func ListRecentlyViewedHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recent, err := models.GetRecentlyViewedProducts(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list recently viewed error: %v", err)
			http.Error(w, "could not fetch recently viewed", http.StatusInternalServerError)
			return
		}
		loadProductRelationsBatch(r, db, recent)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(recent)
	}
}
