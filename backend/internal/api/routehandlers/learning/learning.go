package learning

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/services"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// GET /learning/videos — public listing for partners/employees, with
// optional ?search=, ?playlist_id= and ?product_id= filters.
func ListVideosHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := strings.TrimSpace(r.URL.Query().Get("search"))

		var playlistID *uuid.UUID
		if pidStr := r.URL.Query().Get("playlist_id"); pidStr != "" {
			pid, err := uuid.Parse(pidStr)
			if err != nil {
				http.Error(w, "invalid playlist id", http.StatusBadRequest)
				return
			}
			playlistID = &pid
		}

		var productID *uuid.UUID
		if pidStr := r.URL.Query().Get("product_id"); pidStr != "" {
			pid, err := uuid.Parse(pidStr)
			if err != nil {
				http.Error(w, "invalid product id", http.StatusBadRequest)
				return
			}
			productID = &pid
		}

		videos, err := models.GetLearningVideos(r.Context(), db, search, playlistID, productID)
		if err != nil {
			log.Printf("list learning videos error: %v", err)
			http.Error(w, "could not fetch videos", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(videos)
	}
}

// GET /learning/playlists — public listing
func ListPlaylistsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		playlists, err := models.GetLearningPlaylists(r.Context(), db)
		if err != nil {
			log.Printf("list learning playlists error: %v", err)
			http.Error(w, "could not fetch playlists", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(playlists)
	}
}

// POST /admin/learning/videos — add a video (staff), optionally into a
// playlist immediately, and broadcasts a notification to every partner.
func CreateVideoHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req models.CreateVideoRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Title = strings.TrimSpace(req.Title)
		if req.Title == "" || req.YoutubeURL == "" {
			http.Error(w, "title and youtube_url are required", http.StatusBadRequest)
			return
		}
		if req.ProductID == nil {
			http.Error(w, "product_id is required", http.StatusBadRequest)
			return
		}

		youtubeID, err := models.ExtractYoutubeID(req.YoutubeURL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		videoID, err := models.CreateLearningVideo(r.Context(), db, youtubeID, req.YoutubeURL, req.Title, req.Description, req.ProductID, getUserID(r))
		if err != nil {
			log.Printf("create learning video error: %v", err)
			http.Error(w, "could not create video", http.StatusInternalServerError)
			return
		}

		if req.PlaylistID != nil && *req.PlaylistID != "" {
			playlistID, err := uuid.Parse(*req.PlaylistID)
			if err == nil {
				if err := models.AddVideoToPlaylist(r.Context(), db, playlistID, videoID); err != nil {
					log.Printf("add video to playlist error: %v", err)
				}
			}
		}

		go broadcastNewVideo(db, req.Title)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": videoID.String()})
	}
}

// broadcastNewVideo reuses the same broadcast pipeline the admin
// notifications page uses — one notifications row (audience_type='all'),
// fanned out to every partner's in-app inbox + push.
func broadcastNewVideo(db *pgxpool.Pool, title string) {
	notification := models.CreateNotificationRequest{
		Title: "New Learning Video",
		Body:  title,
	}
	notificationID, err := models.CreateNotification(context.Background(), db, notification)
	if err != nil {
		log.Printf("learning broadcast create error: %v", err)
		return
	}
	if err := models.CreateExclusions(context.Background(), db, notificationID, []uuid.UUID{}); err != nil {
		log.Printf("learning broadcast exclusions error: %v", err)
		return
	}
	full, err := models.GetNotificationByID(context.Background(), db, notificationID)
	if err != nil {
		log.Printf("learning broadcast fetch error: %v", err)
		return
	}
	if err := services.DispatchBroadcast(context.Background(), db, full, nil, []uuid.UUID{}); err != nil {
		log.Printf("learning broadcast dispatch error: %v", err)
	}
}

// DELETE /admin/learning/videos/{id} — remove a video (staff)
func DeleteVideoHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		videoID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid video id", http.StatusBadRequest)
			return
		}
		if err := models.DeleteLearningVideo(r.Context(), db, videoID); err != nil {
			log.Printf("delete learning video error: %v", err)
			http.Error(w, "could not delete video", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}

// POST /admin/learning/playlists — create a playlist (staff)
func CreatePlaylistHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req models.CreatePlaylistRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Title = strings.TrimSpace(req.Title)
		if req.Title == "" {
			http.Error(w, "title is required", http.StatusBadRequest)
			return
		}

		id, err := models.CreateLearningPlaylist(r.Context(), db, req.Title, req.Description, getUserID(r))
		if err != nil {
			log.Printf("create learning playlist error: %v", err)
			http.Error(w, "could not create playlist", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// DELETE /admin/learning/playlists/{id} — delete a playlist (staff)
func DeletePlaylistHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		playlistID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid playlist id", http.StatusBadRequest)
			return
		}
		if err := models.DeleteLearningPlaylist(r.Context(), db, playlistID); err != nil {
			log.Printf("delete learning playlist error: %v", err)
			http.Error(w, "could not delete playlist", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}

// POST /admin/learning/playlists/{id}/videos — assign a video to a playlist (staff)
func AddVideoToPlaylistHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		playlistID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid playlist id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			VideoID string `json:"video_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		videoID, err := uuid.Parse(req.VideoID)
		if err != nil {
			http.Error(w, "invalid video id", http.StatusBadRequest)
			return
		}

		if err := models.AddVideoToPlaylist(r.Context(), db, playlistID, videoID); err != nil {
			log.Printf("add video to playlist error: %v", err)
			http.Error(w, "could not add video to playlist", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "added"})
	}
}

// DELETE /admin/learning/playlists/{id}/videos/{videoId} — unassign (staff)
func RemoveVideoFromPlaylistHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		playlistID, err := uuid.Parse(vars["id"])
		if err != nil {
			http.Error(w, "invalid playlist id", http.StatusBadRequest)
			return
		}
		videoID, err := uuid.Parse(vars["videoId"])
		if err != nil {
			http.Error(w, "invalid video id", http.StatusBadRequest)
			return
		}

		if err := models.RemoveVideoFromPlaylist(r.Context(), db, playlistID, videoID); err != nil {
			log.Printf("remove video from playlist error: %v", err)
			http.Error(w, "could not remove video from playlist", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "removed"})
	}
}
