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

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// GET /favorites — the current user's favorited products, fully assembled
// (images/documents/categories) the same way the product list is.
func ListFavoritesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		favs, err := models.GetFavoriteProducts(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list favorites error: %v", err)
			http.Error(w, "could not fetch favorites", http.StatusInternalServerError)
			return
		}
		loadProductRelationsBatch(r, db, favs)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(favs)
	}
}

// GET /favorites/ids — lightweight list of favorited product IDs, for
// showing the star as filled on product cards/detail without fetching
// full product payloads.
func ListFavoriteIDsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ids, err := models.GetFavoriteProductIDs(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list favorite ids error: %v", err)
			http.Error(w, "could not fetch favorites", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ids)
	}
}

// POST /favorites/{id} — favorite a product
func AddFavoriteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		if err := models.AddFavorite(r.Context(), db, getUserID(r), productID); err != nil {
			log.Printf("add favorite error: %v", err)
			http.Error(w, "could not add favorite", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "favorited"})
	}
}

// DELETE /favorites/{id} — unfavorite a product
func RemoveFavoriteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		if err := models.RemoveFavorite(r.Context(), db, getUserID(r), productID); err != nil {
			log.Printf("remove favorite error: %v", err)
			http.Error(w, "could not remove favorite", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "unfavorited"})
	}
}
