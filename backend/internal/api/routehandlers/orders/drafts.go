package orders

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// Unfinished staff orders (models/orderDraftModel.go). The staff order page
// saves its state here as it changes; every staff member with order access
// sees every draft. Placing the order deletes it (draft_id on POST /admin/orders).

// GET /admin/order-drafts — every draft, last changed first.
func ListOrderDraftsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ds, err := models.ListOrderDrafts(r.Context(), db)
		if err != nil {
			log.Printf("list order drafts: %v", err)
			http.Error(w, "could not load drafts", http.StatusInternalServerError)
			return
		}
		writeQuickJSON(w, map[string]any{"drafts": ds})
	}
}

// GET /admin/order-drafts/{id} — one draft with what has been built so far.
func GetOrderDraftHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid draft id", http.StatusBadRequest)
			return
		}
		d, err := models.GetOrderDraft(r.Context(), db, id)
		if errors.Is(err, models.ErrDraftNotFound) {
			http.Error(w, "this draft was placed or discarded", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("get order draft: %v", err)
			http.Error(w, "could not load the draft", http.StatusInternalServerError)
			return
		}
		writeQuickJSON(w, d)
	}
}

type draftBody struct {
	CustomerID *uuid.UUID      `json:"customer_id"`
	Data       json.RawMessage `json:"data"`
	ItemCount  int             `json:"item_count"`
}

func readDraft(w http.ResponseWriter, r *http.Request) (draftBody, bool) {
	var b draftBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&b); err != nil || len(b.Data) == 0 || !json.Valid(b.Data) {
		http.Error(w, "invalid draft", http.StatusBadRequest)
		return b, false
	}
	return b, true
}

// POST /admin/order-drafts {customer_id, data, item_count} — starts a draft.
func CreateOrderDraftHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		b, ok := readDraft(w, r)
		if !ok {
			return
		}
		id, err := models.SaveOrderDraft(r.Context(), db, nil, b.CustomerID, b.Data, b.ItemCount, actorID(r))
		if err != nil {
			log.Printf("create order draft: %v", err)
			http.Error(w, "could not save the draft", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// PUT /admin/order-drafts/{id} {customer_id, data, item_count} — saves it again.
func UpdateOrderDraftHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid draft id", http.StatusBadRequest)
			return
		}
		b, ok := readDraft(w, r)
		if !ok {
			return
		}
		_, err = models.SaveOrderDraft(r.Context(), db, &id, b.CustomerID, b.Data, b.ItemCount, actorID(r))
		if errors.Is(err, models.ErrDraftNotFound) {
			http.Error(w, "this draft was placed or discarded", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("update order draft: %v", err)
			http.Error(w, "could not save the draft", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/order-drafts/{id} — discards it.
func DeleteOrderDraftHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid draft id", http.StatusBadRequest)
			return
		}
		if err := models.DeleteOrderDraft(r.Context(), db, id); err != nil {
			log.Printf("delete order draft: %v", err)
			http.Error(w, "could not discard the draft", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
