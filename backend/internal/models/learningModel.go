package models

import (
	"context"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type LearningVideo struct {
	ID           uuid.UUID `json:"id"`
	YoutubeID    string    `json:"youtube_id"`
	YoutubeURL   string    `json:"youtube_url"`
	Title        string    `json:"title"`
	Description  *string   `json:"description,omitempty"`
	ThumbnailURL string    `json:"thumbnail_url"`
	CreatedAt    time.Time `json:"created_at"`
}

type LearningPlaylist struct {
	ID          uuid.UUID `json:"id"`
	Title       string    `json:"title"`
	Description *string   `json:"description,omitempty"`
	VideoCount  int       `json:"video_count"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateVideoRequest struct {
	YoutubeURL  string  `json:"youtube_url"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	PlaylistID  *string `json:"playlist_id,omitempty"`
}

type CreatePlaylistRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
}

var youtubeIDPattern = regexp.MustCompile(`(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})`)

// ExtractYoutubeID pulls the 11-character video ID out of any common
// YouTube URL shape (watch, youtu.be, embed, shorts).
func ExtractYoutubeID(url string) (string, error) {
	match := youtubeIDPattern.FindStringSubmatch(url)
	if len(match) < 2 {
		return "", fmt.Errorf("could not extract a YouTube video ID from %q", url)
	}
	return match[1], nil
}

func ThumbnailURLForYoutubeID(youtubeID string) string {
	return fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", youtubeID)
}

func CreateLearningVideo(ctx context.Context, db *pgxpool.Pool, youtubeID, youtubeURL, title string, description *string, createdBy uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO learning_videos (youtube_id, youtube_url, title, description, created_by)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		youtubeID, youtubeURL, title, description, createdBy,
	).Scan(&id)
	return id, err
}

func DeleteLearningVideo(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM learning_videos WHERE id = $1`, id)
	return err
}

func GetLearningVideos(ctx context.Context, db *pgxpool.Pool, search string, playlistID *uuid.UUID) ([]LearningVideo, error) {
	query := `SELECT id, youtube_id, youtube_url, title, description, created_at FROM learning_videos v`
	args := []any{}
	argIdx := 1
	conditions := []string{}

	if playlistID != nil {
		query = `SELECT v.id, v.youtube_id, v.youtube_url, v.title, v.description, v.created_at
		         FROM learning_videos v
		         JOIN learning_playlist_videos pv ON pv.video_id = v.id`
		conditions = append(conditions, fmt.Sprintf("pv.playlist_id = $%d", argIdx))
		args = append(args, *playlistID)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf("v.title ILIKE $%d", argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	if len(conditions) > 0 {
		query += " WHERE " + conditions[0]
		for _, c := range conditions[1:] {
			query += " AND " + c
		}
	}

	if playlistID != nil {
		query += " ORDER BY pv.position ASC, v.created_at DESC"
	} else {
		query += " ORDER BY v.created_at DESC"
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	videos := []LearningVideo{}
	for rows.Next() {
		var v LearningVideo
		if err := rows.Scan(&v.ID, &v.YoutubeID, &v.YoutubeURL, &v.Title, &v.Description, &v.CreatedAt); err != nil {
			return nil, err
		}
		v.ThumbnailURL = ThumbnailURLForYoutubeID(v.YoutubeID)
		videos = append(videos, v)
	}
	return videos, rows.Err()
}

func CreateLearningPlaylist(ctx context.Context, db *pgxpool.Pool, title string, description *string, createdBy uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO learning_playlists (title, description, created_by) VALUES ($1, $2, $3) RETURNING id`,
		title, description, createdBy,
	).Scan(&id)
	return id, err
}

func DeleteLearningPlaylist(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM learning_playlists WHERE id = $1`, id)
	return err
}

func GetLearningPlaylists(ctx context.Context, db *pgxpool.Pool) ([]LearningPlaylist, error) {
	rows, err := db.Query(ctx,
		`SELECT p.id, p.title, p.description, p.created_at,
		        COALESCE((SELECT COUNT(*) FROM learning_playlist_videos pv WHERE pv.playlist_id = p.id), 0)
		 FROM learning_playlists p
		 ORDER BY p.created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	playlists := []LearningPlaylist{}
	for rows.Next() {
		var p LearningPlaylist
		if err := rows.Scan(&p.ID, &p.Title, &p.Description, &p.CreatedAt, &p.VideoCount); err != nil {
			return nil, err
		}
		playlists = append(playlists, p)
	}
	return playlists, rows.Err()
}

func AddVideoToPlaylist(ctx context.Context, db *pgxpool.Pool, playlistID, videoID uuid.UUID) error {
	var position int
	_ = db.QueryRow(ctx, `SELECT COALESCE(MAX(position) + 1, 0) FROM learning_playlist_videos WHERE playlist_id = $1`, playlistID).Scan(&position)

	_, err := db.Exec(ctx,
		`INSERT INTO learning_playlist_videos (playlist_id, video_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		playlistID, videoID, position,
	)
	return err
}

func RemoveVideoFromPlaylist(ctx context.Context, db *pgxpool.Pool, playlistID, videoID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`DELETE FROM learning_playlist_videos WHERE playlist_id = $1 AND video_id = $2`,
		playlistID, videoID,
	)
	return err
}
