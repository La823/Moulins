package accountdeletion

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func currentUserID(r *http.Request) (uuid.UUID, bool) {
	idStr, _ := r.Context().Value("user_id").(string)
	id, err := uuid.Parse(idStr)
	return id, err == nil
}

// POST /account/deletion-request — any authenticated user requests their
// own account be deleted.
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			Reason string `json:"reason"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		req.Reason = strings.TrimSpace(req.Reason)

		var reason *string
		if req.Reason != "" {
			reason = &req.Reason
		}

		id, err := models.CreateDeletionRequest(r.Context(), db, userID, reason)
		if err != nil {
			if err == models.ErrDeletionRequestExists {
				http.Error(w, "you already have a pending deletion request", http.StatusConflict)
				return
			}
			log.Printf("create deletion request error: %v", err)
			http.Error(w, "could not submit deletion request", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

// GET /account/deletion-request — the caller's own latest request, or null.
func GetMyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		req, err := models.GetLatestDeletionRequest(r.Context(), db, userID)
		if err != nil {
			log.Printf("get deletion request error: %v", err)
			http.Error(w, "could not fetch deletion request", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(req)
	}
}

// DELETE /account/deletion-request — cancel the caller's own pending request.
func CancelHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if err := models.CancelDeletionRequest(r.Context(), db, userID); err != nil {
			if err == models.ErrDeletionRequestNotFound {
				http.Error(w, "no pending deletion request found", http.StatusNotFound)
				return
			}
			log.Printf("cancel deletion request error: %v", err)
			http.Error(w, "could not cancel deletion request", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "cancelled"})
	}
}

// GET /admin/deletion-requests — staff queue of pending requests.
func ListPendingHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requests, err := models.GetPendingDeletionRequests(r.Context(), db)
		if err != nil {
			log.Printf("list deletion requests error: %v", err)
			http.Error(w, "could not fetch deletion requests", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"requests": requests})
	}
}

// PUT /admin/deletion-requests/{id}/approve — deletes the requester's
// account permanently.
func ApproveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		adminID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		requestID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.ApproveDeletionRequest(r.Context(), db, requestID, adminID); err != nil {
			if err == models.ErrDeletionRequestNotFound {
				http.Error(w, "deletion request not found or already processed", http.StatusNotFound)
				return
			}
			log.Printf("approve deletion request error: %v", err)
			http.Error(w, "could not approve deletion request", http.StatusInternalServerError)
			return
		}

		models.LogAction(r.Context(), db, &adminID, "deletion_request.approved", "deletion_request", &requestID, "Approved an account deletion request")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "account deleted"})
	}
}

// PUT /admin/deletion-requests/{id}/reject — denies the request.
func RejectHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		adminID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		requestID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var body struct {
			Notes string `json:"notes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body.Notes = strings.TrimSpace(body.Notes)

		var notes *string
		if body.Notes != "" {
			notes = &body.Notes
		}

		if err := models.RejectDeletionRequest(r.Context(), db, requestID, adminID, notes); err != nil {
			if err == models.ErrDeletionRequestNotFound {
				http.Error(w, "deletion request not found or already processed", http.StatusNotFound)
				return
			}
			log.Printf("reject deletion request error: %v", err)
			http.Error(w, "could not reject deletion request", http.StatusInternalServerError)
			return
		}

		models.LogAction(r.Context(), db, &adminID, "deletion_request.rejected", "deletion_request", &requestID, "Rejected an account deletion request")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "rejected"})
	}
}
