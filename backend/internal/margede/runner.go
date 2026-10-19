package margede

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// staleRunAfter: a 'running' row older than this was abandoned by a
// backend restart. A full pull takes seconds, so this is generous.
const staleRunAfter = 30 * time.Minute

// Run is one row of marg_ede_sync_runs.
type Run struct {
	ID              int        `json:"id"`
	Status          string     `json:"status"`
	TriggerSource   string     `json:"trigger_source"`
	DatetimeFrom    string     `json:"datetime_from"`
	StartedAt       time.Time  `json:"started_at"`
	FinishedAt      *time.Time `json:"finished_at"`
	MargDateTime    string     `json:"marg_datetime"`
	MargDatastatus  string     `json:"marg_datastatus"`
	BillsReceived   int        `json:"bills_received"`
	ItemsReceived   int        `json:"items_received"`
	BillsNew        int        `json:"bills_new"`
	BillsChanged    int        `json:"bills_changed"`
	ItemsNew        int        `json:"items_new"`
	ItemsChanged    int        `json:"items_changed"`
	BillsDeleted    int        `json:"bills_deleted"`
	ItemsDeleted    int        `json:"items_deleted"`
	LedgerReceived  int        `json:"ledger_received"`
	LedgerNew       int        `json:"ledger_new"`
	LedgerChanged   int        `json:"ledger_changed"`
	LedgerDeleted   int        `json:"ledger_deleted"`
	ProductsNew     int        `json:"products_new"`
	ProductsChanged int        `json:"products_changed"`
	StockReceived   int        `json:"stock_received"`
	StockNew        int        `json:"stock_new"`
	StockChanged    int        `json:"stock_changed"`
	StockDeleted    int        `json:"stock_deleted"`
	Warning         string     `json:"warning"`
	Error           string     `json:"error"`
}

const runColumns = `id, status, trigger_source, COALESCE(datetime_from,''), started_at, finished_at,
	COALESCE(marg_datetime,''), COALESCE(marg_datastatus,''), bills_received, items_received,
	bills_new, bills_changed, items_new, items_changed, bills_deleted, items_deleted,
	ledger_received, ledger_new, ledger_changed, ledger_deleted,
	products_new, products_changed, stock_received, stock_new, stock_changed, stock_deleted,
	COALESCE(warning,''), COALESCE(error,'')`

func scanRun(scan func(dest ...any) error) (Run, error) {
	var r Run
	err := scan(&r.ID, &r.Status, &r.TriggerSource, &r.DatetimeFrom, &r.StartedAt, &r.FinishedAt,
		&r.MargDateTime, &r.MargDatastatus, &r.BillsReceived, &r.ItemsReceived,
		&r.BillsNew, &r.BillsChanged, &r.ItemsNew, &r.ItemsChanged, &r.BillsDeleted, &r.ItemsDeleted,
		&r.LedgerReceived, &r.LedgerNew, &r.LedgerChanged, &r.LedgerDeleted,
		&r.ProductsNew, &r.ProductsChanged, &r.StockReceived, &r.StockNew, &r.StockChanged, &r.StockDeleted,
		&r.Warning, &r.Error)
	return r, err
}

// GetRun fetches one run.
func GetRun(ctx context.Context, db *pgxpool.Pool, id int) (Run, error) {
	return scanRun(db.QueryRow(ctx, `SELECT `+runColumns+` FROM marg_ede_sync_runs WHERE id = $1`, id).Scan)
}

// ListRuns returns recent runs, newest first.
func ListRuns(ctx context.Context, db *pgxpool.Pool, limit int) ([]Run, error) {
	rows, err := db.Query(ctx, `SELECT `+runColumns+` FROM marg_ede_sync_runs ORDER BY started_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Run{}
	for rows.Next() {
		r, err := scanRun(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func reapStaleRuns(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		UPDATE marg_ede_sync_runs
		SET status = 'failed', finished_at = NOW(),
		    error = COALESCE(NULLIF(error,''), 'interrupted — the backend restarted while this sync was running')
		WHERE status = 'running' AND started_at < NOW() - $1::interval`,
		fmt.Sprintf("%d seconds", int(staleRunAfter.Seconds())))
	return err
}

var launchMu sync.Mutex

// start records a new run, or returns the id of the one already running.
func start(ctx context.Context, db *pgxpool.Pool, source, datetime string) (int, error) {
	launchMu.Lock()
	defer launchMu.Unlock()
	if err := reapStaleRuns(ctx, db); err != nil {
		log.Printf("marg ede sync: reap stale runs: %v", err)
	}
	var activeID int
	if err := db.QueryRow(ctx, `SELECT id FROM marg_ede_sync_runs WHERE status = 'running' LIMIT 1`).Scan(&activeID); err == nil {
		return activeID, fmt.Errorf("a bills sync is already running (run #%d)", activeID)
	}
	var id int
	err := db.QueryRow(ctx, `
		INSERT INTO marg_ede_sync_runs (status, trigger_source, datetime_from)
		VALUES ('running', $1, $2) RETURNING id`, source, datetime).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("could not start bills sync run: %w", err)
	}
	return id, nil
}

