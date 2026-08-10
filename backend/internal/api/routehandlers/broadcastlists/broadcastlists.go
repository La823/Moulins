package broadcastlists

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

// GET /admin/broadcast-lists — the caller's own lists only.
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		lists, err := models.GetBroadcastListsByUser(r.Context(), db, userID)
		if err != nil {
			log.Printf("list broadcast lists error: %v", err)
			http.Error(w, "could not fetch broadcast lists", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"lists": lists})
	}
}

// GET /admin/broadcast-lists/{id} — metadata + members, owner only.
func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		listID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		list, err := models.GetBroadcastListOwned(r.Context(), db, listID, userID)
		if err != nil {
			if err == models.ErrBroadcastListNotFound {
				http.Error(w, "broadcast list not found", http.StatusNotFound)
				return
			}
			log.Printf("get broadcast list error: %v", err)
			http.Error(w, "could not fetch broadcast list", http.StatusInternalServerError)
			return
		}

		members, err := models.GetBroadcastListMembers(r.Context(), db, listID)
		if err != nil {
			log.Printf("get broadcast list members error: %v", err)
			http.Error(w, "could not fetch broadcast list members", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"list":    list,
			"members": members,
		})
	}
}

type upsertRequest struct {
	Name    string      `json:"name"`
	UserIDs []uuid.UUID `json:"user_ids"`
}

// POST /admin/broadcast-lists
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req upsertRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		if req.UserIDs == nil {
			req.UserIDs = []uuid.UUID{}
		}

		id, err := models.CreateBroadcastList(r.Context(), db, req.Name, userID, req.UserIDs)
		if err != nil {
			log.Printf("create broadcast list error: %v", err)
			http.Error(w, "could not create broadcast list", http.StatusInternalServerError)
			return
		}

		list, err := models.GetBroadcastListOwned(r.Context(), db, id, userID)
		if err != nil {
			log.Printf("fetch created broadcast list error: %v", err)
			http.Error(w, "broadcast list created but could not be fetched", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(list)
	}
}

// PUT /admin/broadcast-lists/{id} — rename + replace membership, owner only.
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		listID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req upsertRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		if req.UserIDs == nil {
			req.UserIDs = []uuid.UUID{}
		}

		if err := models.UpdateBroadcastList(r.Context(), db, listID, userID, req.Name, req.UserIDs); err != nil {
			if err == models.ErrBroadcastListNotFound {
				http.Error(w, "broadcast list not found", http.StatusNotFound)
				return
			}
			log.Printf("update broadcast list error: %v", err)
			http.Error(w, "could not update broadcast list", http.StatusInternalServerError)
			return
		}

		list, err := models.GetBroadcastListOwned(r.Context(), db, listID, userID)
		if err != nil {
			log.Printf("fetch updated broadcast list error: %v", err)
			http.Error(w, "could not fetch updated broadcast list", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// DELETE /admin/broadcast-lists/{id} — owner only.
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := currentUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		listID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteBroadcastList(r.Context(), db, listID, userID); err != nil {
			if err == models.ErrBroadcastListNotFound {
				http.Error(w, "broadcast list not found", http.StatusNotFound)
				return
			}
			log.Printf("delete broadcast list error: %v", err)
			http.Error(w, "could not delete broadcast list", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}
