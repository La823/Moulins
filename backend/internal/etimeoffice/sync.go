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
const MaxSyncDays = 92

// chunkDays is how much one eTimeOffice request asks for. Its range limits
// are undocumented; a week keeps each response modest.
const chunkDays = 7

// ErrSyncRunning is returned when a sync is already in progress.
var ErrSyncRunning = errors.New("a sync is already running")

var syncMu sync.Mutex

type SyncRun struct {
	ID              int        `json:"id"`
	StartedAt       time.Time  `json:"started_at"`
	FinishedAt      *time.Time `json:"finished_at"`
	Status          string     `json:"status"`
	RangeFrom       string     `json:"range_from"` // IST, "2006-01-02T15:04"
	RangeTo         string     `json:"range_to"`
	PunchesReceived int        `json:"punches_received"`
	PunchesNew      int        `json:"punches_new"`
	Error           *string    `json:"error"`
}

// DefaultSyncFrom picks up where the data left off: the start of the day of
// the latest stored punch (re-pulling that day catches punches the scanner
// uploaded late), or the start of today when nothing is stored yet.
func DefaultSyncFrom(ctx context.Context, db *pgxpool.Pool) (time.Time, error) {
	var latest *time.Time
	if err := db.QueryRow(ctx, `SELECT MAX(punch_time) FROM etime_punches`).Scan(&latest); err != nil {
		return time.Time{}, err
	}
	now := time.Now().In(istZone)
	if latest == nil {
		return startOfDay(now), nil
	}
	return startOfDay(wallClock(*latest)), nil
}

// Sync pulls punches from `from` until now and stores them. It runs inside
// the request — a button press covers days, not years, and finishes in
// seconds — and holds a lock so two presses can't interleave.
func Sync(ctx context.Context, db *pgxpool.Pool, creds Credentials, from time.Time, triggeredBy uuid.UUID) (*SyncRun, error) {
	if !syncMu.TryLock() {
		return nil, ErrSyncRunning
	}
	defer syncMu.Unlock()

	to := time.Now().In(istZone)
	if from.After(to) {
		return nil, fmt.Errorf("start date is in the future")
	}
	if to.Sub(from) > MaxSyncDays*24*time.Hour {
		return nil, fmt.Errorf("a sync can cover at most %d days", MaxSyncDays)
	}

	var runID int
	err := db.QueryRow(ctx, `
		INSERT INTO etime_sync_runs (range_from, range_to, triggered_by)
		VALUES ($1, $2, $3) RETURNING id`,
		naive(from), naive(to), triggeredBy).Scan(&runID)
	if err != nil {
		return nil, fmt.Errorf("could not record sync run: %w", err)
	}

	received, inserted, syncErr := pullRange(ctx, db, creds, from, to)

	status, errText := "completed", ""
	if syncErr != nil {
		status, errText = "failed", syncErr.Error()
		log.Printf("etimeoffice sync run %d failed: %v", runID, syncErr)
	}
	// context.Background: record the outcome even if the request was cancelled.
	_, err = db.Exec(context.Background(), `
		UPDATE etime_sync_runs
		SET finished_at=NOW(), status=$2, punches_received=$3, punches_new=$4, error=NULLIF($5,'')
		WHERE id=$1`, runID, status, received, inserted, errText)
	if err != nil {
		log.Printf("etimeoffice sync run %d: could not record outcome: %v", runID, err)
	}

	run, err := GetRun(context.Background(), db, runID)
	if err != nil {
		return nil, err
	}
	return run, syncErr
}

// pullRange fetches week by week, storing each week before asking for the
// next so a failure part-way keeps what already arrived.
func pullRange(ctx context.Context, db *pgxpool.Pool, creds Credentials, from, to time.Time) (received, inserted int, err error) {
	for start := from; start.Before(to); {
		end := start.Add(chunkDays * 24 * time.Hour).Add(-time.Minute)
		if end.After(to) {
			end = to
		}
		punches, err := FetchPunches(ctx, creds, start, end)
		if err != nil {
			return received, inserted, err
		}
		received += len(punches)
		n, err := storePunches(ctx, db, punches)
		if err != nil {
			return received, inserted, fmt.Errorf("saving punches: %w", err)
		}
		inserted += n
		start = end.Add(time.Minute)
	}
	return received, inserted, nil
}

