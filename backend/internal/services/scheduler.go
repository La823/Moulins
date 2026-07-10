package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// StartScheduler runs a lightweight background ticker for time-based jobs.
// Meeting reminders are the first user; any future scheduled job (e.g.
// picking up notifications.scheduled_at once that path is built) can add a
// branch here without introducing a second scheduler.
func StartScheduler(db *pgxpool.Pool) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		dispatchMeetingReminders(db)
	}
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
