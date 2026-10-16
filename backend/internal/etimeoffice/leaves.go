package etimeoffice

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Leave for office staff. Requests live in etime_leave_requests; each
// approved day is a row in etime_leave_days, which the reports merge into
// eTimeOffice's day status on read. The sync never touches either table.
//
// Balance: the monthly allowance accrues from the accrual start (or 1 Jan,
// whichever is later) and carries within the year; every paid leave day
// booked in that year — past or future — is taken off it.

// ErrLeave is a request the user can fix (bad dates, overlap, wrong state).
type ErrLeave struct{ msg string }

func (e ErrLeave) Error() string { return e.msg }

func leaveErr(format string, a ...any) error { return ErrLeave{fmt.Sprintf(format, a...)} }

// MaxLeaveSpan bounds one request.
const MaxLeaveSpan = 31

// leaveDates lists the days a leave covers — every date in from..to except
// Sundays, everyone's weekly off — and how many days that counts as.
func leaveDates(from, to time.Time, halfDay bool) ([]time.Time, float64) {
	var dates []time.Time
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if d.Weekday() != time.Sunday {
			dates = append(dates, d)
		}
	}
	days := float64(len(dates))
	if halfDay && len(dates) == 1 {
		days = 0.5
	}
	return dates, days
}

// accrualMonths is how many monthly allowances have accrued by the end of
// `month`: counted from the later of the accrual start and 1 January of that
// year, so unused leave carries within the year and resets each January.
func accrualMonths(start, month time.Time) int {
	from := time.Date(month.Year(), time.January, 1, 0, 0, 0, 0, istZone)
	if s := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, istZone); s.After(from) {
		from = s
	}
	m := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, istZone)
	if m.Before(from) {
		return 0
	}
	return (m.Year()-from.Year())*12 + int(m.Month()-from.Month()) + 1
}

func accrualStart(ctx context.Context, q querier) time.Time {
	var v string
	_ = q.QueryRow(ctx, `SELECT value FROM admin_settings WHERE key = 'etime_leave_accrual_start'`).Scan(&v)
	if t, err := time.ParseInLocation("2006-01", strings.TrimSpace(v), istZone); err == nil {
		return t
	}
	return time.Date(Today().Year(), time.January, 1, 0, 0, 0, 0, istZone)
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Balance struct {
	Month          string  `json:"month"` // YYYY-MM it is worked out for
	PerMonth       float64 `json:"per_month"`
	Accrued        float64 `json:"accrued"`         // allowance built up so far this year
	PaidBooked     float64 `json:"paid_booked"`     // paid leave approved this year, any month
	Available      float64 `json:"available"`       // accrued - paid_booked (can go below 0 only via admin "paid")
	UsedThisMonth  float64 `json:"used_this_month"` // approved leave days in `month`, paid or not
	UnpaidThisYear float64 `json:"unpaid_this_year"`
	PendingDays    float64 `json:"pending_days"`
}

func getBalance(ctx context.Context, q querier, empCode string, month time.Time) (*Balance, error) {
	b := &Balance{Month: month.Format("2006-01")}
	yearStart := time.Date(month.Year(), time.January, 1, 0, 0, 0, 0, istZone)
	monthStart := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, istZone)
	err := q.QueryRow(ctx, `
		SELECT e.leaves_per_month::float8,
		       COALESCE((SELECT SUM(portion) FROM etime_leave_days
		                 WHERE emp_code = e.emp_code AND paid AND leave_date >= $2 AND leave_date < $2::date + interval '1 year'), 0)::float8,
		       COALESCE((SELECT SUM(portion) FROM etime_leave_days
		                 WHERE emp_code = e.emp_code AND NOT paid AND leave_date >= $2 AND leave_date < $2::date + interval '1 year'), 0)::float8,
		       COALESCE((SELECT SUM(portion) FROM etime_leave_days
		                 WHERE emp_code = e.emp_code AND leave_date >= $3 AND leave_date < $3::date + interval '1 month'), 0)::float8,
		       COALESCE((SELECT SUM(days) FROM etime_leave_requests
		                 WHERE emp_code = e.emp_code AND status = 'pending'), 0)::float8
		FROM etime_employees e WHERE e.emp_code = $1`,
		empCode, yearStart.Format(isoDate), monthStart.Format(isoDate)).
		Scan(&b.PerMonth, &b.PaidBooked, &b.UnpaidThisYear, &b.UsedThisMonth, &b.PendingDays)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, leaveErr("employee %s not found", empCode)
	}
	if err != nil {
		return nil, err
	}
	b.Accrued = b.PerMonth * float64(accrualMonths(accrualStart(ctx, q), month))
	b.Available = b.Accrued - b.PaidBooked
	return b, nil
}

