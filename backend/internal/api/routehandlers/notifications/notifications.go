package notifications

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
	"github.com/lavanyaarora/server/internal/services"
	"github.com/lavanyaarora/server/internal/utils"
)

// POST /admin/notifications
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req models.CreateNotificationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		req.Title = strings.TrimSpace(req.Title)
		req.Body = strings.TrimSpace(req.Body)
		if req.Title == "" || req.Body == "" {
			http.Error(w, "title and body are required", http.StatusBadRequest)
			return
		}

		adminIDStr, _ := r.Context().Value("user_id").(string)
		adminID, err := uuid.Parse(adminIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		req.CreatedBy = adminID

		if req.ExcludeUserIDs == nil {
			req.ExcludeUserIDs = []uuid.UUID{}
		}

		if req.BroadcastListID != nil {
			if _, err := models.GetBroadcastListOwned(r.Context(), db, *req.BroadcastListID, adminID); err != nil {
				if err == models.ErrBroadcastListNotFound {
					http.Error(w, "broadcast list not found", http.StatusNotFound)
					return
				}
				log.Printf("lookup broadcast list error: %v", err)
				http.Error(w, "could not verify broadcast list", http.StatusInternalServerError)
				return
			}
		}

		id, err := models.CreateNotification(r.Context(), db, req)
		if err != nil {
			log.Printf("create notification error: %v", err)
			http.Error(w, "could not create notification", http.StatusInternalServerError)
			return
		}

		if err := models.CreateExclusions(r.Context(), db, id, req.ExcludeUserIDs); err != nil {
			log.Printf("create notification exclusions error: %v", err)
			http.Error(w, "could not save exclusions", http.StatusInternalServerError)
			return
		}

		notification, err := models.GetNotificationByID(r.Context(), db, id)
		if err != nil {
			log.Printf("fetch notification error: %v", err)
			http.Error(w, "notification created but could not be dispatched", http.StatusInternalServerError)
			return
		}

		if err := services.DispatchBroadcast(r.Context(), db, notification, req.BroadcastListID, req.ExcludeUserIDs); err != nil {
			log.Printf("dispatch broadcast error: %v", err)
			http.Error(w, "notification created but dispatch failed", http.StatusInternalServerError)
			return
		}

		result, err := models.GetNotificationByID(r.Context(), db, id)
		if err != nil {
			log.Printf("fetch notification error: %v", err)
			http.Error(w, "could not fetch result", http.StatusInternalServerError)
			return
		}
		if result.ImageKey != nil && *result.ImageKey != "" {
			result.ImageURL = utils.GetPublicURL(*result.ImageKey)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(result)
	}
}

// GET /admin/notifications
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit <= 0 || limit > 100 {
			limit = 20
		}

		list, total, err := models.GetAllNotifications(r.Context(), db, limit, (page-1)*limit)
		if err != nil {
			log.Printf("list notifications error: %v", err)
			http.Error(w, "could not fetch notifications", http.StatusInternalServerError)
			return
		}
		for i := range list {
			if list[i].ImageKey != nil && *list[i].ImageKey != "" {
				list[i].ImageURL = utils.GetPublicURL(*list[i].ImageKey)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"notifications": list,
			"total":         total,
			"page":          page,
			"limit":         limit,
		})
	}
}

// POST /admin/notifications/upload-url
func UploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
			http.Error(w, "filename is required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedNotificationUploadURL(req.Filename)
		if err != nil {
			log.Printf("presign error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}

// GET /admin/users/search?q= — q may be omitted/blank to list partners for
// a dropdown (capped higher than a live-typed search would need).
func SearchUsersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 20
		if q == "" {
			limit = 300
		}

		users, err := models.SearchUsers(r.Context(), db, q, limit)
		if err != nil {
			log.Printf("search users error: %v", err)
			http.Error(w, "could not search users", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

// GET /notifications (mobile inbox, any authenticated user)
func ListMyNotificationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr, _ := r.Context().Value("user_id").(string)
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit <= 0 || limit > 100 {
			limit = 20
		}

		items, total, err := models.GetUserNotifications(r.Context(), db, userID, limit, (page-1)*limit)
		if err != nil {
			log.Printf("list my notifications error: %v", err)
			http.Error(w, "could not fetch notifications", http.StatusInternalServerError)
			return
		}
		for i := range items {
			if items[i].ImageURL != "" {
				items[i].ImageURL = utils.GetPublicURL(items[i].ImageURL)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"notifications": items,
			"total":         total,
			"page":          page,
			"limit":         limit,
		})
	}
}

// PUT /notifications/{id}/read
func MarkReadHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr, _ := r.Context().Value("user_id").(string)
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		recipientID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.MarkNotificationRead(r.Context(), db, recipientID, userID); err != nil {
			log.Printf("mark notification read error: %v", err)
			http.Error(w, "could not mark as read", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "read"})
	}
}

// POST /device-tokens
func RegisterDeviceTokenHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr, _ := r.Context().Value("user_id").(string)
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			Token    string `json:"token"`
			Platform string `json:"platform"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
			http.Error(w, "token is required", http.StatusBadRequest)
			return
		}

		if err := models.UpsertDeviceToken(r.Context(), db, userID, req.Token, req.Platform); err != nil {
			log.Printf("register device token error: %v", err)
			http.Error(w, "could not register device token", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "registered"})
	}
}
