package margede

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Interval between scheduled syncs. Every scheduled sync is a full pull:
// Marg reissues line IDs when a bill is edited, and only a full pull shows
// which old lines are gone. A full pull is one ~20 MB response that Marg
// assembles in a few seconds, and only changed rows are written.
const Interval = 15 * time.Minute

// fetchAttempts / fetchBackoff: Marg occasionally drops a connection
// ("forcibly closed by the remote host" was seen during exploration), so a
// scheduled run retries before giving up until the next slot.
const fetchAttempts = 3

var fetchBackoff = []time.Duration{20 * time.Second, 60 * time.Second}

// ScheduleEnabled reports whether this process should run the 15-minute
// sync: Corporate EDE credentials set, and MARG_EDE_SCHEDULE not "off".
// Local development sets it off so a laptop and the server don't both call
// Marg every 15 minutes (the single-active index would keep them from
// overlapping, but not from doubling the calls).
func ScheduleEnabled() bool {
	if _, err := CredentialsFromEnv(); err != nil {
		return false
	}
	return !strings.EqualFold(strings.TrimSpace(os.Getenv("MARG_EDE_SCHEDULE")), "off")
}

// NextSlot is the next quarter-hour boundary (:00, :15, :30, :45) after t.
func NextSlot(t time.Time) time.Time {
	next := t.Truncate(Interval).Add(Interval)
	return next
}

// FetchWithRetry is Fetch with retries on failure.
func FetchWithRetry(creds Credentials, datetime string) (Details, error) {
	var lastErr error
	for attempt := 0; attempt < fetchAttempts; attempt++ {
		if attempt > 0 {
			wait := fetchBackoff[min(attempt-1, len(fetchBackoff)-1)]
			log.Printf("marg ede sync: fetch failed (%v), retrying in %s", lastErr, wait)
			time.Sleep(wait)
		}
		d, err := Fetch(creds, datetime)
		if err == nil {
			return d, nil
		}
		lastErr = err
	}
	return Details{}, lastErr
}

// StartScheduler runs a full bills sync on every quarter-hour boundary.
// Runs go through Launch, so they are recorded in marg_ede_sync_runs and
// can never overlap a manual run or another server's scheduled one: the
// single-active unique index on marg_ede_sync_runs rejects a second
// 'running' row.
func StartScheduler(db *pgxpool.Pool) {
	if !ScheduleEnabled() {
		log.Printf("marg ede sync: schedule off (credentials missing or MARG_EDE_SCHEDULE=off)")
		return
	}
	creds, _ := CredentialsFromEnv()
	_ = reapStaleRuns(context.Background(), db)
	log.Printf("marg ede sync: scheduled every %s, first at %s", Interval, NextSlot(time.Now()).In(istZone).Format("15:04"))

	for {
		time.Sleep(time.Until(NextSlot(time.Now())))
		runID, err := Launch(db, creds, "scheduled", "")
		if err != nil {
			log.Printf("marg ede sync: scheduled run not started: %v", err)
			continue
		}
		log.Printf("marg ede sync: scheduled run #%d started", runID)
	}
}
