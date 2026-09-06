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

// InsertDailyLog adds a new log entry for a team member on a given day.
// Multiple entries on the same date are allowed and kept separately (e.g. a
// morning and an afternoon check-in) — same append-only shape as
// meeting_visit_logs, rather than one row per day. The location is captured
// from the device's current position at submit time (never a manually-picked
// point), so the partner can trust it reflects where the team member
// actually was.
func InsertDailyLog(ctx context.Context, db *pgxpool.Pool, teamMemberID uuid.UUID, date, notes string, lat, lng *float64, address *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO daily_logs (team_member_id, date, notes, latitude, longitude, address)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		teamMemberID, date, notes, lat, lng, address,
	).Scan(&id)
	return id, err
}

// DailyLogWithMember is a daily log annotated with whose log it is — used
// for the partner's team-wide logs view, where entries from every team
// member are interleaved and need to say who they belong to.
type DailyLogWithMember struct {
	DailyLog
	MemberName string `json:"member_name"`
}

// GetDailyLogsByPartnerMonth returns every team member's daily logs for the
// given month, across the partner's whole team — the aggregate view behind
// the partner's "Team Logs" page, as opposed to GetDailyLogsByMemberMonth
// which is scoped to one member at a time.
func GetDailyLogsByPartnerMonth(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID, year, month int) ([]DailyLogWithMember, error) {
	rows, err := db.Query(ctx,
		`SELECT l.id, l.team_member_id, l.date::text, l.notes, l.latitude, l.longitude, l.address, l.created_at, l.updated_at,
		        COALESCE(u.username, u.phone_number)
		 FROM daily_logs l
		 JOIN users u ON u.id = l.team_member_id
		 WHERE u.team_owner_id = $1 AND EXTRACT(YEAR FROM l.date) = $2 AND EXTRACT(MONTH FROM l.date) = $3
		 ORDER BY l.date DESC, l.created_at DESC`,
		partnerID, year, month,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := make([]DailyLogWithMember, 0)
	for rows.Next() {
		var l DailyLogWithMember
		if err := rows.Scan(&l.ID, &l.TeamMemberID, &l.Date, &l.Notes, &l.Latitude, &l.Longitude, &l.Address, &l.CreatedAt, &l.UpdatedAt, &l.MemberName); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

func GetDailyLogsByMemberMonth(ctx context.Context, db *pgxpool.Pool, teamMemberID uuid.UUID, year, month int) ([]DailyLog, error) {
	rows, err := db.Query(ctx,
		`SELECT id, team_member_id, date::text, notes, latitude, longitude, address, created_at, updated_at
		 FROM daily_logs
		 WHERE team_member_id = $1 AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3
		 ORDER BY date DESC, created_at DESC`,
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