func GetBalance(ctx context.Context, db *pgxpool.Pool, empCode string, month time.Time) (*Balance, error) {
	return getBalance(ctx, db, empCode, month)
}

type LeaveRequest struct {
	ID            int        `json:"id"`
	EmpCode       string     `json:"emp_code"`
	Name          string     `json:"name"`
	FromDate      string     `json:"from_date"`
	ToDate        string     `json:"to_date"`
	HalfDay       bool       `json:"half_day"`
	Days          float64    `json:"days"`
	Reason        string     `json:"reason"`
	Status        string     `json:"status"`
	PaidDays      *float64   `json:"paid_days"`
	AppliedByName *string    `json:"applied_by_name"`
	AppliedBySelf bool       `json:"applied_by_self"` // false when an admin entered it for them
	DecidedByName *string    `json:"decided_by_name"`
	DecidedAt     *time.Time `json:"decided_at"`
	DecisionNote  *string    `json:"decision_note"`
	CreatedAt     time.Time  `json:"created_at"`
}

type NewLeave struct {
	EmpCode string
	From    time.Time
	To      time.Time
	HalfDay bool
	Reason  string
	By      uuid.UUID
}

// validate checks a request's dates and returns the days it covers.
func (n NewLeave) validate() ([]time.Time, float64, error) {
	if n.To.Before(n.From) {
		return nil, 0, leaveErr("the end date is before the start date")
	}
	if n.HalfDay && !n.To.Equal(n.From) {
		return nil, 0, leaveErr("a half day is a single date")
	}
	if n.To.Sub(n.From) >= MaxLeaveSpan*24*time.Hour {
		return nil, 0, leaveErr("one request can cover at most %d days", MaxLeaveSpan)
	}
	earliest := time.Date(Today().Year(), Today().Month()-1, 1, 0, 0, 0, 0, istZone)
	if n.From.Before(earliest) {
		return nil, 0, leaveErr("leave can't start before %s", earliest.Format("2 Jan 2006"))
	}
	if n.To.After(Today().AddDate(1, 0, 0)) {
		return nil, 0, leaveErr("leave can be booked at most a year ahead")
	}
	dates, days := leaveDates(n.From, n.To, n.HalfDay)
	if len(dates) == 0 {
		return nil, 0, leaveErr("those dates are all Sundays")
	}
	return dates, days, nil
}

