package etimeoffice

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Day is one employee's day as the dashboard shows it: eTimeOffice's own
// figures plus State, our reading of them (see stateOf).
type Day struct {
	EmpCode         string   `json:"emp_code"`
	Name            string   `json:"name"`
	Date            string   `json:"date"`
	Status          *string  `json:"status"` // eTimeOffice code; null = not synced yet
	State           string   `json:"state"`
	InTime          *string  `json:"in_time"`
	OutTime         *string  `json:"out_time"`
	WorkMinutes     int      `json:"work_minutes"`
	OvertimeMinutes int      `json:"overtime_minutes"`
	LateMinutes     int      `json:"late_minutes"`
	EarlyOutMinutes int      `json:"early_out_minutes"`
	Remark          *string  `json:"remark"`
	Punches         []PunchT `json:"punches"`
}

type PunchT struct {
	Time   string `json:"time"` // "HH:MM"
	Manual bool   `json:"manual"`
}

// stateOf turns eTimeOffice's status into what actually happened.
// eTimeOffice marks a day "A" whenever the out punch is missing — including
// today for everyone still at work — so "A" with an in time is not an absence.
func stateOf(status, inTime, outTime *string, isToday bool) string {
	if status == nil {
		return "not_synced"
	}
	hasIn := inTime != nil && *inTime != ""
	hasOut := outTime != nil && *outTime != ""
	switch *status {
	case "P":
		return "present"
	case "P/2":
		return "half_day"
	case "WO":
		if hasIn {
			return "present" // worked on the weekly off
		}
		return "weekly_off"
	case "HL":
		if hasIn {
			return "present"
		}
		return "holiday"
	case "A":
		if !hasIn {
			return "absent"
		}
		if isToday && !hasOut {
			return "in"
		}
		return "missed_punch"
	}
	return "other"
}

// Totals summarise a set of days for one person or one date.
type Totals struct {
	Present         float64 `json:"present"` // half days count 0.5
	In              int     `json:"in"`
	HalfDay         int     `json:"half_day"`
	Absent          int     `json:"absent"`
	MissedPunch     int     `json:"missed_punch"`
	WeeklyOff       int     `json:"weekly_off"`
	Holiday         int     `json:"holiday"`
	Late            int     `json:"late"`
	LateMinutes     int     `json:"late_minutes"`
	EarlyOut        int     `json:"early_out"`
	WorkMinutes     int     `json:"work_minutes"`
	OvertimeMinutes int     `json:"overtime_minutes"`
}

func (t *Totals) add(d Day) {
	switch d.State {
	case "present":
		t.Present++
	case "in":
		t.In++
		t.Present++
	case "half_day":
		t.HalfDay++
		t.Present += 0.5
	case "absent":
		t.Absent++
	case "missed_punch":
		t.MissedPunch++
	case "weekly_off":
		t.WeeklyOff++
	case "holiday":
		t.Holiday++
	}
	if d.LateMinutes > 0 && d.InTime != nil {
		t.Late++
		t.LateMinutes += d.LateMinutes
	}
	if d.EarlyOutMinutes > 0 {
		t.EarlyOut++
	}
	t.WorkMinutes += d.WorkMinutes
	t.OvertimeMinutes += d.OvertimeMinutes
}

// loadDays returns every active employee's day for each date in [from, to],
// with that day's punches, ordered by employee then date. A date eTimeOffice
// hasn't been synced for comes back with State "not_synced".
func loadDays(ctx context.Context, db *pgxpool.Pool, from, to time.Time, empCode string) ([]Day, error) {
	today := Today().Format(isoDate)
	rows, err := db.Query(ctx, `
		SELECT e.emp_code, e.name, to_char(g.d, 'YYYY-MM-DD'),
		       d.status, d.in_time, d.out_time,
		       COALESCE(d.work_minutes, 0), COALESCE(d.overtime_minutes, 0),
		       COALESCE(d.late_minutes, 0), COALESCE(d.early_out_minutes, 0), d.remark,
		       COALESCE(p.times, '{}'), COALESCE(p.manual, '{}')
		FROM etime_employees e
		CROSS JOIN generate_series($1::timestamp, $2::timestamp, interval '1 day') AS g(d)
		LEFT JOIN etime_daily d ON d.emp_code = e.emp_code AND d.work_date = g.d::date
		LEFT JOIN LATERAL (
			SELECT array_agg(to_char(punch_time, 'HH24:MI') ORDER BY punch_time) AS times,
			       array_agg(manual ORDER BY punch_time) AS manual
			FROM etime_punches
			WHERE emp_code = e.emp_code
			  AND punch_time >= g.d AND punch_time < g.d + interval '1 day'
		) p ON TRUE
		WHERE ($3 = '' AND e.active) OR e.emp_code = $3
		ORDER BY e.emp_code, g.d`,
		from.Format(isoDate), to.Format(isoDate), empCode)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Day, error) {
		var d Day
		var times []string
		var manual []bool
		err := row.Scan(&d.EmpCode, &d.Name, &d.Date, &d.Status, &d.InTime, &d.OutTime,
			&d.WorkMinutes, &d.OvertimeMinutes, &d.LateMinutes, &d.EarlyOutMinutes, &d.Remark,
			&times, &manual)
		d.Punches = make([]PunchT, len(times))
		for i := range times {
			d.Punches[i] = PunchT{Time: times[i], Manual: i < len(manual) && manual[i]}
		}
		d.State = stateOf(d.Status, d.InTime, d.OutTime, d.Date == today)
		return d, err
	})
}

