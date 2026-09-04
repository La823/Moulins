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
	ID                      uuid.UUID `json:"id"`
	MeetingID               uuid.UUID `json:"meeting_id"`
	UserID                  uuid.UUID `json:"user_id"`
	UserName                string    `json:"user_name,omitempty"`
	Latitude                float64   `json:"latitude"`
	Longitude               float64   `json:"longitude"`
	Notes                   *string   `json:"notes,omitempty"`
	RecordedAt              time.Time `json:"recorded_at"`
	DistanceFromClinicM     *float64  `json:"distance_from_clinic_m,omitempty"`
	WithinExpectedProximity *bool     `json:"within_expected_proximity,omitempty"`
}

// proximityThresholdMeters is the cutoff below which a visit log is
// considered to have been logged "at" the doctor's clinic rather than
// somewhere unrelated — generous enough to absorb ordinary GPS drift.
const proximityThresholdMeters = 500.0

func CreateMeetingVisitLog(ctx context.Context, db *pgxpool.Pool, meetingID, userID uuid.UUID, lat, lng float64, notes *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO meeting_visit_logs (meeting_id, user_id, latitude, longitude, notes)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		meetingID, userID, lat, lng, notes,
	).Scan(&id)
	return id, err
}

// GetVisitLogsForMeeting fetches a meeting's visit logs and, when the
// doctor has a saved clinic location, annotates each log with its distance
// from that clinic — lets the partner see at a glance whether a logged
// visit actually happened near the doctor's premises.
func GetVisitLogsForMeeting(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID) ([]MeetingVisitLog, error) {
	rows, err := db.Query(ctx,
		`SELECT vl.id, vl.meeting_id, vl.user_id, u.username, vl.latitude, vl.longitude, vl.notes, vl.recorded_at,
		        d.latitude, d.longitude
		 FROM meeting_visit_logs vl
		 JOIN users u ON u.id = vl.user_id
		 JOIN meetings m ON m.id = vl.meeting_id
		 LEFT JOIN doctors d ON d.id = m.doctor_id
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
		var clinicLat, clinicLng *float64
		if err := rows.Scan(&l.ID, &l.MeetingID, &l.UserID, &username, &l.Latitude, &l.Longitude, &l.Notes, &l.RecordedAt, &clinicLat, &clinicLng); err != nil {
			return nil, err
		}
		if username != nil {
			l.UserName = *username
		}
		if clinicLat != nil && clinicLng != nil {
			dist := haversineMeters(l.Latitude, l.Longitude, *clinicLat, *clinicLng)
			within := dist <= proximityThresholdMeters
			l.DistanceFromClinicM = &dist
			l.WithinExpectedProximity = &within
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}
