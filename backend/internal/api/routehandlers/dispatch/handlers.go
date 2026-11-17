// Package dispatch serves the dispatch team's rotation and freight bills
// (internal/dispatch, migration 190).
package dispatch

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lavanyaarora/server/internal/dispatch"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

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

func can(r *http.Request, db *pgxpool.Pool, permission string) bool {
	if isAdmin(r) {
		return true
	}
	ok, err := models.HasPermission(r.Context(), db, userID(r), permission)
	return err == nil && ok
}

func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return uuid.Nil, false
	}
	return id, true
}

func serverError(w http.ResponseWriter, what string, err error) {
	log.Printf("dispatch %s: %v", what, err)
	http.Error(w, "Something went wrong; please try again.", http.StatusInternalServerError)
}

// GET /admin/dispatch/packers — the dispatch team with today's attendance,
// whether each is in the rotation, and their open orders (any staff login:
// the reassign picker and the team page use it).
func PackersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := dispatch.Packers(r.Context(), db)
		if err != nil {
			serverError(w, "packers", err)
			return
		}
		writeJSON(w, map[string]any{"packers": list})
	}
}

// PUT /admin/dispatch/packers/{id}/rotation {skip} — take a member out of
// the rotation or back in (employees_edit).
func SetRotationHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var body struct {
			Skip bool `json:"skip"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := dispatch.SetSkip(r.Context(), db, id, body.Skip); err != nil {
			if errors.Is(err, dispatch.ErrNotPacker) {
				http.Error(w, "That login does not pack orders.", http.StatusNotFound)
				return
			}
			serverError(w, "rotation", err)
			return
		}
		writeJSON(w, map[string]bool{"skip": body.Skip})
	}
}

// PUT /admin/orders/{id}/packing-assignee {user_id} — hand an order to
// another packer, or "" to leave it unassigned (orders_edit).
func AssignHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, ok := pathID(w, r)
		if !ok {
			return
		}
		var body struct {
			UserID string `json:"user_id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		to := uuid.Nil
		if body.UserID != "" {
			var err error
			if to, err = uuid.Parse(body.UserID); err != nil {
				http.Error(w, "invalid user id", http.StatusBadRequest)
				return
			}
		}
		if err := dispatch.Assign(r.Context(), db, orderID, to); err != nil {
			if errors.Is(err, dispatch.ErrNotPacker) {
				http.Error(w, "That login does not pack orders.", http.StatusBadRequest)
				return
			}
			serverError(w, "assign", err)
			return
		}
		desc := "Packing unassigned"
		if to != uuid.Nil {
			name := to.String()
			if u, err := models.GetUserByID(r.Context(), db, to); err == nil {
				if u.Username != nil && *u.Username != "" {
					name = *u.Username
				} else if u.PhoneNumber != "" {
					name = u.PhoneNumber
				}
			}
			desc = "Packing assigned to " + name
		}
		actor := userID(r)
		_ = models.InsertOrderEvent(r.Context(), db, orderID, "packing.assigned", desc, &actor)
		writeJSON(w, map[string]string{"user_id": body.UserID})
	}
}

// --- freight bills ---

// Who sees which bills: freight_bills_view (and admins) see every bill;
// freight_bills_edit alone sees the bills they added. Admins change or
// remove any bill; others only their own.

func freightScope(w http.ResponseWriter, r *http.Request, db *pgxpool.Pool) (all, ok bool) {
	if can(r, db, "freight_bills_view") {
		return true, true
	}
	if can(r, db, "freight_bills_edit") {
		return false, true
	}
	http.Error(w, "you don't have permission to access this", http.StatusForbidden)
	return false, false
}

func freightFail(w http.ResponseWriter, what string, err error) {
	var inv dispatch.ErrInvalid
	switch {
	case errors.As(err, &inv):
		http.Error(w, inv.Msg, http.StatusBadRequest)
	case errors.Is(err, dispatch.ErrFreightNotFound):
		http.Error(w, "That freight bill was not found (or it isn't yours).", http.StatusNotFound)
	default:
		serverError(w, "freight "+what, err)
	}
}

func parseDate(s string) *time.Time {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t
	}
	return nil
}

// GET /admin/freight-bills?from&to&q&mine=1
func ListFreightHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		all, ok := freightScope(w, r, db)
		if !ok {
			return
		}
		q := r.URL.Query()
		f := dispatch.FreightFilter{From: parseDate(q.Get("from")), To: parseDate(q.Get("to")), Search: q.Get("q")}
		if !all || q.Get("mine") == "1" {
			f.CreatedBy = userID(r)
		}
		list, err := dispatch.ListFreightBills(r.Context(), db, f)
		if err != nil {
			freightFail(w, "list", err)
			return
		}
		writeJSON(w, map[string]any{"bills": list.Bills, "total": list.Total, "count": list.Count, "all": all})
	}
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// POST /admin/freight-bills/upload-url {filename} — where the app or page
// puts the bill's photo or PDF before saving the bill (freight_bills_edit).
func FreightUploadURLHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !can(r, db, "freight_bills_edit") {
			http.Error(w, "you don't have permission to access this", http.StatusForbidden)
			return
		}
		var body struct {
			Filename string `json:"filename"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 2048)).Decode(&body)
		name := strings.Trim(unsafeName.ReplaceAllString(body.Filename, "_"), "._")
		if name == "" {
			name = "bill.jpg"
		}
		if len(name) > 80 {
			name = name[len(name)-80:]
		}
		uploadURL, key, err := utils.GeneratePresignedFreightBillUploadURL(name)
		if err != nil {
			serverError(w, "upload url", err)
			return
		}
		writeJSON(w, map[string]string{"upload_url": uploadURL, "key": key, "public_url": utils.GetPublicURL(key)})
	}
}

func decodeFreight(w http.ResponseWriter, r *http.Request) (dispatch.FreightInput, bool) {
	var in dispatch.FreightInput
	if err := json.NewDecoder(io.LimitReader(r.Body, 16*1024)).Decode(&in); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return in, false
	}
	return in, true
}

// POST /admin/freight-bills (freight_bills_edit)
func CreateFreightHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !can(r, db, "freight_bills_edit") {
			http.Error(w, "you don't have permission to access this", http.StatusForbidden)
			return
		}
		in, ok := decodeFreight(w, r)
		if !ok {
			return
		}
		id, err := dispatch.CreateFreightBill(r.Context(), db, userID(r), in)
		if err != nil {
			freightFail(w, "create", err)
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]string{"id": id})
	}
}

// onlyBy: uuid.Nil for admins (any bill), else the caller (their own bills).
func onlyBy(r *http.Request) uuid.UUID {
	if isAdmin(r) {
		return uuid.Nil
	}
	return userID(r)
}

// PUT /admin/freight-bills/{id}
func UpdateFreightHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if !can(r, db, "freight_bills_edit") {
			http.Error(w, "you don't have permission to access this", http.StatusForbidden)
			return
		}
		in, ok := decodeFreight(w, r)
		if !ok {
			return
		}
		if err := dispatch.UpdateFreightBill(r.Context(), db, id, onlyBy(r), in); err != nil {
			freightFail(w, "update", err)
			return
		}
		writeJSON(w, map[string]string{"id": id.String()})
	}
}

// DELETE /admin/freight-bills/{id}
func DeleteFreightHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if !can(r, db, "freight_bills_edit") {
			http.Error(w, "you don't have permission to access this", http.StatusForbidden)
			return
		}
		if err := dispatch.DeleteFreightBill(r.Context(), db, id, onlyBy(r)); err != nil {
			freightFail(w, "delete", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