type DayReport struct {
	Date    string `json:"date"`
	IsToday bool   `json:"is_today"`
	Totals  Totals `json:"totals"`
	Rows    []Day  `json:"rows"`
}

func GetDay(ctx context.Context, db *pgxpool.Pool, date time.Time) (*DayReport, error) {
	days, err := loadDays(ctx, db, date, date, "")
	if err != nil {
		return nil, err
	}
	r := &DayReport{Date: date.Format(isoDate), IsToday: date.Equal(Today()), Rows: days}
	for _, d := range days {
		r.Totals.add(d)
	}
	return r, nil
}

type MonthEmployee struct {
	EmpCode string `json:"emp_code"`
	Name    string `json:"name"`
	Totals  Totals `json:"totals"`
	Days    []Day  `json:"days"`
}

type MonthReport struct {
	Month     string          `json:"month"`
	Dates     []string        `json:"dates"`
	Employees []MonthEmployee `json:"employees"`
}

// GetMonth returns month (any date within it) per employee. For the current
// month, days after today are left out.
func GetMonth(ctx context.Context, db *pgxpool.Pool, month time.Time, empCode string) (*MonthReport, error) {
	from := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, istZone)
	to := from.AddDate(0, 1, -1)
	if today := Today(); to.After(today) {
		to = today
	}
	r := &MonthReport{Month: from.Format("2006-01"), Dates: []string{}, Employees: []MonthEmployee{}}
	if from.After(to) {
		return r, nil
	}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		r.Dates = append(r.Dates, d.Format(isoDate))
	}
	days, err := loadDays(ctx, db, from, to, empCode)
	if err != nil {
		return nil, err
	}
	for _, d := range days {
		if n := len(r.Employees); n == 0 || r.Employees[n-1].EmpCode != d.EmpCode {
			r.Employees = append(r.Employees, MonthEmployee{EmpCode: d.EmpCode, Name: d.Name})
		}
		e := &r.Employees[len(r.Employees)-1]
		e.Days = append(e.Days, d)
		e.Totals.add(d)
	}
	return r, nil
}

type LogPunch struct {
	ID      int64  `json:"id"`
	EmpCode string `json:"emp_code"`
	Name    string `json:"name"`
	Time    string `json:"time"` // "YYYY-MM-DD HH:MM:SS", IST
	Manual  bool   `json:"manual"`
}

// ListPunches is the raw scan log, newest first.
func ListPunches(ctx context.Context, db *pgxpool.Pool, from, to time.Time, empCode string, limit, offset int) ([]LogPunch, int, error) {
	const where = `WHERE p.punch_time >= $1::date AND p.punch_time < $2::date + 1 AND ($3 = '' OR p.emp_code = $3)`
	args := []any{from.Format(isoDate), to.Format(isoDate), empCode}

	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM etime_punches p `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, `
		SELECT p.id, p.emp_code, COALESCE(e.name, ''), to_char(p.punch_time, 'YYYY-MM-DD HH24:MI:SS'), p.manual
		FROM etime_punches p LEFT JOIN etime_employees e ON e.emp_code = p.emp_code
		`+where+` ORDER BY p.punch_time DESC, p.emp_code LIMIT $4 OFFSET $5`,
		append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	punches, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (LogPunch, error) {
		var p LogPunch
		err := row.Scan(&p.ID, &p.EmpCode, &p.Name, &p.Time, &p.Manual)
		return p, err
	})
	return punches, total, err
}

type Employee struct {
	EmpCode   string  `json:"emp_code"`
	Name      string  `json:"name"`
	Active    bool    `json:"active"`
	LastPunch *string `json:"last_punch"`
}

func ListEmployees(ctx context.Context, db *pgxpool.Pool) ([]Employee, error) {
	rows, err := db.Query(ctx, `
		SELECT e.emp_code, e.name, e.active,
		       (SELECT to_char(MAX(punch_time), 'YYYY-MM-DD HH24:MI') FROM etime_punches p WHERE p.emp_code = e.emp_code)
		FROM etime_employees e ORDER BY e.emp_code`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Employee, error) {
		var e Employee
		err := row.Scan(&e.EmpCode, &e.Name, &e.Active, &e.LastPunch)
		return e, err
	})
}

// SetEmployeeActive reports false when no such employee exists.
func SetEmployeeActive(ctx context.Context, db *pgxpool.Pool, empCode string, active bool) (bool, error) {
	tag, err := db.Exec(ctx, `UPDATE etime_employees SET active = $2, updated_at = NOW() WHERE emp_code = $1`, empCode, active)
	return tag.RowsAffected() > 0, err
}

// LatestDate is the newest day stored, "" when nothing has been synced.
func LatestDate(ctx context.Context, db *pgxpool.Pool) (string, error) {
	var s *string
	err := db.QueryRow(ctx, `SELECT to_char(MAX(work_date), 'YYYY-MM-DD') FROM etime_daily`).Scan(&s)
	if s == nil {
		return "", err
	}
	return *s, err
}
