package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margsync"
	"github.com/lavanyaarora/server/internal/models"
)

// StartScheduler runs a lightweight background ticker for time-based jobs.
// Meeting reminders need minute-level precision (the "1 hour before" alert
// has to fire close to the actual hour mark), so the ticker itself stays at
// 1 minute — but the birthday checks don't need that granularity at all, so
// they're gated to actually run once per calendar day instead of on every
// tick, tracked via lastBirthdayRunDate below.
func StartScheduler(db *pgxpool.Pool) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	var lastBirthdayRunDate string

	for range ticker.C {
		dispatchMeetingReminders(db)

		today := time.Now().Format("2006-01-02")
		if today != lastBirthdayRunDate {
			dispatchBirthdayReminders(db)
			dispatchBirthdayMeetingSync(db)
			dispatchMargSync(db)
			lastBirthdayRunDate = today
		}
	}
}

// dispatchMargSync runs the Marg ERP master-data sync once a day (piggy-
// backing on the same daily gate as the birthday jobs — this data doesn't
// need finer granularity, and admins can always trigger it on demand via
// POST /admin/marg-sync/trigger). A no-op if MARG_* env vars aren't set.
func dispatchMargSync(db *pgxpool.Pool) {
	ctx := context.Background()

	creds, err := margsync.CredentialsFromEnv()
	if err != nil {
		return // Marg integration not configured — nothing to do
	}

	lastSyncedAt, err := margsync.GetLastSyncedAt(ctx, db)
	if err != nil {
		log.Printf("scheduler: failed to read marg sync cursor: %v", err)
	}

	result, dateTime, err := margsync.RunSync(ctx, db, creds, lastSyncedAt)
	if err != nil {
		log.Printf("scheduler: failed to run marg sync: %v", err)
		return
	}
	log.Printf("scheduler: marg sync complete — %d products, %d batches, %d parties",
		result.ProductsUpserted, result.BatchesUpserted, result.PartiesUpserted)

	if err := margsync.SetLastSyncedAt(ctx, db, dateTime); err != nil {
		log.Printf("scheduler: failed to persist marg sync cursor: %v", err)
	}
}

// dispatchBirthdayMeetingSync keeps the "Birthday" calendar entry perpetual:
// once a doctor's upcoming Birthday meeting has passed (or was never
// created), it creates the next occurrence — mirroring what
// syncDoctorBirthdayMeeting does on doctor create/edit, but without needing
// a human to touch the record again. Safe to call every tick:
// HasUpcomingBirthdayMeeting makes this a no-op once next year's entry
// already exists.
func dispatchBirthdayMeetingSync(db *pgxpool.Pool) {
	ctx := context.Background()

	doctors, err := models.GetDoctorsWithDOB(ctx, db)
	if err != nil {
		log.Printf("scheduler: failed to fetch doctors with dob: %v", err)
		return
	}

	for _, d := range doctors {
		has, err := models.HasUpcomingBirthdayMeeting(ctx, db, d.ID)
		if err != nil {
			log.Printf("scheduler: failed to check birthday meeting for doctor %s: %v", d.ID, err)
			continue
		}
		if has {
			continue
		}

		next := nextBirthdayOccurrence(*d.DOB, time.Now())
		title := "Birthday"
		notes := "Doctor's birthday"
		req := models.CreateMeetingRequest{DoctorID: &d.ID, Title: &title, ScheduledAt: next, Notes: &notes}
		if _, err := models.CreateMeeting(ctx, db, d.PartnerID, req); err != nil {
			log.Printf("scheduler: failed to create birthday meeting for doctor %s: %v", d.ID, err)
		}
	}
}

// nextBirthdayOccurrence returns the next upcoming date (this year, or next
// year if this year's has already passed) that shares dob's month/day, at
// noon local time to stay clear of any midnight DST edge cases.
func nextBirthdayOccurrence(dob time.Time, now time.Time) time.Time {
	next := time.Date(now.Year(), dob.Month(), dob.Day(), 12, 0, 0, 0, now.Location())
	if next.Before(now) {
		next = next.AddDate(1, 0, 0)
	}
	return next
}

// dispatchBirthdayReminders sends one notification per doctor per day
// during the 10 days leading up to (and including) their birthday. It's
// safe to call every tick — MarkBirthdayReminderSent is keyed on
// (doctor_id, calendar date) so a doctor never gets duplicate reminders
// on the same day even though this runs every minute.
func dispatchBirthdayReminders(db *pgxpool.Pool) {
	ctx := context.Background()
	now := time.Now()

	doctors, err := models.GetDoctorsWithDOB(ctx, db)
	if err != nil {
		log.Printf("scheduler: failed to fetch doctors with dob: %v", err)
		return
	}

	for _, d := range doctors {
		next := time.Date(now.Year(), d.DOB.Month(), d.DOB.Day(), 0, 0, 0, 0, now.Location())
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		if next.Before(today) {
			next = next.AddDate(1, 0, 0)
		}
		daysUntil := int(next.Sub(today).Hours() / 24)
		if daysUntil < 0 || daysUntil > 9 {
			continue
		}

		sent, err := models.MarkBirthdayReminderSent(ctx, db, d.ID, today)
		if err != nil {
			log.Printf("scheduler: failed to record birthday reminder for doctor %s: %v", d.ID, err)
			continue
		}
		if !sent {
			continue // already sent today
		}

		title := "🎂 Upcoming doctor birthday"
		body := fmt.Sprintf("Dr. %s's birthday is today!", d.Name)
		if daysUntil > 0 {
			body = fmt.Sprintf("Dr. %s's birthday is in %d day%s (%s).", d.Name, daysUntil, plural(daysUntil), next.Format("Jan 2"))
		}
		deepLink := fmt.Sprintf("/doctors/%s", d.ID)

		if err := SendDirectNotification(ctx, db, d.PartnerID, title, body, &deepLink); err != nil {
			log.Printf("scheduler: failed to send birthday reminder for doctor %s: %v", d.ID, err)
		}
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func dispatchMeetingReminders(db *pgxpool.Pool) {
	ctx := context.Background()

	for _, kind := range []string{"1day", "1hour"} {
		due, err := models.GetDueReminders(ctx, db, kind)
		if err != nil {
			log.Printf("scheduler: failed to fetch %s-due meetings: %v", kind, err)
			continue
		}

		for _, m := range due {
			when := "tomorrow"
			if kind == "1hour" {
				when = "in 1 hour"
			}
			title := "Upcoming meeting reminder"
			body := fmt.Sprintf("Your meeting with Dr. %s is %s (%s).", m.DoctorName, when, m.ScheduledAt.Format("Jan 2, 3:04 PM"))
			deepLink := fmt.Sprintf("/meetings/%s", m.ID)

			if err := SendDirectNotification(ctx, db, m.UserID, title, body, &deepLink); err != nil {
				log.Printf("scheduler: failed to send %s reminder for meeting %s: %v", kind, m.ID, err)
				continue
			}
			if err := models.MarkReminderSent(ctx, db, m.ID, kind); err != nil {
				log.Printf("scheduler: failed to mark %s reminder sent for meeting %s: %v", kind, m.ID, err)
			}
		}
	}
}
