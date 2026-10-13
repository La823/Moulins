package models

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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
	AssignedTo        *uuid.UUID `json:"assigned_to,omitempty"`
	AssignedToName    string     `json:"assigned_to_name,omitempty"`

	// Who did what. CreatedBy is nil for meetings made before it was
	// recorded and for the system's birthday / anniversary entries.
	AssignedToRemoved   bool       `json:"assigned_to_removed,omitempty"`
	CreatedBy           *uuid.UUID `json:"created_by,omitempty"`
	CreatedByName       string     `json:"created_by_name,omitempty"`
	UpdatedByName       string     `json:"updated_by_name,omitempty"`
	StatusChangedByName string     `json:"status_changed_by_name,omitempty"`
	StatusChangedAt     *time.Time `json:"status_changed_at,omitempty"`
	HasVisitLog         bool       `json:"has_visit_log"`

	// NotifyUserID is who a reminder goes to: the assignee, or the account
	// owner when there is no active assignee. Internal only.
	NotifyUserID uuid.UUID `json:"-"`
}

// DisplayName is what the meeting is about: "Dr. <name>" when it is with a
// doctor, otherwise its title.
func (m *Meeting) DisplayName() string {
	if m.DoctorName != "" {
		return "Dr. " + m.DoctorName
	}
	if m.Title != nil && *m.Title != "" {
		return *m.Title
	}
	return "your meeting"
}

type CreateMeetingRequest struct {
	DoctorID    *uuid.UUID `json:"doctor_id,omitempty"`
	Title       *string    `json:"title,omitempty"`
	ScheduledAt time.Time  `json:"scheduled_at"`
	Notes       *string    `json:"notes,omitempty"`
	Mom         *string    `json:"mom,omitempty"`
	AssignedTo  *uuid.UUID `json:"assigned_to,omitempty"`
}

type UpdateMeetingRequest struct {
	DoctorID    *uuid.UUID `json:"doctor_id,omitempty"`
	Title       *string    `json:"title,omitempty"`
	ScheduledAt time.Time  `json:"scheduled_at"`
	Notes       *string    `json:"notes,omitempty"`
	Mom         *string    `json:"mom,omitempty"`
}

// CreateMeeting stores a meeting under userID's account, assigned to
// assignedTo. createdBy is the person who scheduled it — nil when the system
// makes it (birthday / anniversary entries).
func CreateMeeting(ctx context.Context, db *pgxpool.Pool, userID, assignedTo uuid.UUID, createdBy *uuid.UUID, req CreateMeetingRequest) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO meetings (user_id, doctor_id, title, scheduled_at, notes, mom, assigned_to, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		userID, req.DoctorID, req.Title, req.ScheduledAt, req.Notes, req.Mom, assignedTo, createdBy,
	).Scan(&id)
	return id, err
}

// One column list and join set for every meeting read, so the list, the
// single meeting, the admin view and the reminders all carry the same names.
// A person's name falls back to their phone number when they have none.
const meetingSelect = `
	SELECT m.id, m.user_id, ou.name, m.doctor_id, d.name, m.title, m.scheduled_at, m.notes, m.mom, m.status,
	       m.reminder_1day_sent, m.reminder_1hour_sent, m.created_at, m.updated_at,
	       m.assigned_to, au.name, (au.deleted_at IS NOT NULL),
	       m.created_by, cu.name, uu.name, su.name, m.status_changed_at,
	       EXISTS (SELECT 1 FROM meeting_visit_logs v WHERE v.meeting_id = m.id),
	       COALESCE(CASE WHEN au.deleted_at IS NULL THEN m.assigned_to END, m.user_id)
	FROM meetings m
	LEFT JOIN doctors d ON d.id = m.doctor_id
	LEFT JOIN LATERAL (SELECT COALESCE(NULLIF(username, ''), phone_number) AS name FROM users WHERE id = m.user_id) ou ON TRUE
	LEFT JOIN LATERAL (SELECT COALESCE(NULLIF(username, ''), phone_number) AS name, deleted_at FROM users WHERE id = m.assigned_to) au ON TRUE
	LEFT JOIN LATERAL (SELECT COALESCE(NULLIF(username, ''), phone_number) AS name FROM users WHERE id = m.created_by) cu ON TRUE
	LEFT JOIN LATERAL (SELECT COALESCE(NULLIF(username, ''), phone_number) AS name FROM users WHERE id = m.updated_by) uu ON TRUE
	LEFT JOIN LATERAL (SELECT COALESCE(NULLIF(username, ''), phone_number) AS name FROM users WHERE id = m.status_changed_by) su ON TRUE`

