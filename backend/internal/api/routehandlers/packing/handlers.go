package packing

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lavanyaarora/server/internal/packing"
)

// Packing routes (packing_edit; admins always): the dispatch team's list of
// orders to pack, one order's lines with their batch checks, and the steps.
// Overriding a mismatch and reopening a packed order are for admins only.

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func userID(r *http.Request) uuid.UUID {
	s, _ := r.Context().Value("user_id").(string)
	id, _ := uuid.Parse(s)
	return id
}

func isAdmin(r *http.Request) bool {
	role, _ := r.Context().Value("role").(string)
	return role == "admin"
}

func ids(w http.ResponseWriter, r *http.Request, withItem bool) (orderID, itemID uuid.UUID, ok bool) {
	v := mux.Vars(r)
	orderID, err := uuid.Parse(v["id"])
	if err != nil {
		http.Error(w, "invalid order id", http.StatusBadRequest)
		return
	}
	if withItem {
		if itemID, err = uuid.Parse(v["itemId"]); err != nil {
			http.Error(w, "invalid item id", http.StatusBadRequest)
			return
		}
	}
	return orderID, itemID, true
}

// fail turns a packing error into a response a person can act on.
func fail(w http.ResponseWriter, what string, err error) {
	switch {
	case errors.Is(err, packing.ErrNotFound):
		http.Error(w, "That order or product was not found.", http.StatusNotFound)
	case errors.Is(err, packing.ErrNotPackable):
		http.Error(w, "This order is not waiting to be packed (only orders Sent to packing are packed).", http.StatusConflict)
	case errors.Is(err, packing.ErrNotChecked):
		http.Error(w, "This product can be ticked once a photo of its batch matches. Take the photo (again), or ask an admin to allow it.", http.StatusConflict)
	case errors.Is(err, packing.ErrNotAllDone):
		http.Error(w, "Every product must be ticked before the order is marked Packed.", http.StatusConflict)
	default:
		log.Printf("packing %s: %v", what, err)
		http.Error(w, "Something went wrong; please try again.", http.StatusInternalServerError)
	}
}

// GET /admin/packing/orders?view=to_pack|packed
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := packing.List(r.Context(), db, r.URL.Query().Get("view"), userID(r))
		if err != nil {
			fail(w, "list", err)
			return
		}
		writeJSON(w, map[string]any{"orders": rows})
	}
}

// GET /admin/packing/orders/{id} (and /admin/orders/{id}/packing for orders_view)
func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, _, ok := ids(w, r, false)
		if !ok {
			return
		}
		o, err := packing.Get(r.Context(), db, orderID)
		if err != nil {
			fail(w, "get", err)
			return
		}
		writeJSON(w, o)
	}
}

// POST /admin/packing/orders/{id}/items/{itemId}/photo — multipart "photo"
func PhotoHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, itemID, ok := ids(w, r, true)
		if !ok {
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 12<<20)
		if err := r.ParseMultipartForm(12 << 20); err != nil {
			http.Error(w, "The photo is too large or did not arrive; please try again.", http.StatusBadRequest)
			return
		}
		f, _, err := r.FormFile("photo")
		if err != nil {
			http.Error(w, "No photo was sent.", http.StatusBadRequest)
			return
		}
		defer f.Close()
		data, err := io.ReadAll(f)
		if err != nil || len(data) == 0 {
			http.Error(w, "The photo could not be read; please try again.", http.StatusBadRequest)
			return
		}
		mime := http.DetectContentType(data)
		if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
			http.Error(w, "Please send a JPEG or PNG photo.", http.StatusBadRequest)
			return
		}
		res, err := packing.CheckPhoto(r.Context(), db, orderID, itemID, userID(r), data, mime)
		if err != nil {
			fail(w, "photo", err)
			return
		}
		writeJSON(w, res)
	}
}

// POST /admin/packing/orders/{id}/items/{itemId}/typed {batch, expiry}
func TypedHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, itemID, ok := ids(w, r, true)
		if !ok {
			return
		}
		var body struct {
			Batch  string `json:"batch"`
			Expiry string `json:"expiry"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil || strings.TrimSpace(body.Batch) == "" {
			http.Error(w, "Please type the batch number.", http.StatusBadRequest)
			return
		}
		res, err := packing.CheckTyped(r.Context(), db, orderID, itemID, userID(r), body.Batch, body.Expiry)
		if err != nil {
			fail(w, "typed", err)
			return
		}
		writeJSON(w, res)
	}
}

// PUT /admin/packing/orders/{id}/items/{itemId}/packed {packed}
func PackedHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, itemID, ok := ids(w, r, true)
		if !ok {
			return
		}
		var body struct {
			Packed bool `json:"packed"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := packing.SetPacked(r.Context(), db, orderID, itemID, userID(r), body.Packed); err != nil {
			fail(w, "packed", err)
			return
		}
		writeJSON(w, map[string]bool{"packed": body.Packed})
	}
}

// POST /admin/packing/orders/{id}/items/{itemId}/override {reason} — admins
func OverrideHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isAdmin(r) {
			http.Error(w, "Only an admin can allow a batch that does not match.", http.StatusForbidden)
			return
		}
		orderID, itemID, ok := ids(w, r, true)
		if !ok {
			return
		}
		var body struct {
			Reason string `json:"reason"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			http.Error(w, "Please give a reason for allowing it.", http.StatusBadRequest)
			return
		}
		if err := packing.Override(r.Context(), db, orderID, itemID, userID(r), reason); err != nil {
			fail(w, "override", err)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	}
}

// POST /admin/packing/orders/{id}/finish
func FinishHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, _, ok := ids(w, r, false)
		if !ok {
			return
		}
		if err := packing.Finish(r.Context(), db, orderID, userID(r)); err != nil {
			fail(w, "finish", err)
			return
		}
		writeJSON(w, map[string]string{"status": "packed"})
	}
}

// POST /admin/packing/orders/{id}/reopen {reason} — admins
func ReopenHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isAdmin(r) {
			http.Error(w, "Only an admin can reopen a packed order.", http.StatusForbidden)
			return
		}
		orderID, _, ok := ids(w, r, false)
		if !ok {
			return
		}
		var body struct {
			Reason string `json:"reason"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
		if err := packing.Reopen(r.Context(), db, orderID, userID(r), strings.TrimSpace(body.Reason)); err != nil {
			if errors.Is(err, packing.ErrNotPackable) {
				http.Error(w, "Only a Packed order can be reopened.", http.StatusConflict)
				return
			}
			fail(w, "reopen", err)
			return
		}
		writeJSON(w, map[string]string{"status": packing.StatusToPack})
	}
}
