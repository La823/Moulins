package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RetailerDocument is a retailer's GST number or a drug licence, as their
// partner saved it (182_retailer_documents.sql).
type RetailerDocument struct {
	ID         uuid.UUID       `json:"id"`
	Kind       string          `json:"kind"` // gst | dl
	Number     string          `json:"number"`
	Details    json.RawMessage `json:"details,omitempty"` // the portal's answer when last checked
	VerifiedAt *time.Time      `json:"verified_at,omitempty"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// ListRetailerDocuments is a partner's retailer's documents (none for a
// retailer that isn't theirs).
func ListRetailerDocuments(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID uuid.UUID) ([]RetailerDocument, error) {
	rows, err := db.Query(ctx, `
		SELECT d.id, d.kind, d.number, d.details, d.verified_at, d.updated_at
		FROM retailer_documents d JOIN retailers r ON r.user_id = d.retailer_id
		WHERE d.retailer_id = $1 AND r.partner_id = $2 AND r.removed_at IS NULL
		ORDER BY d.kind DESC, d.created_at`, retailerID, partnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RetailerDocument{}
	for rows.Next() {
		var d RetailerDocument
		if err := rows.Scan(&d.ID, &d.Kind, &d.Number, &d.Details, &d.VerifiedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// SaveRetailerDocument adds or updates one of the partner's retailer's
// documents. With details (a successful check) it is marked checked now;
// without, it is saved unchecked and any earlier check of that number is
// kept only if the number is unchanged.
func SaveRetailerDocument(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID uuid.UUID, kind, number string, details json.RawMessage) (uuid.UUID, error) {
	ok, err := isPartnersRetailer(ctx, db, partnerID, retailerID)
	if err != nil {
		return uuid.Nil, err
	}
	if !ok {
		return uuid.Nil, ErrNotYourRetailer
	}
	var det any
	if len(details) > 0 && string(details) != "null" {
		det = string(details)
	}
	var id uuid.UUID
	err = db.QueryRow(ctx, `
		INSERT INTO retailer_documents (retailer_id, kind, number, details, verified_at)
		VALUES ($1, $2, $3, $4::jsonb, CASE WHEN $4::jsonb IS NULL THEN NULL ELSE now() END)
		ON CONFLICT (retailer_id, kind, number) DO UPDATE SET
			details = COALESCE(EXCLUDED.details, retailer_documents.details),
			verified_at = COALESCE(EXCLUDED.verified_at, retailer_documents.verified_at),
			updated_at = now()
		RETURNING id`, retailerID, kind, number, det).Scan(&id)
	return id, err
}

func DeleteRetailerDocument(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID, docID uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		DELETE FROM retailer_documents d USING retailers r
		WHERE d.id = $1 AND d.retailer_id = $2 AND r.user_id = d.retailer_id AND r.partner_id = $3`, docID, retailerID, partnerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotYourRetailer
	}
	return nil
}

func isPartnersRetailer(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID uuid.UUID) (bool, error) {
	var ok bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM retailers WHERE user_id = $1 AND partner_id = $2 AND removed_at IS NULL)`,
		retailerID, partnerID).Scan(&ok)
	return ok, err
}
