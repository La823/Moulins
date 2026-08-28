package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MeetingVisitLog is a team member's proof-of-visit entry for an assigned
// meeting — their location and an optional note, captured at submit time.
type MeetingVisitLog struct {
	ID         uuid.UUID `json:"id"`
	MeetingID  uuid.UUID `json:"meeting_id"`
	UserID     uuid.UUID `json:"user_id"`
	UserName   string    `json:"user_name,omitempty"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	Notes      *string   `json:"notes,omitempty"`
	RecordedAt time.Time `json:"recorded_at"`
}

func CreateMeetingVisitLog(ctx context.Context, db *pgxpool.Pool, meetingID, userID uuid.UUID, lat, lng float64, notes *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO meeting_visit_logs (meeting_id, user_id, latitude, longitude, notes)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		meetingID, userID, lat, lng, notes,
	).Scan(&id)
	return id, err
}

func GetVisitLogsForMeeting(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID) ([]MeetingVisitLog, error) {
	rows, err := db.Query(ctx,
		`SELECT vl.id, vl.meeting_id, vl.user_id, u.username, vl.latitude, vl.longitude, vl.notes, vl.recorded_at
		 FROM meeting_visit_logs vl
		 JOIN users u ON u.id = vl.user_id
		 WHERE vl.meeting_id = $1
		 ORDER BY vl.recorded_at DESC`,
		meetingID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := []MeetingVisitLog{}
	for rows.Next() {
		var l MeetingVisitLog
		var username *string
		if err := rows.Scan(&l.ID, &l.MeetingID, &l.UserID, &username, &l.Latitude, &l.Longitude, &l.Notes, &l.RecordedAt); err != nil {
			return nil, err
		}
		if username != nil {
			l.UserName = *username
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}
