package cart

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// rawUserID is the actual logged-in user's own id — a cart is personal,
// not pooled across a team like doctors/meetings, so no ResolveOwnerID.
func rawUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// GET /cart
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := models.GetCartItems(r.Context(), db, rawUserID(r))
		if err != nil {
			log.Printf("cart list error: %v", err)
			http.Error(w, "could not fetch cart", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"items": items})
	}
}

type addCartItemRequest struct {
	ProductID uuid.UUID `json:"product_id"`
	Quantity  int       `json:"quantity"`
}

// POST /cart/items
func AddHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req addCartItemRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ProductID == uuid.Nil {
			http.Error(w, "product_id is required", http.StatusBadRequest)
			return
		}
		if req.Quantity < 1 {
			req.Quantity = 1
		}

		if err := models.UpsertCartItem(r.Context(), db, rawUserID(r), req.ProductID, req.Quantity); err != nil {
			log.Printf("cart add error: %v", err)
			http.Error(w, "could not add to cart", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

type updateCartItemRequest struct {
	Quantity int `json:"quantity"`
}

// PATCH /cart/items/{productId}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		var req updateCartItemRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Quantity < 1 {
			http.Error(w, "quantity must be at least 1", http.StatusBadRequest)
			return
		}

		if err := models.UpdateCartItemQuantity(r.Context(), db, rawUserID(r), productID, req.Quantity); err != nil {
			log.Printf("cart update error: %v", err)
			http.Error(w, "could not update cart item", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /cart/items/{productId}
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteCartItem(r.Context(), db, rawUserID(r), productID); err != nil {
			log.Printf("cart delete error: %v", err)
			http.Error(w, "could not remove cart item", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /cart — manual full clear (e.g. a "clear cart" button), separate
// from the automatic clear that happens transactionally when an order is
// placed (models.ClearCart, called from models.CreateOrder).
func ClearHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := models.DeleteAllCartItems(r.Context(), db, rawUserID(r)); err != nil {
			log.Printf("cart clear error: %v", err)
			http.Error(w, "could not clear cart", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
