package vectorsearch

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func buildMeetingEmbedText(m *models.Meeting) string {
	parts := []string{}
	if m.DoctorName != "" {
		parts = append(parts, "Meeting with "+m.DoctorName)
	}
	for _, f := range []*string{m.Title, m.Notes, m.Mom} {
		if f != nil && *f != "" {
			parts = append(parts, *f)
		}
	}
	if len(parts) == 0 {
		parts = append(parts, "Meeting")
	}
	return strings.Join(parts, ". ")
}

func buildMeetingPayload(m *models.Meeting, ownerID uuid.UUID) map[string]any {
	payload := map[string]any{
		"owner_id":     ownerID.String(),
		"meeting_id":   m.ID.String(),
		"title":        deref(m.Title),
		"status":       m.Status,
		"scheduled_at": m.ScheduledAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if m.DoctorID != nil {
		payload["doctor_id"] = m.DoctorID.String()
	}
	if m.DoctorName != "" {
		payload["doctor_name"] = m.DoctorName
	}
	return payload
}

// SyncMeetingByID re-embeds and upserts a single meeting's vector — the
// entry point used by both the create/update handlers (fire-and-forget)
// and the backfill loop. The payload's owner_id is resolved through
// ResolveOwnerID rather than taken from the meeting's raw UserID, so a
// team_member's meeting is tagged with their partner's id — matching how
// doctors are already scoped, and keeping the search filter identical
// across both entities.
func SyncMeetingByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return err
	}

	meeting, err := models.GetMeetingByID(ctx, db, id)
	if err != nil {
		return fmt.Errorf("vectorsearch: load meeting: %w", err)
	}

	ownerID, err := models.ResolveOwnerID(ctx, db, meeting.UserID)
	if err != nil {
		return fmt.Errorf("vectorsearch: resolve meeting owner: %w", err)
	}

	vector, err := EmbedText(ctx, cfg, buildMeetingEmbedText(meeting))
	if err != nil {
		return fmt.Errorf("vectorsearch: embed meeting: %w", err)
	}

	if err := upsertPoint(ctx, cfg, "meetings", id.String(), vector, buildMeetingPayload(meeting, ownerID)); err != nil {
		return fmt.Errorf("vectorsearch: upsert meeting point: %w", err)
	}
	return nil
}

// DeleteMeetingVector removes a meeting's point from Qdrant — no DB read
// needed, the meeting is already gone by the time this is called.
func DeleteMeetingVector(ctx context.Context, id uuid.UUID) error {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return err
	}
	if err := deletePoint(ctx, cfg, "meetings", id.String()); err != nil {
		return fmt.Errorf("vectorsearch: delete meeting point: %w", err)
	}
	return nil
}
