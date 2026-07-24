package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Meeting struct {
	ID                uuid.UUID  `json:"id"`
	UserID            uuid.UUID  `json:"user_id"`
	UserName          string     `json:"user_name,omitempty"`
	DoctorID          *uuid.UUID `json:"doctor_id,omitempty"`
	DoctorName        string     `json:"doctor_name,omitempty"`
	Title             *string    `json:"title,omitempty"`
	ScheduledAt       time.Time  `json:"scheduled_at"`
	Notes             *string    `json:"notes,omitempty"`
	Mom               *string    `json:"mom,omitempty"`
	Status            string     `json:"status"`
	Reminder1DaySent  bool       `json:"reminder_1day_sent"`
	Reminder1HourSent bool       `json:"reminder_1hour_sent"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type CreateMeetingRequest struct {
	DoctorID    *uuid.UUID `json:"doctor_id,omitempty"`
	Title       *string    `json:"title,omitempty"`
	ScheduledAt time.Time  `json:"scheduled_at"`
	Notes       *string    `json:"notes,omitempty"`
	Mom         *string    `json:"mom,omitempty"`
}

type UpdateMeetingRequest struct {
	DoctorID    *uuid.UUID `json:"doctor_id,omitempty"`
	Title       *string    `json:"title,omitempty"`
	ScheduledAt time.Time  `json:"scheduled_at"`
	Notes       *string    `json:"notes,omitempty"`
	Mom         *string    `json:"mom,omitempty"`
}

func CreateMeeting(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, req CreateMeetingRequest) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO meetings (user_id, doctor_id, title, scheduled_at, notes, mom) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		userID, req.DoctorID, req.Title, req.ScheduledAt, req.Notes, req.Mom,
	).Scan(&id)
	return id, err
}

func GetMeetingByID(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID) (*Meeting, error) {
	var m Meeting
	err := db.QueryRow(ctx,
		`SELECT id, user_id, doctor_id, title, scheduled_at, notes, mom, status, reminder_1day_sent, reminder_1hour_sent, created_at, updated_at
		 FROM meetings WHERE id = $1`,
		meetingID,
	).Scan(&m.ID, &m.UserID, &m.DoctorID, &m.Title, &m.ScheduledAt, &m.Notes, &m.Mom, &m.Status, &m.Reminder1DaySent, &m.Reminder1HourSent, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func GetMeetingsForUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, doctorID *uuid.UUID, status, from, to string) ([]Meeting, error) {
	conditions := []string{"m.user_id = $1"}
	args := []any{userID}
	argIdx := 2

	if doctorID != nil {
		conditions = append(conditions, fmt.Sprintf("m.doctor_id = $%d", argIdx))
		args = append(args, *doctorID)
		argIdx++
	}
	if status != "" {
		conditions = append(conditions, fmt.Sprintf("m.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}
	if from != "" {
		conditions = append(conditions, fmt.Sprintf("m.scheduled_at >= $%d", argIdx))
		args = append(args, from)
		argIdx++
	}
	if to != "" {
		conditions = append(conditions, fmt.Sprintf("m.scheduled_at <= $%d", argIdx))
		args = append(args, to)
		argIdx++
	}

	where := " WHERE " + conditions[0]
	for _, c := range conditions[1:] {
		where += " AND " + c
	}

	query := `
		SELECT m.id, m.user_id, m.doctor_id, d.name, m.title, m.scheduled_at, m.notes, m.mom, m.status,
		       m.reminder_1day_sent, m.reminder_1hour_sent, m.created_at, m.updated_at
		FROM meetings m
		LEFT JOIN doctors d ON d.id = m.doctor_id` + where + `
		ORDER BY m.scheduled_at ASC`

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	meetings := []Meeting{}
	for rows.Next() {
		var m Meeting
		var doctorName *string
		if err := rows.Scan(&m.ID, &m.UserID, &m.DoctorID, &doctorName, &m.Title, &m.ScheduledAt, &m.Notes, &m.Mom, &m.Status,
			&m.Reminder1DaySent, &m.Reminder1HourSent, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		if doctorName != nil {
			m.DoctorName = *doctorName
		}
		meetings = append(meetings, m)
	}
	return meetings, rows.Err()
}

type AdminMeetingFilters struct {
	UserID   *uuid.UUID
	DoctorID *uuid.UUID
	Status   string
	From     string
	To       string
}

func GetAllMeetings(ctx context.Context, db *pgxpool.Pool, filters AdminMeetingFilters, limit, offset int) ([]Meeting, int, error) {
	conditions := []string{}
	args := []any{}
	argIdx := 1

	if filters.UserID != nil {
		conditions = append(conditions, fmt.Sprintf("m.user_id = $%d", argIdx))
		args = append(args, *filters.UserID)
		argIdx++
	}
	if filters.DoctorID != nil {
		conditions = append(conditions, fmt.Sprintf("m.doctor_id = $%d", argIdx))
		args = append(args, *filters.DoctorID)
		argIdx++
	}
	if filters.Status != "" {
		conditions = append(conditions, fmt.Sprintf("m.status = $%d", argIdx))
		args = append(args, filters.Status)
		argIdx++
	}
	if filters.From != "" {
		conditions = append(conditions, fmt.Sprintf("m.scheduled_at >= $%d", argIdx))
		args = append(args, filters.From)
		argIdx++
	}
	if filters.To != "" {
		conditions = append(conditions, fmt.Sprintf("m.scheduled_at <= $%d", argIdx))
		args = append(args, filters.To)
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + conditions[0]
		for _, c := range conditions[1:] {
			where += " AND " + c
		}
	}

	var total int
	countQuery := "SELECT count(*) FROM meetings m" + where
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT m.id, m.user_id, u.username, m.doctor_id, d.name, m.title, m.scheduled_at, m.notes, m.mom, m.status,
		       m.reminder_1day_sent, m.reminder_1hour_sent, m.created_at, m.updated_at
		FROM meetings m
		LEFT JOIN doctors d ON d.id = m.doctor_id
		JOIN users u ON u.id = m.user_id` + where + fmt.Sprintf(`
		ORDER BY m.scheduled_at DESC
		LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	meetings := []Meeting{}
	for rows.Next() {
		var m Meeting
		var username *string
		var doctorName *string
		if err := rows.Scan(&m.ID, &m.UserID, &username, &m.DoctorID, &doctorName, &m.Title, &m.ScheduledAt, &m.Notes, &m.Mom, &m.Status,
			&m.Reminder1DaySent, &m.Reminder1HourSent, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, 0, err
		}
		if username != nil {
			m.UserName = *username
		}
		if doctorName != nil {
			m.DoctorName = *doctorName
		}
		meetings = append(meetings, m)
	}
	return meetings, total, rows.Err()
}

func UpdateMeeting(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, req UpdateMeetingRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE meetings SET doctor_id = $1, title = $2, scheduled_at = $3, notes = $4, mom = $5,
		   reminder_1day_sent = FALSE, reminder_1hour_sent = FALSE, updated_at = now()
		 WHERE id = $6`,
		req.DoctorID, req.Title, req.ScheduledAt, req.Notes, req.Mom, meetingID,
	)
	return err
}

