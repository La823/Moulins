// Package visitors serves the "become a partner" requests visitors send in,
// and the staff page that works through them.
package visitors

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/services"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func requestUserID(r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(fmt.Sprint(r.Context().Value("user_id")))
	return id, err == nil
}

// GET /visitor/partnership-request — the visitor's latest request, or null.
func MyRequestHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := requestUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		req, err := models.LatestPartnershipRequest(r.Context(), db, id)
		if err != nil {
			log.Printf("my partnership request error: %v", err)
			http.Error(w, "could not load your request", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, req)
	}
}

// an Indian mobile or landline, with or without +91 / 0 and spaces or dashes
var phonePattern = regexp.MustCompile(`^\+?[0-9][0-9 \-]{8,15}[0-9]$`)

// POST /visitor/partnership-request
// { "firm_name", "contact_name", "phone", "city", "message" } — firm and
// phone required. Staff are pinged in the app.
func CreateRequestHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
		id, ok := requestUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req models.NewPartnershipRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		req.FirmName, req.Phone = strings.TrimSpace(req.FirmName), strings.TrimSpace(req.Phone)
		switch {
		case req.FirmName == "":
			http.Error(w, "Please enter your shop or firm name", http.StatusBadRequest)
			return
		case !phonePattern.MatchString(req.Phone):
			http.Error(w, "Please enter a valid phone number", http.StatusBadRequest)
			return
		case len(req.FirmName) > 200 || len(req.ContactName) > 200 || len(req.City) > 100 || len(req.Message) > 2000:
			http.Error(w, "That's too long — please shorten it", http.StatusBadRequest)
			return
		}
		reqID, err := models.CreatePartnershipRequest(r.Context(), db, id, req)
		if errors.Is(err, models.ErrRequestAlreadyOpen) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if err != nil {
			log.Printf("create partnership request error: %v", err)
			http.Error(w, "could not send your request", http.StatusInternalServerError)
			return
		}
		notifyStaff(db, req)
		writeJSON(w, http.StatusCreated, map[string]int64{"id": reqID})
	}
}

// notifyStaff tells every admin and employee in the app, the way a new
// order does.
func notifyStaff(db *pgxpool.Pool, req models.NewPartnershipRequest) {
	go func() {
		ctx := context.Background()
		staff, err := models.GetStaffUserIDs(ctx, db)
		if err != nil {
			log.Printf("partnership request notification: failed to list staff: %v", err)
			return
		}
		body := req.FirmName
		if c := strings.TrimSpace(req.City); c != "" {
			body += ", " + c
		}
		body += " wants to become a partner"
		deepLink := "/panel/partnership-requests"
		for _, uid := range staff {
			if err := services.SendDirectNotification(ctx, db, uid, "New partnership request", body, &deepLink); err != nil {
				log.Printf("partnership request notification: send to %s failed: %v", uid, err)
			}
		}
	}()
}

// GET /admin/partnership-requests?status=new
func AdminListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		if status != "" && !models.PartnershipRequestStatuses[status] {
			http.Error(w, "invalid status", http.StatusBadRequest)
			return
		}
		list, err := models.ListPartnershipRequests(r.Context(), db, status)
		if err != nil {
			log.Printf("list partnership requests error: %v", err)
			http.Error(w, "could not load requests", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// PATCH /admin/partnership-requests/{id}  { "status": "contacted", "staff_note": "..." }
func AdminUpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		staffID, ok := requestUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req struct {
			Status    *string `json:"status"`
			StaffNote *string `json:"staff_note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.Status == nil && req.StaffNote == nil {
			http.Error(w, "send status and/or staff_note", http.StatusBadRequest)
			return
		}
		if req.Status != nil && !models.PartnershipRequestStatuses[*req.Status] {
			http.Error(w, "invalid status", http.StatusBadRequest)
			return
		}
		err = models.UpdatePartnershipRequest(r.Context(), db, id, req.Status, req.StaffNote, staffID)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "request not found", http.StatusNotFound)
			return
		}
		if err != nil {
			// reopening while the visitor has sent a newer open request
			if strings.Contains(err.Error(), "uq_partnership_requests_open") {
				http.Error(w, "this visitor already has another open request", http.StatusConflict)
				return
			}
			log.Printf("update partnership request error: %v", err)
			http.Error(w, "could not update the request", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
