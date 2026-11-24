package etimeoffice

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MissedPunch is a check-in or check-out a staff member forgot to punch,
// logged with its date and time (migration 196). A log only: approving it
// doesn't change the scanner attendance.
type MissedPunch struct {
	ID            int        `json:"id"`
	EmpCode       string     `json:"emp_code"`
	Name          string     `json:"name"`
	Date          string     `json:"date"` // YYYY-MM-DD
	Type          string     `json:"type"` // in | out
	Time          string     `json:"time"` // HH:MM
	Status        string     `json:"status"`
	DecidedByName *string    `json:"decided_by_name"`
	DecidedAt     *time.Time `json:"decided_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

// NewMissedPunch is what the staff member logs.
type NewMissedPunch struct {
	EmpCode string
	Date    string // YYYY-MM-DD
	Type    string // in | out
	Time    string // HH:MM
	By      uuid.UUID
}

const missedSelect = `
	SELECT m.id, m.emp_code, COALESCE(e.name, ''), to_char(m.punch_date, 'YYYY-MM-DD'), m.punch_type,
	       to_char(m.punch_time, 'HH24:MI'), m.status, ud.username, m.decided_at, m.created_at
	FROM etime_missed_punches m
	JOIN etime_employees e ON e.emp_code = m.emp_code
	LEFT JOIN users ud ON ud.id = m.decided_by`

func scanMissed(row pgx.CollectableRow) (MissedPunch, error) {
	var m MissedPunch
	err := row.Scan(&m.ID, &m.EmpCode, &m.Name, &m.Date, &m.Type, &m.Time, &m.Status, &m.DecidedByName, &m.DecidedAt, &m.CreatedAt)
	return m, err
}

func GetMissedPunch(ctx context.Context, db *pgxpool.Pool, id int) (*MissedPunch, error) {
	rows, err := db.Query(ctx, missedSelect+` WHERE m.id = $1`, id)
	if err != nil {
		return nil, err
	}
	m, err := pgx.CollectExactlyOneRow(rows, scanMissed)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// CreateMissedPunch logs one; it can't be in the future, nor more than 60
// days back, and the same day and kind can't be logged twice while one is
// pending or approved.
func CreateMissedPunch(ctx context.Context, db *pgxpool.Pool, n NewMissedPunch) (*MissedPunch, error) {
	if n.Type != "in" && n.Type != "out" {
		return nil, leaveErr("choose what was missed: check-in or check-out")
	}
	day, err := ParseDate(n.Date)
	if err != nil {
		return nil, leaveErr("choose the date")
	}
	clock, err := time.Parse("15:04", strings.TrimSpace(n.Time))
	if err != nil {
		return nil, leaveErr("enter the time as HH:MM")
	}
	at := time.Date(day.Year(), day.Month(), day.Day(), clock.Hour(), clock.Minute(), 0, 0, istZone)
	if at.After(time.Now().In(istZone)) {
		return nil, leaveErr("that time hasn't happened yet")
	}
	if day.Before(Today().AddDate(0, 0, -60)) {
		return nil, leaveErr("a missed punch can only be logged for the last 60 days")
	}
	var id int
	err = db.QueryRow(ctx, `
		INSERT INTO etime_missed_punches (emp_code, punch_date, punch_type, punch_time, applied_by)
		VALUES ($1, $2, $3, $4::time, $5) RETURNING id`,
		n.EmpCode, day.Format(isoDate), n.Type, clock.Format("15:04"), n.By).Scan(&id)
	if err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23505" {
			kind := "check-in"
			if n.Type == "out" {
				kind = "check-out"
			}
			return nil, leaveErr("a missed %s for %s is already logged", kind, day.Format("2 Jan 2006"))
		}
		return nil, err
	}
	return GetMissedPunch(ctx, db, id)
}

// DecideMissedPunch approves or rejects a pending one.
func DecideMissedPunch(ctx context.Context, db *pgxpool.Pool, id int, approve bool, by uuid.UUID) (*MissedPunch, error) {
	status := "rejected"
	if approve {
		status = "approved"
	}
	tag, err := db.Exec(ctx, `
		UPDATE etime_missed_punches SET status = $2, decided_by = $3, decided_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND status = 'pending'`, id, status, by)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, leaveErr("only a pending missed punch can be %s", status)
	}
	return GetMissedPunch(ctx, db, id)
}

// CancelMissedPunch withdraws one's own pending log.
func CancelMissedPunch(ctx context.Context, db *pgxpool.Pool, id int, empCode string, by uuid.UUID) (*MissedPunch, error) {
	tag, err := db.Exec(ctx, `
		UPDATE etime_missed_punches SET status = 'cancelled', decided_by = $3, decided_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND emp_code = $2 AND status = 'pending'`, id, empCode, by)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, leaveErr("only your own pending missed punch can be withdrawn")
	}
	return GetMissedPunch(ctx, db, id)
}

type MissedPunchFilter struct {
	EmpCode string
	Status  string // "" = any
	Limit   int
}

// ListMissedPunches returns logs newest first, pending ones first of all.
func ListMissedPunches(ctx context.Context, db *pgxpool.Pool, f MissedPunchFilter) ([]MissedPunch, error) {
	if f.Limit <= 0 {
		f.Limit = 300
	}
	rows, err := db.Query(ctx, missedSelect+`
		WHERE ($1 = '' OR m.emp_code = $1) AND ($2 = '' OR m.status = $2)
		ORDER BY (m.status = 'pending') DESC, m.punch_date DESC, m.id DESC
		LIMIT $3`, f.EmpCode, f.Status, f.Limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanMissed)
}

func PendingMissedCount(ctx context.Context, db *pgxpool.Pool) (int, error) {
	var n int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM etime_missed_punches WHERE status = 'pending'`).Scan(&n)
	return n, err
}
