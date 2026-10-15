package etimeoffice

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MaxSyncDays bounds one "Sync now" so a mistyped start date can't pull years.
// It also sets the first sync's backfill — enough to cover the scanner's
// whole history (it starts 20 Aug 2026).
const MaxSyncDays = 92

// chunkDays is how much one eTimeOffice request asks for. A month of both
// feeds came back in one response in testing.
const chunkDays = 31

var ErrSyncRunning = errors.New("a sync is already running")

var syncMu sync.Mutex

type SyncRun struct {
	ID              int        `json:"id"`
	StartedAt       time.Time  `json:"started_at"`
	FinishedAt      *time.Time `json:"finished_at"`
	Status          string     `json:"status"`
	DateFrom        string     `json:"date_from"`
	DateTo          string     `json:"date_to"`
	DaysReceived    int        `json:"days_received"`
	PunchesReceived int        `json:"punches_received"`
	PunchesNew      int        `json:"punches_new"`
	Error           *string    `json:"error"`
}

func Today() time.Time { return startOfDay(time.Now().In(istZone)) }

// DefaultSyncFrom backfills MaxSyncDays on the very first sync; after that it
// re-pulls from the 1st of last month. eTimeOffice rewrites past days whenever
// its settings change (a weekly off assigned, a holiday added, a manual punch),
// and re-pulling only the last week missed those: on 15 Oct 2026 an employee's
// weekly off was fixed in eTimeOffice and 4 Oct stayed "absent" here.
func DefaultSyncFrom(ctx context.Context, db *pgxpool.Pool) (time.Time, error) {
	var hasData bool
	if err := db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM etime_daily)`).Scan(&hasData); err != nil {
		return time.Time{}, err
	}
	return defaultFrom(Today(), hasData), nil
}

func defaultFrom(today time.Time, hasData bool) time.Time {
	if !hasData {
		return today.AddDate(0, 0, -(MaxSyncDays - 1))
	}
	return time.Date(today.Year(), today.Month()-1, 1, 0, 0, 0, 0, istZone)
}

// Sync pulls both feeds from `from` through today and stores them. It runs
// inside the request — at most a few monthly requests, seconds each — and
// holds a lock so two presses can't interleave.
func Sync(ctx context.Context, db *pgxpool.Pool, creds Credentials, from time.Time, triggeredBy uuid.UUID) (*SyncRun, error) {
	if !syncMu.TryLock() {
		return nil, ErrSyncRunning
	}
	defer syncMu.Unlock()

	from = startOfDay(from.In(istZone))
	to := Today()
	if from.After(to) {
		return nil, fmt.Errorf("start date is in the future")
	}
	if to.Sub(from) >= MaxSyncDays*24*time.Hour {
		return nil, fmt.Errorf("a sync can cover at most %d days", MaxSyncDays)
	}

	var runID int
	err := db.QueryRow(ctx, `
		INSERT INTO etime_sync_runs (date_from, date_to, triggered_by)
		VALUES ($1, $2, $3) RETURNING id`,
		from.Format(isoDate), to.Format(isoDate), triggeredBy).Scan(&runID)
	if err != nil {
		return nil, fmt.Errorf("could not record sync run: %w", err)
	}

	var days, received, inserted int
	var syncErr error
	// Stored chunk by chunk, so a failure part-way keeps what already arrived.
	for start := from; !start.After(to) && syncErr == nil; start = start.AddDate(0, 0, chunkDays) {
		end := start.AddDate(0, 0, chunkDays-1)
		if end.After(to) {
			end = to
		}
		d, r, n, err := pullChunk(ctx, db, creds, start, end)
		days, received, inserted = days+d, received+r, inserted+n
		syncErr = err
	}

	status, errText := "completed", ""
	if syncErr != nil {
		status, errText = "failed", syncErr.Error()
		log.Printf("etimeoffice sync run %d failed: %v", runID, syncErr)
	}
	// context.Background: record the outcome even if the request was cancelled.
	_, err = db.Exec(context.Background(), `
		UPDATE etime_sync_runs
		SET finished_at=NOW(), status=$2, days_received=$3, punches_received=$4, punches_new=$5, error=NULLIF($6,'')
		WHERE id=$1`, runID, status, days, received, inserted, errText)
	if err != nil {
		log.Printf("etimeoffice sync run %d: could not record outcome: %v", runID, err)
	}

	run, err := GetRun(context.Background(), db, runID)
	if err != nil {
		return nil, err
	}
	return run, syncErr
}

func pullChunk(ctx context.Context, db *pgxpool.Pool, creds Credentials, from, to time.Time) (days, received, inserted int, err error) {
	dayRecs, err := FetchDays(ctx, creds, from, to)
	if err != nil {
		return 0, 0, 0, err
	}
	punches, err := FetchPunches(ctx, creds, from, to.Add(23*time.Hour+59*time.Minute))
	if err != nil {
		return 0, 0, 0, err
	}
	inserted, err = store(ctx, db, dayRecs, punches)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("saving attendance: %w", err)
	}
	return len(dayRecs), len(punches), inserted, nil
}

// store writes one chunk in a single transaction of three batched statements
// (Supabase is ~430ms per round trip, so never row by row). Returns how many
// punches were new.
func store(ctx context.Context, db *pgxpool.Pool, days []DayRecord, punches []Punch) (int, error) {
	names := map[string]string{}
	for _, p := range punches {
		if p.Name != "" {
			names[p.EmpCode] = p.Name
		}
	}
	for _, d := range days {
		if d.Name != "" {
			names[d.EmpCode] = d.Name
		}
	}
	if len(names) == 0 {
		return 0, nil
	}
	var eCodes, eNames []string
	for code, name := range names {
		eCodes = append(eCodes, code)
		eNames = append(eNames, name)
	}

	n := len(days)
	dCode, dDate, dStatus, dIn, dOut, dRemark := make([]string, n), make([]string, n), make([]string, n), make([]string, n), make([]string, n), make([]string, n)
	dWork, dOT, dBreak, dLate, dEarly := make([]int32, n), make([]int32, n), make([]int32, n), make([]int32, n), make([]int32, n)
	for i, d := range days {
		dCode[i], dDate[i], dStatus[i], dIn[i], dOut[i], dRemark[i] = d.EmpCode, d.Date.Format(isoDate), d.Status, d.InTime, d.OutTime, d.Remark
		dWork[i], dOT[i], dBreak[i] = int32(d.WorkMinutes), int32(d.OvertimeMinutes), int32(d.BreakMinutes)
		dLate[i], dEarly[i] = int32(d.LateMinutes), int32(d.EarlyOutMinutes)
	}

	m := len(punches)
	pCode, pTime, pManual := make([]string, m), make([]time.Time, m), make([]bool, m)
	for i, p := range punches {
		pCode[i], pTime[i], pManual[i] = p.EmpCode, naive(p.Time), p.Manual
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO etime_employees (emp_code, name)
		SELECT * FROM unnest($1::text[], $2::text[])
		ON CONFLICT (emp_code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
		WHERE etime_employees.name IS DISTINCT FROM EXCLUDED.name`,
		eCodes, eNames)
	if err != nil {
		return 0, err
	}

	if n > 0 {
		_, err = tx.Exec(ctx, `
			INSERT INTO etime_daily (emp_code, work_date, status, in_time, out_time, work_minutes,
				overtime_minutes, break_minutes, late_minutes, early_out_minutes, remark)
			SELECT c, d::date, s, NULLIF(i, ''), NULLIF(o, ''), w, ot, b, l, e, NULLIF(r, '')
			FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[],
				$7::int[], $8::int[], $9::int[], $10::int[], $11::text[]) AS u(c, d, s, i, o, w, ot, b, l, e, r)
			ON CONFLICT (emp_code, work_date) DO UPDATE SET
				status = EXCLUDED.status, in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time,
				work_minutes = EXCLUDED.work_minutes, overtime_minutes = EXCLUDED.overtime_minutes,
				break_minutes = EXCLUDED.break_minutes, late_minutes = EXCLUDED.late_minutes,
				early_out_minutes = EXCLUDED.early_out_minutes, remark = EXCLUDED.remark, synced_at = NOW()`,
			dCode, dDate, dStatus, dIn, dOut, dWork, dOT, dBreak, dLate, dEarly, dRemark)
		if err != nil {
			return 0, err
		}
	}

	inserted := 0
	if m > 0 {
		tag, err := tx.Exec(ctx, `
			INSERT INTO etime_punches (emp_code, punch_time, manual)
			SELECT * FROM unnest($1::text[], $2::timestamp[], $3::bool[])
			ON CONFLICT (emp_code, punch_time) DO UPDATE SET manual = EXCLUDED.manual
			WHERE etime_punches.manual IS DISTINCT FROM EXCLUDED.manual`,
			pCode, pTime, pManual)
		if err != nil {
			return 0, err
		}
		inserted = int(tag.RowsAffected())
	}
	return inserted, tx.Commit(ctx)
}

