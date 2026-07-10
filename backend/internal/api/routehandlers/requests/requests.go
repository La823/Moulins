package requests

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// POST /requests
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateRequestRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Description = strings.TrimSpace(req.Description)
		if req.Description == "" {
			http.Error(w, "description is required", http.StatusBadRequest)
			return
		}

		id, err := models.CreateRequest(r.Context(), db, getUserID(r), req.Description)
		if err != nil {
			log.Printf("create request error: %v", err)
			http.Error(w, "could not create request", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// GET /requests
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		reqs, err := models.GetRequestsForUser(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list requests error: %v", err)
			http.Error(w, "could not fetch requests", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(reqs)
	}
}

// GET /admin/requests?status=&user_id=&page=&limit=
func AdminListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()

		page, _ := strconv.Atoi(q.Get("page"))
		if page < 1 {
			page = 1
		}
		limit, _ := strconv.Atoi(q.Get("limit"))
		if limit < 1 || limit > 200 {
			limit = 50
		}

		reqs, total, err := models.GetAllRequests(r.Context(), db, q.Get("status"), q.Get("user_id"), limit, (page-1)*limit)
		if err != nil {
			log.Printf("admin list requests error: %v", err)
			http.Error(w, "could not fetch requests", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"requests": reqs,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}

// PUT /admin/requests/{id}/status
func AdminUpdateStatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid request id", http.StatusBadRequest)
			return
		}

		var req models.UpdateRequestStatusRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Status != "pending" && req.Status != "in_progress" && req.Status != "fulfilled" && req.Status != "rejected" {
			http.Error(w, "invalid status", http.StatusBadRequest)
			return
		}

		if err := models.UpdateRequestStatus(r.Context(), db, id, getUserID(r), req); err != nil {
			log.Printf("update request status error: %v", err)
			http.Error(w, "could not update request", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}
