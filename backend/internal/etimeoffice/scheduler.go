package etimeoffice

import (
	"context"
	"errors"
	"log"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ScheduleInterval is how often attendance is pulled from eTimeOffice on
// its own. Each run is the same window "Sync now" uses (1st of last month
// through today), so days eTimeOffice rewrites later are picked up too.
const ScheduleInterval = time.Hour

// ScheduleEnabled reports whether this process should run the hourly sync:
// eTimeOffice credentials set, and ETIME_SCHEDULE not "off". Local
// development sets it off so a laptop and the server don't both call
// eTimeOffice every hour.
func ScheduleEnabled() bool {
	if _, err := CredentialsFromEnv(); err != nil {
		return false
	}
	return !strings.EqualFold(strings.TrimSpace(os.Getenv("ETIME_SCHEDULE")), "off")
}

// nextHour is the next full hour in IST after t. Not t.Truncate(time.Hour):
// that rounds in UTC, and IST is UTC+5:30, so it lands on the half hour.
func nextHour(t time.Time) time.Time {
	l := t.In(istZone)
	return time.Date(l.Year(), l.Month(), l.Day(), l.Hour()+1, 0, 0, 0, istZone)
}

// StartScheduler syncs attendance at the top of every hour. Runs are
// recorded in etime_sync_runs like a manual one, with no triggered_by. A
// run that finds a manual sync already going is skipped, not queued.
func StartScheduler(db *pgxpool.Pool) {
	if !ScheduleEnabled() {
		log.Printf("etimeoffice sync: schedule off (credentials missing or ETIME_SCHEDULE=off)")
		return
	}
	creds, _ := CredentialsFromEnv()
	log.Printf("etimeoffice sync: scheduled every %s, first at %s", ScheduleInterval, nextHour(time.Now()).Format("15:04"))

	for {
		time.Sleep(time.Until(nextHour(time.Now())))
		runScheduled(db, creds)
	}
}

func runScheduled(db *pgxpool.Pool, creds Credentials) {
	// a run is a few monthly requests, seconds each; this only stops a hung
	// connection from holding the lock past the next slot
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	from, err := DefaultSyncFrom(ctx, db)
	if err != nil {
		log.Printf("etimeoffice scheduled sync: default from: %v", err)
		return
	}
	run, err := Sync(ctx, db, creds, from, uuid.Nil)
	switch {
	case errors.Is(err, ErrSyncRunning):
		log.Printf("etimeoffice scheduled sync: skipped, a sync is already running")
	case err != nil:
		log.Printf("etimeoffice scheduled sync failed: %v", err)
	default:
		log.Printf("etimeoffice scheduled sync run %d: %d days, %d punches (%d new)", run.ID, run.DaysReceived, run.PunchesReceived, run.PunchesNew)
	}
}