func scanMeeting(row pgx.Row) (*Meeting, error) {
	var m Meeting
	var userName, doctorName, assignedToName, createdByName, updatedByName, statusByName *string
	var assigneeRemoved *bool
	if err := row.Scan(&m.ID, &m.UserID, &userName, &m.DoctorID, &doctorName, &m.Title, &m.ScheduledAt, &m.Notes, &m.Mom, &m.Status,
		&m.Reminder1DaySent, &m.Reminder1HourSent, &m.CreatedAt, &m.UpdatedAt,
		&m.AssignedTo, &assignedToName, &assigneeRemoved,
		&m.CreatedBy, &createdByName, &updatedByName, &statusByName, &m.StatusChangedAt,
		&m.HasVisitLog, &m.NotifyUserID); err != nil {
		return nil, err
	}
	m.UserName = strOrEmpty(userName)
	m.DoctorName = strOrEmpty(doctorName)
	m.AssignedToName = strOrEmpty(assignedToName)
	m.AssignedToRemoved = m.AssignedTo != nil && assigneeRemoved != nil && *assigneeRemoved
	m.CreatedByName = strOrEmpty(createdByName)
	m.UpdatedByName = strOrEmpty(updatedByName)
	m.StatusChangedByName = strOrEmpty(statusByName)
	return &m, nil
}

func strOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func scanMeetings(rows pgx.Rows) ([]Meeting, error) {
	defer rows.Close()
	meetings := []Meeting{}
	for rows.Next() {
		m, err := scanMeeting(rows)
		if err != nil {
			return nil, err
		}
		meetings = append(meetings, *m)
	}
	return meetings, rows.Err()
}

func GetMeetingByID(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID) (*Meeting, error) {
	return scanMeeting(db.QueryRow(ctx, meetingSelect+` WHERE m.id = $1`, meetingID))
}

// GetMeetingsForUser returns every meeting pooled under ownerID (a partner
// sees their whole team's meetings this way), optionally narrowed to the
// meetings one team member is part of — assigned to them or scheduled by
// them — so a team member doesn't see the rest of the team's.
func GetMeetingsForUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, memberID, doctorID *uuid.UUID, status, from, to string) ([]Meeting, error) {
	// Hide meetings whose doctor has since been deleted — a title-only
	// meeting (no doctor_id) is unaffected.
	conditions := []string{"m.user_id = $1", "(d.id IS NULL OR d.is_deleted = FALSE)"}
	args := []any{userID}
	argIdx := 2

	if memberID != nil {
		conditions = append(conditions, fmt.Sprintf("(m.assigned_to = $%d OR m.created_by = $%d)", argIdx, argIdx))
		args = append(args, *memberID)
		argIdx++
	}
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

	rows, err := db.Query(ctx, meetingSelect+" WHERE "+strings.Join(conditions, " AND ")+" ORDER BY m.scheduled_at ASC", args...)
	if err != nil {
		return nil, err
	}
	return scanMeetings(rows)
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
		where = " WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM meetings m"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := meetingSelect + where + fmt.Sprintf(`
		ORDER BY m.scheduled_at DESC
		LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	meetings, err := scanMeetings(rows)
	return meetings, total, err
}

func UpdateMeeting(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, req UpdateMeetingRequest, actor uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE meetings SET doctor_id = $1, title = $2, scheduled_at = $3, notes = $4, mom = $5,
		   reminder_1day_sent = FALSE, reminder_1hour_sent = FALSE, updated_by = $7, updated_at = now()
		 WHERE id = $6`,
		req.DoctorID, req.Title, req.ScheduledAt, req.Notes, req.Mom, meetingID, actor,
	)
	return err
}

