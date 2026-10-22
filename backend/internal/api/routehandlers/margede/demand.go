package margede

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// Working through the Demand & reorder list: link purchase orders, snooze,
// remarks. Reading the history needs marg_analysis_view; everything that
// writes needs marg_demand_edit (routes.go).

// demandPID reads {pid}; staffUser is the acting user. Both answer the error.
func demandPID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	pid, err := strconv.ParseInt(mux.Vars(r)["pid"], 10, 64)
	if err != nil {
		http.Error(w, "invalid product", http.StatusBadRequest)
		return 0, false
	}
	return pid, true
}

func staffUser(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	s, _ := r.Context().Value("user_id").(string)
	id, err := uuid.Parse(s)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return uuid.Nil, false
	}
	return id, true
}

// GET /admin/marg-analysis/demand/{pid}/history — remarks, snoozes and PO
// links of a product, newest first.
func DemandHistoryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		out, err := margede.DemandHistory(r.Context(), db, pid)
		if err != nil {
			log.Printf("demand history %d: %v", pid, err)
			http.Error(w, "could not load history", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// GET /admin/marg-analysis/demand/po-search?q= — purchase orders to link.
func DemandPOSearchHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := margede.SearchPOs(r.Context(), db, r.URL.Query().Get("q"))
		if err != nil {
			log.Printf("demand po search: %v", err)
			http.Error(w, "could not search purchase orders", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// POST /admin/marg-analysis/demand/{pid}/pos {po_number}
func DemandLinkPOHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		by, ok := staffUser(w, r)
		if !ok {
			return
		}
		var req struct {
			PONumber string `json:"po_number"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.PONumber) == "" {
			http.Error(w, "po_number is required", http.StatusBadRequest)
			return
		}
		err := margede.LinkPO(r.Context(), db, pid, req.PONumber, by)
		if errors.Is(err, margede.ErrPONotFound) {
			http.Error(w, "There is no purchase order with that number", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("demand link po %d: %v", pid, err)
			http.Error(w, "could not link the purchase order", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"message": "linked"})
	}
}

// DELETE /admin/marg-analysis/demand/{pid}/pos/{linkId}
func DemandUnlinkPOHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		by, ok := staffUser(w, r)
		if !ok {
			return
		}
		linkID, err := strconv.ParseInt(mux.Vars(r)["linkId"], 10, 64)
		if err != nil {
			http.Error(w, "invalid link", http.StatusBadRequest)
			return
		}
		err = margede.UnlinkPO(r.Context(), db, pid, linkID, by)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "link not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("demand unlink po %d/%d: %v", pid, linkID, err)
			http.Error(w, "could not unlink", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"message": "unlinked"})
	}
}

// POST /admin/marg-analysis/demand/{pid}/remarks {body}
func DemandAddRemarkHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		by, ok := staffUser(w, r)
		if !ok {
			return
		}
		var req struct {
			Body string `json:"body"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Body) == "" {
			http.Error(w, "remark is empty", http.StatusBadRequest)
			return
		}
		if len(req.Body) > 2000 {
			http.Error(w, "remark is too long", http.StatusBadRequest)
			return
		}
		if err := margede.AddRemark(r.Context(), db, pid, req.Body, by); err != nil {
			log.Printf("demand remark %d: %v", pid, err)
			http.Error(w, "could not save the remark", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"message": "saved"})
	}
}

// DELETE /admin/marg-analysis/demand/{pid}/remarks/{id} — own remarks only.
func DemandDeleteRemarkHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		by, ok := staffUser(w, r)
		if !ok {
			return
		}
		id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
		if err != nil {
			http.Error(w, "invalid remark", http.StatusBadRequest)
			return
		}
		err = margede.DeleteRemark(r.Context(), db, pid, id, by)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "You can only delete your own remarks", http.StatusForbidden)
			return
		}
		if err != nil {
			log.Printf("demand delete remark %d/%d: %v", pid, id, err)
			http.Error(w, "could not delete the remark", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"message": "deleted"})
	}
}

// POST /admin/marg-analysis/demand/{pid}/snooze {until: "yyyy-mm-dd", reason}
func DemandSnoozeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		by, ok := staffUser(w, r)
		if !ok {
			return
		}
		var req struct {
			Until  string `json:"until"`
			Reason string `json:"reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		until, err := time.Parse("2006-01-02", req.Until)
		if err != nil || !until.After(time.Now()) || until.After(time.Now().AddDate(1, 0, 0)) {
			http.Error(w, "Pick a date after today and within a year", http.StatusBadRequest)
			return
		}
		if len(req.Reason) > 2000 {
			http.Error(w, "reason is too long", http.StatusBadRequest)
			return
		}
		if err := margede.Snooze(r.Context(), db, pid, until, req.Reason, by); err != nil {
			log.Printf("demand snooze %d: %v", pid, err)
			http.Error(w, "could not snooze", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"message": "snoozed"})
	}
}

// POST /admin/marg-analysis/demand/{pid}/unsnooze
func DemandUnsnoozeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, ok := demandPID(w, r)
		if !ok {
			return
		}
		by, ok := staffUser(w, r)
		if !ok {
			return
		}
		if err := margede.Unsnooze(r.Context(), db, pid, by); err != nil {
			log.Printf("demand unsnooze %d: %v", pid, err)
			http.Error(w, "could not unsnooze", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"message": "unsnoozed"})
	}
}