// storePunches writes a batch in two statements (Supabase is ~430ms per
// round trip, so never row by row) and returns how many punches were new.
func storePunches(ctx context.Context, db *pgxpool.Pool, punches []Punch) (int, error) {
	if len(punches) == 0 {
		return 0, nil
	}
	codes := make([]string, len(punches))
	times := make([]time.Time, len(punches))
	flags := make([]string, len(punches))
	mcids := make([]string, len(punches))

	type emp struct {
		name        string
		first, last time.Time
	}
	emps := map[string]*emp{}
	for i, p := range punches {
		codes[i], times[i], flags[i], mcids[i] = p.EmpCode, naive(p.Time), p.MFlag, p.MCID
		e := emps[p.EmpCode]
		if e == nil {
			e = &emp{first: times[i], last: times[i]}
			emps[p.EmpCode] = e
		}
		if p.Name != "" {
			e.name = p.Name
		}
		if times[i].Before(e.first) {
			e.first = times[i]
		}
		if times[i].After(e.last) {
			e.last = times[i]
		}
	}

	var eCodes, eNames []string
	var eFirst, eLast []time.Time
	for code, e := range emps {
		eCodes = append(eCodes, code)
		eNames = append(eNames, e.name)
		eFirst = append(eFirst, e.first)
		eLast = append(eLast, e.last)
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO etime_employees (emp_code, name, first_seen, last_seen)
		SELECT * FROM unnest($1::text[], $2::text[], $3::timestamp[], $4::timestamp[])
		ON CONFLICT (emp_code) DO UPDATE SET
			name       = COALESCE(NULLIF(EXCLUDED.name, ''), etime_employees.name),
			first_seen = LEAST(etime_employees.first_seen, EXCLUDED.first_seen),
			last_seen  = GREATEST(etime_employees.last_seen, EXCLUDED.last_seen),
			updated_at = NOW()`,
		eCodes, eNames, eFirst, eLast)
	if err != nil {
		return 0, err
	}

	tag, err := tx.Exec(ctx, `
		INSERT INTO etime_punches (emp_code, punch_time, m_flag, mcid)
		SELECT c, t, NULLIF(f, ''), NULLIF(m, '')
		FROM unnest($1::text[], $2::timestamp[], $3::text[], $4::text[]) AS u(c, t, f, m)
		ON CONFLICT (emp_code, punch_time) DO NOTHING`,
		codes, times, flags, mcids)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func GetRun(ctx context.Context, db *pgxpool.Pool, id int) (*SyncRun, error) {
	runs, err := listRuns(ctx, db, `WHERE id = $1`, id)
	if err != nil || len(runs) == 0 {
		return nil, fmt.Errorf("sync run %d not found", id)
	}
	return &runs[0], nil
}

func RecentRuns(ctx context.Context, db *pgxpool.Pool, limit int) ([]SyncRun, error) {
	return listRuns(ctx, db, `ORDER BY id DESC LIMIT $1`, limit)
}

func listRuns(ctx context.Context, db *pgxpool.Pool, clause string, args ...any) ([]SyncRun, error) {
	rows, err := db.Query(ctx, `
		SELECT id, started_at, finished_at, status, range_from, range_to,
		       punches_received, punches_new, error
		FROM etime_sync_runs `+clause, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (SyncRun, error) {
		var r SyncRun
		var from, to time.Time
		err := row.Scan(&r.ID, &r.StartedAt, &r.FinishedAt, &r.Status, &from, &to,
			&r.PunchesReceived, &r.PunchesNew, &r.Error)
		r.RangeFrom, r.RangeTo = from.Format(isoMinute), to.Format(isoMinute)
		return r, err
	})
}

const isoMinute = "2006-01-02T15:04"

// naive drops the zone, keeping IST wall-clock digits, for TIMESTAMP columns.
func naive(t time.Time) time.Time {
	t = t.In(istZone)
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.UTC)
}

// wallClock reads a TIMESTAMP column value (pgx returns it as UTC) back as IST.
func wallClock(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, istZone)
}

func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, istZone)
}