// CreateLeave files a request. With approve set (an admin entering leave
// for someone) it is approved in the same transaction; paid as in Approve.
func CreateLeave(ctx context.Context, db *pgxpool.Pool, n NewLeave, approve bool, paid PaidMode, note string) (*LeaveRequest, error) {
	n.Reason = strings.TrimSpace(n.Reason)
	_, days, err := n.validate()
	if err != nil {
		return nil, err
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Serialise requests per employee so two overlapping ones can't both pass.
	var code string
	err = tx.QueryRow(ctx, `SELECT emp_code FROM etime_employees WHERE emp_code = $1 FOR UPDATE`, n.EmpCode).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, leaveErr("employee %s not found", n.EmpCode)
	}
	if err != nil {
		return nil, err
	}
	if err := checkOverlap(ctx, tx, n.EmpCode, n.From, n.To, 0); err != nil {
		return nil, err
	}

	var id int
	err = tx.QueryRow(ctx, `
		INSERT INTO etime_leave_requests (emp_code, from_date, to_date, half_day, days, reason, applied_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		n.EmpCode, n.From.Format(isoDate), n.To.Format(isoDate), n.HalfDay, days, n.Reason, n.By).Scan(&id)
	if err != nil {
		return nil, err
	}
	if approve {
		if err := approveTx(ctx, tx, id, paid, note, n.By); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return GetLeave(ctx, db, id)
}

func checkOverlap(ctx context.Context, tx pgx.Tx, empCode string, from, to time.Time, exceptID int) error {
	var clash *string
	err := tx.QueryRow(ctx, `
		SELECT to_char(from_date, 'DD Mon') || CASE WHEN to_date > from_date THEN ' – ' || to_char(to_date, 'DD Mon') ELSE '' END
		       || ' (' || status || ')'
		FROM etime_leave_requests
		WHERE emp_code = $1 AND status IN ('pending', 'approved') AND id <> $4
		  AND from_date <= $3 AND to_date >= $2
		LIMIT 1`, empCode, from.Format(isoDate), to.Format(isoDate), exceptID).Scan(&clash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return leaveErr("this overlaps leave already requested for %s", *clash)
}

// PaidMode says how an approval splits a leave into paid and unpaid days.
type PaidMode string

const (
	PaidAuto PaidMode = "auto" // paid while the balance lasts, the rest unpaid
	PaidAll  PaidMode = "paid"
	PaidNone PaidMode = "unpaid"
)

func ParsePaidMode(s string) (PaidMode, bool) {
	switch PaidMode(s) {
	case "", PaidAuto:
		return PaidAuto, true
	case PaidAll, PaidNone:
		return PaidMode(s), true
	}
	return "", false
}

// splitPaid decides, day by day in date order, which leave days are paid:
// with PaidAuto each day is paid while `available` covers it.
func splitPaid(portions []float64, available float64, mode PaidMode) []bool {
	paid := make([]bool, len(portions))
	for i, p := range portions {
		switch mode {
		case PaidAll:
			paid[i] = true
		case PaidNone:
			paid[i] = false
		default:
			if available >= p {
				paid[i] = true
				available -= p
			}
		}
	}
	return paid
}

func Approve(ctx context.Context, db *pgxpool.Pool, id int, paid PaidMode, note string, by uuid.UUID) (*LeaveRequest, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err := approveTx(ctx, tx, id, paid, note, by); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return GetLeave(ctx, db, id)
}

func approveTx(ctx context.Context, tx pgx.Tx, id int, mode PaidMode, note string, by uuid.UUID) error {
	var empCode, status string
	var from, to time.Time
	var halfDay bool
	err := tx.QueryRow(ctx, `
		SELECT emp_code, status, from_date, to_date, half_day
		FROM etime_leave_requests WHERE id = $1 FOR UPDATE`, id).Scan(&empCode, &status, &from, &to, &halfDay)
	if errors.Is(err, pgx.ErrNoRows) {
		return leaveErr("leave request %d not found", id)
	}
	if err != nil {
		return err
	}
	if status != "pending" {
		return leaveErr("this request is already %s", status)
	}
	from, to = asDate(from), asDate(to)
	// Lock the employee so concurrent approvals see each other's balance use.
	if _, err := tx.Exec(ctx, `SELECT 1 FROM etime_employees WHERE emp_code = $1 FOR UPDATE`, empCode); err != nil {
		return err
	}

	dates, _ := leaveDates(from, to, halfDay)
	portions := make([]float64, len(dates))
	for i := range dates {
		portions[i] = 1
		if halfDay {
			portions[i] = 0.5
		}
	}
	// Balance as of the month the leave ends: allowance accrued by then,
	// minus every paid day already booked that year.
	bal, err := getBalance(ctx, tx, empCode, to)
	if err != nil {
		return err
	}
	paid := splitPaid(portions, bal.Available, mode)

	codes := make([]string, len(dates))
	ds := make([]string, len(dates))
	paidDays := 0.0
	for i, d := range dates {
		codes[i], ds[i] = empCode, d.Format(isoDate)
		if paid[i] {
			paidDays += portions[i]
		}
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO etime_leave_days (emp_code, leave_date, request_id, portion, paid)
		SELECT c, d::date, $3, $4, p FROM unnest($1::text[], $2::text[], $5::bool[]) AS u(c, d, p)`,
		codes, ds, id, portions[0], paid)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return leaveErr("some of these days already have approved leave")
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE etime_leave_requests
		SET status = 'approved', paid_days = $2, decided_by = $3, decided_at = NOW(),
		    decision_note = NULLIF($4, ''), updated_at = NOW()
		WHERE id = $1`, id, paidDays, by, strings.TrimSpace(note))
	return err
}

func Reject(ctx context.Context, db *pgxpool.Pool, id int, note string, by uuid.UUID) (*LeaveRequest, error) {
	tag, err := db.Exec(ctx, `
		UPDATE etime_leave_requests
		SET status = 'rejected', decided_by = $2, decided_at = NOW(), decision_note = NULLIF($3, ''), updated_at = NOW()
		WHERE id = $1 AND status = 'pending'`, id, by, strings.TrimSpace(note))
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, leaveErr("only a pending request can be rejected")
	}
	return GetLeave(ctx, db, id)
}

// Cancel withdraws a request. Staff (onlyEmp set to their code) may cancel
// their own pending requests; admins may also cancel approved leave, which
// takes its days back off the attendance.
func Cancel(ctx context.Context, db *pgxpool.Pool, id int, onlyEmp string, by uuid.UUID) (*LeaveRequest, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var empCode, status string
	err = tx.QueryRow(ctx, `SELECT emp_code, status FROM etime_leave_requests WHERE id = $1 FOR UPDATE`, id).Scan(&empCode, &status)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && onlyEmp != "" && empCode != onlyEmp) {
		return nil, leaveErr("leave request %d not found", id)
	}
	if err != nil {
		return nil, err
	}
	switch {
	case status == "pending":
	case status == "approved" && onlyEmp == "":
	case status == "approved":
		return nil, leaveErr("approved leave can only be cancelled by an admin")
	default:
		return nil, leaveErr("this request is already %s", status)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM etime_leave_days WHERE request_id = $1`, id); err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `
		UPDATE etime_leave_requests
		SET status = 'cancelled', decided_by = $2, decided_at = NOW(), updated_at = NOW()
		WHERE id = $1`, id, by)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return GetLeave(ctx, db, id)
}