func GetRun(ctx context.Context, db *pgxpool.Pool, id int) (*SyncRun, error) {
	runs, err := listRuns(ctx, db, `WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return nil, fmt.Errorf("sync run %d not found", id)
	}
	return &runs[0], nil
}

func RecentRuns(ctx context.Context, db *pgxpool.Pool, limit int) ([]SyncRun, error) {
	return listRuns(ctx, db, `ORDER BY id DESC LIMIT $1`, limit)
}

func listRuns(ctx context.Context, db *pgxpool.Pool, clause string, args ...any) ([]SyncRun, error) {
	rows, err := db.Query(ctx, `
		SELECT id, started_at, finished_at, status, to_char(date_from, 'YYYY-MM-DD'),
		       to_char(date_to, 'YYYY-MM-DD'), days_received, punches_received, punches_new, error
		FROM etime_sync_runs `+clause, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (SyncRun, error) {
		var r SyncRun
		err := row.Scan(&r.ID, &r.StartedAt, &r.FinishedAt, &r.Status, &r.DateFrom, &r.DateTo,
			&r.DaysReceived, &r.PunchesReceived, &r.PunchesNew, &r.Error)
		return r, err
	})
}

const isoDate = "2006-01-02"

// ParseDate reads a "YYYY-MM-DD" query value as an IST date.
func ParseDate(s string) (time.Time, error) {
	return time.ParseInLocation(isoDate, s, istZone)
}

// naive drops the zone, keeping IST wall-clock digits, for TIMESTAMP columns.
func naive(t time.Time) time.Time {
	t = t.In(istZone)
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.UTC)
}

func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, istZone)
}
