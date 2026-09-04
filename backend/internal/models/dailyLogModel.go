package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DailyLog struct {
	ID           uuid.UUID `json:"id"`
	TeamMemberID uuid.UUID `json:"team_member_id"`
	Date         string    `json:"date"`
	Notes        string    `json:"notes"`
	Latitude     *float64  `json:"latitude"`
	Longitude    *float64  `json:"longitude"`
	Address      *string   `json:"address"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UpsertDailyLog creates or replaces a team member's log entry for a given
// day — one entry per (team_member_id, date), same shape as MarkAttendance.
// The location is captured from the device's current position at submit
// time (never a manually-picked point), so the partner can trust it
// reflects where the team member actually was.
func UpsertDailyLog(ctx context.Context, db *pgxpool.Pool, teamMemberID uuid.UUID, date, notes string, lat, lng *float64, address *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO daily_logs (team_member_id, date, notes, latitude, longitude, address)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (team_member_id, date) DO UPDATE
		 SET notes = $3, latitude = $4, longitude = $5, address = $6, updated_at = NOW()
		 RETURNING id`,
		teamMemberID, date, notes, lat, lng, address,
	).Scan(&id)
	return id, err
}

func GetDailyLogsByMemberMonth(ctx context.Context, db *pgxpool.Pool, teamMemberID uuid.UUID, year, month int) ([]DailyLog, error) {
	rows, err := db.Query(ctx,
		`SELECT id, team_member_id, date::text, notes, latitude, longitude, address, created_at, updated_at
		 FROM daily_logs
		 WHERE team_member_id = $1 AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3
		 ORDER BY date DESC`,
		teamMemberID, year, month,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := make([]DailyLog, 0)
	for rows.Next() {
		var l DailyLog
		if err := rows.Scan(&l.ID, &l.TeamMemberID, &l.Date, &l.Notes, &l.Latitude, &l.Longitude, &l.Address, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}
