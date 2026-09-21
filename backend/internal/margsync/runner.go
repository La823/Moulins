package margsync

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// istZone is Marg's server clock. Confirmed empirically: a pull timestamped
// in UTC silently produces the wrong delta window, because Marg compares the
// Datetime we send against its own India-local wall clock.
var istZone = time.FixedZone("IST", 5*3600+1800)

// staleRunAfter is how long a run may sit in 'running' before it's assumed
// dead. A sync goroutine dies with the process, so a backend restart
// mid-sync would otherwise leave a 'running' row that blocks every future
// sync via the single-active unique index.
const staleRunAfter = 2 * time.Hour

// SyncWindow is one of the preset ranges offered in the admin panel.
type SyncWindow struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Desc  string `json:"description"`
}

// SyncWindows are the choices the UI offers. A narrow window is dramatically
// cheaper than a full pull — Marg returns only what changed, and a full pull
// is additionally rate-limited server-side ("Full sync limit exceeded").
var SyncWindows = []SyncWindow{
	{"last", "Since last sync", "Only what changed since the previous successful sync — fastest."},
	{"1w", "Last 1 week", "Everything Marg recorded as changed in the past 7 days."},
	{"1m", "Last 1 month", "Everything changed in the past 30 days. Recommended."},
	{"3m", "Last 3 months", "Wider catch-up window."},
	{"1y", "Last 1 year", "Effectively a rebuild — Marg caps the delta horizon."},
	{"full", "Full pull", "Asks Marg for everything. Rate-limited by Marg; use only if a window fails."},
}

func windowLabel(key string) string {
	for _, w := range SyncWindows {
		if w.Key == key {
			return w.Label
		}
	}
	return key
}

// ResolveWindow turns a window key into the Datetime parameter to send.
// An empty string means a full pull.
//
// Note a wide window is NOT the same as a full pull as far as Marg's rate
// limiter is concerned: delta pulls are not limited, and Marg caps how far
// back a delta reaches anyway, so "1y" behaves like a full pull while
// remaining callable at any time.
func ResolveWindow(ctx context.Context, db *pgxpool.Pool, key string) (string, error) {
	now := time.Now().In(istZone)
	format := func(t time.Time) string { return t.Format("2006-01-02 15:04:05") }

	switch key {
	case "full":
		return "", nil
	case "1w":
		return format(now.AddDate(0, 0, -7)), nil
	case "1m":
		return format(now.AddDate(0, -1, 0)), nil
	case "3m":
		return format(now.AddDate(0, -3, 0)), nil
	case "1y":
		return format(now.AddDate(-1, 0, 0)), nil
	case "last", "":
		cursor, err := GetLastSyncedAt(ctx, db)
		if err != nil {
			return "", err
		}
		// No cursor yet: fall back to a one-month window rather than a full
		// pull, so a first sync doesn't immediately burn the full-sync limit.
		if strings.TrimSpace(cursor) == "" {
			return format(now.AddDate(0, -1, 0)), nil
		}
		return cursor, nil
	default:
		return "", fmt.Errorf("unknown sync window %q", key)
	}
}

// SyncRun is one row of margmaster_sync_runs.
type SyncRun struct {
	ID             int        `json:"id"`
	Status         string     `json:"status"`
	TriggerSource  string     `json:"trigger_source"`
	WindowLabel    string     `json:"window_label"`
	DatetimeFrom   string     `json:"datetime_from"`
	Phase          string     `json:"phase"`
	StartedAt      time.Time  `json:"started_at"`
	FinishedAt     *time.Time `json:"finished_at"`
	RowsReceived   int        `json:"rows_received"`
	MargDateTime   string     `json:"marg_datetime"`
	MargDatastatus string     `json:"marg_datastatus"`
	ProductsTotal  int        `json:"products_total"`
	ProductsDone   int        `json:"products_done"`
	ProductsNew    int        `json:"products_new"`
	BatchesDone    int        `json:"batches_done"`
	PartiesTotal   int        `json:"parties_total"`
	PartiesDone    int        `json:"parties_done"`
	CursorAdvanced bool       `json:"cursor_advanced"`
	Warning        string     `json:"warning"`
	Error          string     `json:"error"`
	ElapsedSeconds int        `json:"elapsed_seconds"`
}

