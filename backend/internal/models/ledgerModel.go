package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Ledger struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	FileKey    string     `json:"file_key"`
	FileURL    string     `json:"file_url,omitempty"`
	UploadedBy *uuid.UUID `json:"uploaded_by,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// UpsertLedger replaces the partner's single current ledger — a fresh
// upload overwrites the previous one rather than accumulating history.
func UpsertLedger(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, fileKey string, uploadedBy uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO partner_ledgers (user_id, file_key, uploaded_by, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (user_id) DO UPDATE SET file_key = $2, uploaded_by = $3, updated_at = now()`,
		userID, fileKey, uploadedBy,
	)
	return err
}

func GetLedgerByUserID(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (*Ledger, error) {
	var l Ledger
	err := db.QueryRow(ctx,
		`SELECT id, user_id, file_key, uploaded_by, created_at, updated_at FROM partner_ledgers WHERE user_id = $1`,
		userID,
	).Scan(&l.ID, &l.UserID, &l.FileKey, &l.UploadedBy, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &l, nil
}
