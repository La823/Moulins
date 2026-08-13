package models

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrDeletionRequestExists   = errors.New("a deletion request is already pending")
	ErrDeletionRequestNotFound = errors.New("deletion request not found")
)

type AccountDeletionRequest struct {
	ID          uuid.UUID  `json:"id"`
	UserID      uuid.UUID  `json:"user_id"`
	Reason      *string    `json:"reason,omitempty"`
	Status      string     `json:"status"`
	AdminNotes  *string    `json:"admin_notes,omitempty"`
	ProcessedBy *uuid.UUID `json:"processed_by,omitempty"`
	RequestedAt time.Time  `json:"requested_at"`
	ProcessedAt *time.Time `json:"processed_at,omitempty"`
	// Joined fields for the admin queue
	UserName  string `json:"user_name,omitempty"`
	UserPhone string `json:"user_phone,omitempty"`
	UserRole  string `json:"user_role,omitempty"`
}

// CreateDeletionRequest fails with ErrDeletionRequestExists if the user
// already has a pending request — enforced by a partial unique index so
// this is race-safe under concurrent submits.
func CreateDeletionRequest(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, reason *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx, `
		INSERT INTO account_deletion_requests (user_id, reason) VALUES ($1, $2) RETURNING id
	`, userID, reason).Scan(&id)
	if err != nil && isUniqueViolation(err) {
		return uuid.Nil, ErrDeletionRequestExists
	}
	return id, err
}

// GetLatestDeletionRequest returns the most recent deletion request for a
// user (of any status), or nil if they've never made one.
func GetLatestDeletionRequest(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (*AccountDeletionRequest, error) {
	var req AccountDeletionRequest
	err := db.QueryRow(ctx, `
		SELECT id, user_id, reason, status, admin_notes, processed_by, requested_at, processed_at
		FROM account_deletion_requests
		WHERE user_id = $1
		ORDER BY requested_at DESC
		LIMIT 1
	`, userID).Scan(&req.ID, &req.UserID, &req.Reason, &req.Status, &req.AdminNotes,
		&req.ProcessedBy, &req.RequestedAt, &req.ProcessedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &req, nil
}

// CancelDeletionRequest withdraws the user's own pending request.
func CancelDeletionRequest(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		UPDATE account_deletion_requests SET status = 'cancelled', processed_at = NOW()
		WHERE user_id = $1 AND status = 'pending'
	`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDeletionRequestNotFound
	}
	return nil
}

// GetPendingDeletionRequests lists every pending request for staff review,
// joined with the requester's identity.
func GetPendingDeletionRequests(ctx context.Context, db *pgxpool.Pool) ([]AccountDeletionRequest, error) {
	rows, err := db.Query(ctx, `
		SELECT r.id, r.user_id, r.reason, r.status, r.admin_notes, r.processed_by, r.requested_at, r.processed_at,
			COALESCE(u.username, ''), u.phone_number, u.role
		FROM account_deletion_requests r
		JOIN users u ON u.id = r.user_id
		WHERE r.status = 'pending'
		ORDER BY r.requested_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := []AccountDeletionRequest{}
	for rows.Next() {
		var req AccountDeletionRequest
		if err := rows.Scan(&req.ID, &req.UserID, &req.Reason, &req.Status, &req.AdminNotes,
			&req.ProcessedBy, &req.RequestedAt, &req.ProcessedAt,
			&req.UserName, &req.UserPhone, &req.UserRole); err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

// ApproveDeletionRequest marks the request completed and permanently
// deletes the requester's account in one transaction.
func ApproveDeletionRequest(ctx context.Context, db *pgxpool.Pool, requestID, adminID uuid.UUID) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	err = tx.QueryRow(ctx, `
		UPDATE account_deletion_requests SET status = 'completed', processed_by = $2, processed_at = NOW()
		WHERE id = $1 AND status = 'pending'
		RETURNING user_id
	`, requestID, adminID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrDeletionRequestNotFound
	}
	if err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// RejectDeletionRequest denies the request, leaving the account intact.
func RejectDeletionRequest(ctx context.Context, db *pgxpool.Pool, requestID, adminID uuid.UUID, notes *string) error {
	tag, err := db.Exec(ctx, `
		UPDATE account_deletion_requests
		SET status = 'rejected', admin_notes = $2, processed_by = $3, processed_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, requestID, notes, adminID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDeletionRequestNotFound
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