type LeaveFilter struct {
	EmpCode string
	Status  string     // "" = any
	Month   *time.Time // requests touching this month
	Limit   int
}

const leaveSelect = `
	SELECT r.id, r.emp_code, COALESCE(e.name, ''), to_char(r.from_date, 'YYYY-MM-DD'), to_char(r.to_date, 'YYYY-MM-DD'),
	       r.half_day, r.days::float8, r.reason, r.status, r.paid_days::float8,
	       ua.username, (r.applied_by IS NOT NULL AND r.applied_by = e.user_id),
	       ud.username, r.decided_at, r.decision_note, r.created_at
	FROM etime_leave_requests r
	JOIN etime_employees e ON e.emp_code = r.emp_code
	LEFT JOIN users ua ON ua.id = r.applied_by
	LEFT JOIN users ud ON ud.id = r.decided_by`

func scanLeave(row pgx.CollectableRow) (LeaveRequest, error) {
	var l LeaveRequest
	err := row.Scan(&l.ID, &l.EmpCode, &l.Name, &l.FromDate, &l.ToDate, &l.HalfDay, &l.Days, &l.Reason,
		&l.Status, &l.PaidDays, &l.AppliedByName, &l.AppliedBySelf, &l.DecidedByName, &l.DecidedAt,
		&l.DecisionNote, &l.CreatedAt)
	return l, err
}

func GetLeave(ctx context.Context, db *pgxpool.Pool, id int) (*LeaveRequest, error) {
	rows, err := db.Query(ctx, leaveSelect+` WHERE r.id = $1`, id)
	if err != nil {
		return nil, err
	}
	l, err := pgx.CollectExactlyOneRow(rows, scanLeave)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// ListLeaves returns requests newest first, pending ones first of all.
func ListLeaves(ctx context.Context, db *pgxpool.Pool, f LeaveFilter) ([]LeaveRequest, error) {
	var month any
	if f.Month != nil {
		month = time.Date(f.Month.Year(), f.Month.Month(), 1, 0, 0, 0, 0, istZone).Format(isoDate)
	}
	if f.Limit <= 0 {
		f.Limit = 500
	}
	rows, err := db.Query(ctx, leaveSelect+`
		WHERE ($1 = '' OR r.emp_code = $1)
		  AND ($2 = '' OR r.status = $2)
		  AND ($3::date IS NULL OR (r.from_date < $3::date + interval '1 month' AND r.to_date >= $3::date))
		ORDER BY (r.status = 'pending') DESC, r.from_date DESC, r.id DESC
		LIMIT $4`, f.EmpCode, f.Status, month, f.Limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanLeave)
}

func PendingCount(ctx context.Context, db *pgxpool.Pool) (int, error) {
	var n int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM etime_leave_requests WHERE status = 'pending'`).Scan(&n)
	return n, err
}

// EmployeeForUser finds the scanner employee linked to a staff login.
func EmployeeForUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (*Employee, error) {
	emps, err := listEmployees(ctx, db, `WHERE e.user_id = $1`, userID)
	if err != nil || len(emps) == 0 {
		return nil, err
	}
	return &emps[0], nil
}

// asDate reads a DATE column value (pgx returns UTC midnight) as an IST date.
func asDate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, istZone)
}