// finish runs fetch+apply for a started run and records the outcome.
func finish(ctx context.Context, db *pgxpool.Pool, runID int, datetime string, fetch func() (Details, error)) (Run, error) {
	fail := func(err error) (Run, error) {
		log.Printf("marg ede sync run %d failed: %v", runID, err)
		_, _ = db.Exec(context.Background(), `
			UPDATE marg_ede_sync_runs SET status='failed', finished_at=NOW(), error=$2 WHERE id=$1`,
			runID, err.Error())
		r, _ := GetRun(context.Background(), db, runID)
		return r, err
	}

	d, err := fetch()
	if err != nil {
		return fail(fmt.Errorf("fetch: %w", err))
	}
	res, err := Apply(ctx, db, d, datetime == "")
	if err != nil {
		return fail(err)
	}
	if res.ItemsSkipped > 0 {
		res.Warning = joinWarnings(res.Warning,
			fmt.Sprintf("%d lines skipped: their bill is neither in this pull nor stored", res.ItemsSkipped))
	}
	_, err = db.Exec(context.Background(), `
		UPDATE marg_ede_sync_runs
		SET status='completed', finished_at=NOW(), marg_datetime=$2, marg_datastatus=$3,
		    bills_received=$4, items_received=$5, bills_new=$6, bills_changed=$7,
		    items_new=$8, items_changed=$9, bills_deleted=$10, items_deleted=$11, warning=NULLIF($12,''),
		    ledger_received=$13, ledger_new=$14, ledger_changed=$15, ledger_deleted=$16,
		    products_received=$17, products_new=$18, products_changed=$19, products_deleted=$20,
		    stock_received=$21, stock_new=$22, stock_changed=$23, stock_deleted=$24
		WHERE id=$1`,
		runID, d.DateTime, d.Datastatus, res.BillsReceived, res.ItemsReceived, res.BillsNew, res.BillsChanged,
		res.ItemsNew, res.ItemsChanged, res.BillsDeleted, res.ItemsDeleted, res.Warning,
		res.LedgerReceived, res.LedgerNew, res.LedgerChanged, res.LedgerDeleted,
		res.Products.Received, res.Products.New, res.Products.Changed, res.Products.Deleted,
		res.Stock.Received, res.Stock.New, res.Stock.Changed, res.Stock.Deleted)
	if err != nil {
		log.Printf("marg ede sync run %d: could not record result: %v", runID, err)
	}
	log.Printf("marg ede sync run %d complete — %d bills (%d new, %d changed, %d deleted), %d lines (%d new, %d changed, %d deleted), %d ledger accounts (%d new, %d changed, %d deleted), %d products (%d new, %d changed, %d deleted), %d stock batches (%d new, %d changed, %d deleted)",
		runID, res.BillsReceived, res.BillsNew, res.BillsChanged, res.BillsDeleted,
		res.ItemsReceived, res.ItemsNew, res.ItemsChanged, res.ItemsDeleted,
		res.LedgerReceived, res.LedgerNew, res.LedgerChanged, res.LedgerDeleted,
		res.Products.Received, res.Products.New, res.Products.Changed, res.Products.Deleted,
		res.Stock.Received, res.Stock.New, res.Stock.Changed, res.Stock.Deleted)
	return GetRun(context.Background(), db, runID)
}

func joinWarnings(a, b string) string {
	if a == "" {
		return b
	}
	return a + "; " + b
}

// Launch starts a sync in the background and returns its run id. datetime
// "" = full pull.
func Launch(db *pgxpool.Pool, creds Credentials, source, datetime string) (int, error) {
	id, err := start(context.Background(), db, source, datetime)
	if err != nil {
		return id, err
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), staleRunAfter)
		defer cancel()
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("marg ede sync run %d panicked: %v", id, rec)
				_, _ = db.Exec(context.Background(), `
					UPDATE marg_ede_sync_runs SET status='failed', finished_at=NOW(), error=$2 WHERE id=$1`,
					id, fmt.Sprintf("internal error: %v", rec))
			}
		}()
		_, _ = finish(ctx, db, id, datetime, func() (Details, error) { return FetchWithRetry(creds, datetime) })
	}()
	return id, nil
}

// RunNow does a whole sync in the foreground (for the CLI). fetch lets the
// caller load from a saved file instead of calling Marg.
func RunNow(ctx context.Context, db *pgxpool.Pool, source, datetime string, fetch func() (Details, error)) (Run, error) {
	id, err := start(ctx, db, source, datetime)
	if err != nil {
		return Run{}, err
	}
	return finish(ctx, db, id, datetime, fetch)
}
