package vectorsearch

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func buildDoctorEmbedText(d *models.Doctor) string {
	parts := []string{d.Name}
	for _, f := range []*string{d.Speciality, d.ClinicName, d.LastMeetingNotes} {
		if f != nil && *f != "" {
			parts = append(parts, *f)
		}
	}
	return strings.Join(parts, ". ")
}

func buildDoctorPayload(d *models.Doctor) map[string]any {
	return map[string]any{
		"owner_id":    d.PartnerID.String(),
		"doctor_id":   d.ID.String(),
		"name":        d.Name,
		"speciality":  deref(d.Speciality),
		"clinic_name": deref(d.ClinicName),
	}
}

// SyncDoctorByID re-embeds and upserts a single doctor's vector — the
// entry point used by both the create/update handlers (fire-and-forget)
// and the backfill loop. The payload's owner_id (the doctor's partner) is
// the field every scoped search filters on — see AskScoped.
func SyncDoctorByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return err
	}

	doctor, err := models.GetDoctorByID(ctx, db, id)
	if err != nil {
		return fmt.Errorf("vectorsearch: load doctor: %w", err)
	}

	vector, err := EmbedText(ctx, cfg, buildDoctorEmbedText(doctor))
	if err != nil {
		return fmt.Errorf("vectorsearch: embed doctor: %w", err)
	}

	if err := upsertPoint(ctx, cfg, "doctors", id.String(), vector, buildDoctorPayload(doctor)); err != nil {
		return fmt.Errorf("vectorsearch: upsert doctor point: %w", err)
	}
	return nil
}

// DeleteDoctorVector removes a doctor's point from Qdrant — no DB read
// needed, the doctor is already gone by the time this is called.
func DeleteDoctorVector(ctx context.Context, id uuid.UUID) error {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return err
	}
	if err := deletePoint(ctx, cfg, "doctors", id.String()); err != nil {
		return fmt.Errorf("vectorsearch: delete doctor point: %w", err)
	}
	return nil
}
