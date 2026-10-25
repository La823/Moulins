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
		slot := NextSlot(time.Now())
		time.Sleep(time.Until(slot))
		since := quickPullSince(context.Background(), db, slot)
		runID, err := Launch(db, creds, "scheduled", since)
		if err != nil {
			log.Printf("marg ede sync: scheduled run not started: %v", err)
			continue
		}
		kind := "full"
		if since != "" {
			kind = "quick, since " + since
		}
		log.Printf("marg ede sync: scheduled run #%d started (%s)", runID, kind)
	}
}

// Full pulls on the hour; quick pulls (changes since the last run) at :15,
// :30 and :45. A full pull is the only way to see bills deleted outright in
// Marg, so a quick pull also falls back to full when the last full pull is
// older than fullPullMaxAge (a failed or skipped :00 run).
const (
	fullPullMaxAge = 75 * time.Minute
	// quickOverlap reaches back before the last run's Marg time, so a change
	// saved in Marg while that run was being assembled isn't missed. Rows
	// sent twice cost nothing: unchanged rows aren't written.
	quickOverlap   = 10 * time.Minute
	margTimeFormat = "2006-01-02 15:04:05"
)

// quickPullSince is the Datetime for the run at slot: "" for a full pull,
// else Marg's own clock at the last completed run, less the overlap.
func quickPullSince(ctx context.Context, db *pgxpool.Pool, slot time.Time) string {
	var lastMarg string
	var lastFull *time.Time
	err := db.QueryRow(ctx, `
		SELECT COALESCE((SELECT marg_datetime FROM marg_ede_sync_runs
		                 WHERE status = 'completed' AND COALESCE(marg_datetime, '') <> ''
		                 ORDER BY started_at DESC LIMIT 1), ''),
		       (SELECT MAX(started_at) FROM marg_ede_sync_runs
		        WHERE status = 'completed' AND COALESCE(datetime_from, '') = '')`).Scan(&lastMarg, &lastFull)
	if err != nil {
		log.Printf("marg ede sync: reading the last runs failed (%v); doing a full pull", err)
		return ""
	}
	return chooseSince(slot, lastMarg, lastFull)
}

// chooseSince decides full ("") or quick (a Marg time) for a slot.
func chooseSince(slot time.Time, lastMarg string, lastFull *time.Time) string {
	if slot.In(istZone).Minute() == 0 || lastFull == nil || slot.Sub(*lastFull) > fullPullMaxAge {
		return ""
	}
	t, err := time.ParseInLocation(margTimeFormat, lastMarg, istZone)
	if err != nil {
		return ""
	}
	return t.Add(-quickOverlap).Format(margTimeFormat)
}