// UpdateMeetingMom lets the owner attach minutes-of-meeting notes without
// resetting the scheduled time / reminder flags (unlike the full UpdateMeeting).
func UpdateMeetingMom(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, mom *string) error {
	_, err := db.Exec(ctx, `UPDATE meetings SET mom = $1, updated_at = now() WHERE id = $2`, mom, meetingID)
	return err
}

func UpdateMeetingStatus(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, status string) error {
	_, err := db.Exec(ctx,
		`UPDATE meetings SET status = $1, updated_at = now() WHERE id = $2`,
		status, meetingID,
	)
	return err
}

func DeleteMeeting(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM meetings WHERE id = $1`, meetingID)
	return err
}

// GetDueReminders returns upcoming meetings whose reminder window ("1day" or
// "1hour" before scheduled_at) has been entered but the reminder hasn't been
// sent yet.
func GetDueReminders(ctx context.Context, db *pgxpool.Pool, kind string) ([]Meeting, error) {
	interval := "1 day"
	reminderCol := "reminder_1day_sent"
	if kind == "1hour" {
		interval = "1 hour"
		reminderCol = "reminder_1hour_sent"
	}

	query := fmt.Sprintf(`
		SELECT m.id, m.user_id, m.doctor_id, d.name, m.title, m.scheduled_at, m.notes, m.mom, m.status,
		       m.reminder_1day_sent, m.reminder_1hour_sent, m.created_at, m.updated_at
		FROM meetings m
		LEFT JOIN doctors d ON d.id = m.doctor_id
		WHERE m.status = 'upcoming'
		  AND m.%s = FALSE
		  AND m.scheduled_at > now()
		  AND m.scheduled_at <= now() + interval '%s'`, reminderCol, interval)

	rows, err := db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	meetings := []Meeting{}
	for rows.Next() {
		var m Meeting
		var doctorName *string
		if err := rows.Scan(&m.ID, &m.UserID, &m.DoctorID, &doctorName, &m.Title, &m.ScheduledAt, &m.Notes, &m.Mom, &m.Status,
			&m.Reminder1DaySent, &m.Reminder1HourSent, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		if doctorName != nil {
			m.DoctorName = *doctorName
		}
		meetings = append(meetings, m)
	}
	return meetings, rows.Err()
}

func MarkReminderSent(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, kind string) error {
	col := "reminder_1day_sent"
	if kind == "1hour" {
		col = "reminder_1hour_sent"
	}
	_, err := db.Exec(ctx, `UPDATE meetings SET `+col+` = TRUE WHERE id = $1`, meetingID)
	return err
}