const syncRunColumns = `id, status, trigger_source, COALESCE(window_label,''), COALESCE(datetime_from,''),
	COALESCE(phase,''), started_at, finished_at, rows_received, COALESCE(marg_datetime,''),
	COALESCE(marg_datastatus,''), products_total, products_done, products_new, batches_done,
	parties_total, parties_done, cursor_advanced, COALESCE(warning,''), COALESCE(error,'')`

func scanSyncRun(scan func(dest ...any) error) (SyncRun, error) {
	var r SyncRun
	err := scan(&r.ID, &r.Status, &r.TriggerSource, &r.WindowLabel, &r.DatetimeFrom,
		&r.Phase, &r.StartedAt, &r.FinishedAt, &r.RowsReceived, &r.MargDateTime,
		&r.MargDatastatus, &r.ProductsTotal, &r.ProductsDone, &r.ProductsNew, &r.BatchesDone,
		&r.PartiesTotal, &r.PartiesDone, &r.CursorAdvanced, &r.Warning, &r.Error)
	if err != nil {
		return r, err
	}
	end := time.Now()
	if r.FinishedAt != nil {
		end = *r.FinishedAt
	}
	r.ElapsedSeconds = int(end.Sub(r.StartedAt).Seconds())
	return r, nil
}

// ReapStaleRuns marks abandoned 'running' rows as failed. Called before
// starting a run and on boot, so a crash mid-sync can't wedge the feature.
func ReapStaleRuns(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		UPDATE margmaster_sync_runs
		SET status = 'failed', finished_at = NOW(),
		    error = COALESCE(NULLIF(error,''), 'interrupted — the backend restarted while this sync was running')
		WHERE status = 'running' AND started_at < NOW() - $1::interval`,
		fmt.Sprintf("%d seconds", int(staleRunAfter.Seconds())))
	return err
}

// ActiveRun returns the in-flight run, or nil.
func ActiveRun(ctx context.Context, db *pgxpool.Pool) (*SyncRun, error) {
	row := db.QueryRow(ctx, `SELECT `+syncRunColumns+` FROM margmaster_sync_runs WHERE status = 'running' LIMIT 1`)
	r, err := scanSyncRun(row.Scan)
	if err != nil {
		return nil, nil // no active run
	}
	return &r, nil
}

// GetRun fetches one run by id.
func GetRun(ctx context.Context, db *pgxpool.Pool, id int) (SyncRun, error) {
	row := db.QueryRow(ctx, `SELECT `+syncRunColumns+` FROM margmaster_sync_runs WHERE id = $1`, id)
	return scanSyncRun(row.Scan)
}

// ListRuns returns recent runs, newest first.
func ListRuns(ctx context.Context, db *pgxpool.Pool, limit int) ([]SyncRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := db.Query(ctx, `SELECT `+syncRunColumns+` FROM margmaster_sync_runs ORDER BY started_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SyncRun{}
	for rows.Next() {
		r, err := scanSyncRun(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// launchMu serializes the reap-then-insert sequence so two simultaneous
// requests can't both pass the "nothing running" check. The unique index is
// the real guarantee; this just turns a racy constraint violation into a
// clean "already running" response.
var launchMu sync.Mutex

// Launch starts a sync in the background and returns its run id immediately.
//
// The sync is deliberately NOT run inside the HTTP request: a full pull
// moves thousands of rows and previously took over 40 minutes, far longer
// than any request timeout. Callers poll GetRun for progress.
func Launch(db *pgxpool.Pool, creds Credentials, source, windowKey string) (int, error) {
	launchMu.Lock()
	defer launchMu.Unlock()

	ctx := context.Background()
	if err := ReapStaleRuns(ctx, db); err != nil {
		log.Printf("marg sync: reap stale runs: %v", err)
	}
	if active, _ := ActiveRun(ctx, db); active != nil {
		return active.ID, fmt.Errorf("a sync is already running (run #%d, started %s)",
			active.ID, active.StartedAt.In(istZone).Format("15:04:05"))
	}

	datetime, err := ResolveWindow(ctx, db, windowKey)
	if err != nil {
		return 0, err
	}

	var runID int
	err = db.QueryRow(ctx, `
		INSERT INTO margmaster_sync_runs (status, trigger_source, window_label, datetime_from, phase)
		VALUES ('running', $1, $2, $3, 'queued') RETURNING id`,
		source, windowLabel(windowKey), datetime).Scan(&runID)
	if err != nil {
		return 0, fmt.Errorf("could not start sync run: %w", err)
	}

	go execute(db, creds, runID, datetime, windowKey)
	return runID, nil
}

// execute is the background body of a sync run.
func execute(db *pgxpool.Pool, creds Credentials, runID int, datetime, windowKey string) {
	// Detached from the request context on purpose — the sync must survive
	// the HTTP handler returning. Bounded so a wedged call can't run forever.
	ctx, cancel := context.WithTimeout(context.Background(), staleRunAfter)
	defer cancel()

	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("marg sync run %d panicked: %v", runID, rec)
			_, _ = db.Exec(context.Background(), `
				UPDATE margmaster_sync_runs SET status='failed', finished_at=NOW(), phase='failed', error=$2
				WHERE id=$1`, runID, fmt.Sprintf("internal error: %v", rec))
		}
	}()

	// Progress writes are throttled: ApplySyncProgress reports after every
	// chunk, and a database write per callback would add more load than the
	// sync itself.
	var lastWrite time.Time
	var mu sync.Mutex
	progress := func(p Progress) {
		mu.Lock()
		defer mu.Unlock()
		if p.Phase != "done" && time.Since(lastWrite) < time.Second {
			return
		}
		lastWrite = time.Now()
		_, err := db.Exec(ctx, `
			UPDATE margmaster_sync_runs
			SET phase=$2, rows_received=$3, products_total=$4, products_done=$5,
			    products_new=$6, batches_done=$7, parties_total=$8, parties_done=$9
			WHERE id=$1`,
			runID, p.Phase, p.RowsReceived, p.ProductsTotal, p.ProductsDone,
			p.ProductsNew, p.BatchesDone, p.PartiesTotal, p.PartiesDone)
		if err != nil {
			log.Printf("marg sync run %d: progress update failed: %v", runID, err)
		}
	}

	result, margDateTime, err := RunSyncWindow(ctx, db, creds, datetime, progress)
	if err != nil {
		log.Printf("marg sync run %d failed: %v", runID, err)
		_, _ = db.Exec(context.Background(), `
			UPDATE margmaster_sync_runs SET status='failed', finished_at=NOW(), phase='failed', error=$2
			WHERE id=$1`, runID, err.Error())
		return
	}

	// Only now is the cursor safe to move: the pull passed validation and
	// every row it contained was applied. Advancing it on anything less
	// makes the rows we missed permanently unreachable, because later deltas
	// only ask for changes *after* the cursor.
	warning := ""
	cursorAdvanced := false
	if windowKey == "full" || windowKey == "last" || windowKey == "1w" || windowKey == "1m" || windowKey == "3m" || windowKey == "1y" {
		if err := SetLastSyncedAt(ctx, db, margDateTime); err != nil {
			warning = "sync completed but the last-synced cursor could not be saved — the next sync may re-pull the same data"
			log.Printf("marg sync run %d: %v", runID, err)
		} else {
			cursorAdvanced = true
		}
	}

	_, _ = db.Exec(context.Background(), `
		UPDATE margmaster_sync_runs
		SET status='completed', finished_at=NOW(), phase='done',
		    rows_received=$2, products_done=$3, products_new=$4, batches_done=$5,
		    parties_done=$6, marg_datetime=$7, cursor_advanced=$8, warning=NULLIF($9,'')
		WHERE id=$1`,
		runID, result.RowsReceived, result.ProductsUpserted, result.ProductsNew,
		result.BatchesUpserted, result.PartiesUpserted, margDateTime, cursorAdvanced, warning)

	log.Printf("marg sync run %d complete — %d rows, %d products (%d new), %d batches, %d parties",
		runID, result.RowsReceived, result.ProductsUpserted, result.ProductsNew,
		result.BatchesUpserted, result.PartiesUpserted)
}