// UpdateMeetingMom lets the owner attach minutes-of-meeting notes without
// resetting the scheduled time / reminder flags (unlike the full UpdateMeeting).
func UpdateMeetingMom(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, mom *string, actor uuid.UUID) error {
	_, err := db.Exec(ctx, `UPDATE meetings SET mom = $1, updated_by = $3, updated_at = now() WHERE id = $2`, mom, meetingID, actor)
	return err
}

func UpdateMeetingStatus(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, status string, actor uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE meetings SET status = $1, status_changed_by = $3, status_changed_at = now(), updated_at = now() WHERE id = $2`,
		status, meetingID, actor,
	)
	return err
}

// UpdateMeetingAssignee hands a meeting to someone else on the team, and
// re-arms its reminders so the new assignee gets them.
func UpdateMeetingAssignee(ctx context.Context, db *pgxpool.Pool, meetingID, assignee, actor uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE meetings SET assigned_to = $1, reminder_1day_sent = FALSE, reminder_1hour_sent = FALSE,
		   updated_by = $3, updated_at = now()
		 WHERE id = $2`,
		assignee, meetingID, actor,
	)
	return err
}

func DeleteMeeting(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM meetings WHERE id = $1`, meetingID)
	return err
}

// GetDueReminders returns upcoming meetings whose reminder window ("1day" or
// "1hour" before scheduled_at) has been entered but the reminder hasn't been
// sent yet. Each carries NotifyUserID — the person it should go to.
func GetDueReminders(ctx context.Context, db *pgxpool.Pool, kind string) ([]Meeting, error) {
	interval := "1 day"
	reminderCol := "reminder_1day_sent"
	if kind == "1hour" {
		interval = "1 hour"
		reminderCol = "reminder_1hour_sent"
	}

	query := meetingSelect + fmt.Sprintf(`
		WHERE m.status = 'upcoming'
		  AND m.%s = FALSE
		  AND m.scheduled_at > now()
		  AND m.scheduled_at <= now() + interval '%s'`, reminderCol, interval)

	rows, err := db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	return scanMeetings(rows)
}

func MarkReminderSent(ctx context.Context, db *pgxpool.Pool, meetingID uuid.UUID, kind string) error {
	col := "reminder_1day_sent"
	if kind == "1hour" {
		col = "reminder_1hour_sent"
	}
	_, err := db.Exec(ctx, `UPDATE meetings SET `+col+` = TRUE WHERE id = $1`, meetingID)
	return err
}

// DeleteUpcomingBirthdayMeeting removes the auto-created, not-yet-happened
// "Birthday" calendar entry for a doctor — called right before re-creating
// it whenever the doctor's DOB is set or edited, so stale entries (wrong
// date, or DOB cleared) don't linger.
func DeleteUpcomingBirthdayMeeting(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`DELETE FROM meetings WHERE doctor_id = $1 AND title = 'Birthday' AND status = 'upcoming' AND scheduled_at > now()`,
		doctorID,
	)
	return err
}

// DeleteUpcomingAnniversaryMeeting mirrors DeleteUpcomingBirthdayMeeting for
// the "Anniversary" auto-created calendar entry.
func DeleteUpcomingAnniversaryMeeting(ctx context.Context, db *pgxpool.Pool, doctorID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`DELETE FROM meetings WHERE doctor_id = $1 AND title = 'Anniversary' AND status = 'upcoming' AND scheduled_at > now()`,
		doctorID,
	)
	return err
}
