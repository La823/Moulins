package products

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/middleware"
	"github.com/lavanyaarora/server/internal/models"
)

// Who can see a product — hidden from chosen partners, or exclusive to
// chosen partners. See models/productAccessModel.go for the rule itself.

// GET /admin/products/{id}/access
func GetProductAccessHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		pa, err := models.GetProductAccess(r.Context(), db, id)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("get product access error: %v", err)
			http.Error(w, "could not fetch visibility", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pa)
	}
}

// PUT /admin/products/{id}/access
// body {"exclusive": bool, "hidden_for": [partner ids], "allowed_for": [partner ids]}
// Replaces the product's settings outright.
func SetProductAccessHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req models.SetProductAccessRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		err = models.SetProductAccess(r.Context(), db, id, req, actorID(r))
		var notPartners models.ErrNotPartners
		switch {
		case errors.As(err, &notPartners):
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		case errors.Is(err, pgx.ErrNoRows):
			http.Error(w, "product not found", http.StatusNotFound)
			return
		case err != nil:
			log.Printf("set product access error: %v", err)
			http.Error(w, "could not save visibility", http.StatusInternalServerError)
			return
		}

		// every cached catalogue, and every user's cached scope — whether a
		// partner has rules at all may have just changed
		invalidateProduct(rdb, r, id)
		middleware.InvalidateProductViewers(r.Context(), rdb)

		summary := fmt.Sprintf("Set visibility: exclusive=%v, hidden from %d, allowed for %d",
			req.Exclusive, len(req.HiddenFor), len(req.AllowedFor))
		models.LogAction(r.Context(), db, actorID(r), "product.access_updated", "product", &id, summary)

		pa, err := models.GetProductAccess(r.Context(), db, id)
		if err != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pa)
	}
}

// GET /admin/partners/{id}/product-access — every product with a rule for
// this partner, for their detail page.
func PartnerProductAccessHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid partner id", http.StatusBadRequest)
			return
		}
		rows, err := models.GetPartnerProductAccess(r.Context(), db, id)
		if err != nil {
			log.Printf("partner product access error: %v", err)
			http.Error(w, "could not fetch product visibility", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rows)
	}
}

// GET /admin/product-access/partners — every partner with how many products
// are hidden from them and how many exclusive ones they're allowed, for the
// product visibility screen.
func PartnerAccessSummariesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := models.ListPartnerAccessSummaries(r.Context(), db)
		if err != nil {
			log.Printf("partner access summaries error: %v", err)
			http.Error(w, "could not fetch partners", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// PUT /admin/partners/{id}/product-access/{productId} — body {"access": "hidden"|"allowed"}
// DELETE the same path to remove the rule.
func SetPartnerProductAccessHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partnerID, productID, ok := partnerAndProduct(w, r)
		if !ok {
			return
		}
		var req struct {
			Access string `json:"access"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Access != "hidden" && req.Access != "allowed" {
			http.Error(w, `access must be "hidden" or "allowed"`, http.StatusBadRequest)
			return
		}
		err := models.SetPartnerProductAccess(r.Context(), db, partnerID, productID, req.Access, actorID(r))
		var notPartners models.ErrNotPartners
		switch {
		case errors.As(err, &notPartners):
			http.Error(w, "that user is not a partner", http.StatusBadRequest)
			return
		case errors.Is(err, pgx.ErrNoRows):
			http.Error(w, "product not found", http.StatusNotFound)
			return
		case err != nil:
			log.Printf("set partner product access error: %v", err)
			http.Error(w, "could not save", http.StatusInternalServerError)
			return
		}
		afterAccessChange(db, rdb, r, productID, fmt.Sprintf("Set %s for partner %s", req.Access, partnerID))
		w.WriteHeader(http.StatusNoContent)
	}
}

func RemovePartnerProductAccessHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partnerID, productID, ok := partnerAndProduct(w, r)
		if !ok {
			return
		}
		if err := models.RemovePartnerProductAccess(r.Context(), db, partnerID, productID); err != nil {
			log.Printf("remove partner product access error: %v", err)
			http.Error(w, "could not remove", http.StatusInternalServerError)
			return
		}
		afterAccessChange(db, rdb, r, productID, fmt.Sprintf("Removed rule for partner %s", partnerID))
		w.WriteHeader(http.StatusNoContent)
	}
}

func partnerAndProduct(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, bool) {
	partnerID, err := uuid.Parse(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "invalid partner id", http.StatusBadRequest)
		return uuid.Nil, uuid.Nil, false
	}
	productID, err := uuid.Parse(mux.Vars(r)["productId"])
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return uuid.Nil, uuid.Nil, false
	}
	return partnerID, productID, true
}

// afterAccessChange drops every cache a visibility change can make stale,
// and records who did it.
func afterAccessChange(db *pgxpool.Pool, rdb *cache.Client, r *http.Request, productID uuid.UUID, summary string) {
	invalidateProduct(rdb, r, productID)
	middleware.InvalidateProductViewers(r.Context(), rdb)
	models.LogAction(r.Context(), db, actorID(r), "product.access_updated", "product", &productID, summary)
}
