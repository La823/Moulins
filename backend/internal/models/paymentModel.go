package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Payment struct {
	ID              uuid.UUID  `json:"id"`
	UserID          uuid.UUID  `json:"user_id"`
	Amount          float64    `json:"amount"`
	ScreenshotKey   string     `json:"-"`
	ScreenshotURL   string     `json:"screenshot_url,omitempty"`
	Status          string     `json:"status"`
	VerifiedBy      *uuid.UUID `json:"verified_by,omitempty"`
	VerifiedAt      *time.Time `json:"verified_at,omitempty"`
	RejectionReason *string    `json:"rejection_reason,omitempty"`
	Notes           *string    `json:"notes,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	// Joined fields for staff view
	UserName  string `json:"user_name,omitempty"`
	UserPhone string `json:"user_phone,omitempty"`
}

func CreatePayment(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, amount float64, screenshotKey string, notes *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO payments (user_id, amount, screenshot_key, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
		userID, amount, screenshotKey, notes,
	).Scan(&id)
	return id, err
}

func GetPaymentsByUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Payment, error) {
	rows, err := db.Query(ctx,
		`SELECT id, user_id, amount, screenshot_key, status, verified_by, verified_at, rejection_reason, notes, created_at, updated_at
		 FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	payments := []Payment{}
	for rows.Next() {
		var p Payment
		if err := rows.Scan(&p.ID, &p.UserID, &p.Amount, &p.ScreenshotKey, &p.Status, &p.VerifiedBy, &p.VerifiedAt, &p.RejectionReason, &p.Notes, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		payments = append(payments, p)
	}
	return payments, rows.Err()
}

type PaymentFilters struct {
	Status string
	Search string
}

func GetAllPayments(ctx context.Context, db *pgxpool.Pool, limit, offset int, filters PaymentFilters) ([]Payment, int, error) {
	where := ""
	args := []interface{}{}
	argIdx := 1

	if filters.Status != "" {
		where += fmt.Sprintf(" AND p.status = $%d", argIdx)
		args = append(args, filters.Status)
		argIdx++
	}
	if filters.Search != "" {
		where += fmt.Sprintf(" AND (u.username ILIKE $%d OR u.phone_number ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+filters.Search+"%")
		argIdx++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE 1=1%s`, where)
	var total int
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := fmt.Sprintf(`
		SELECT p.id, p.user_id, p.amount, p.screenshot_key, p.status, p.verified_by, p.verified_at, p.rejection_reason, p.notes, p.created_at, p.updated_at,
			COALESCE(u.username, '') AS user_name,
			COALESCE(u.phone_number, '') AS user_phone
		FROM payments p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE 1=1%s
		ORDER BY p.created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	payments := []Payment{}
	for rows.Next() {
		var p Payment
		if err := rows.Scan(&p.ID, &p.UserID, &p.Amount, &p.ScreenshotKey, &p.Status, &p.VerifiedBy, &p.VerifiedAt, &p.RejectionReason, &p.Notes, &p.CreatedAt, &p.UpdatedAt,
			&p.UserName, &p.UserPhone); err != nil {
			return nil, 0, err
		}
		payments = append(payments, p)
	}
	return payments, total, rows.Err()
}

func GetPaymentByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Payment, error) {
	var p Payment
	err := db.QueryRow(ctx,
		`SELECT p.id, p.user_id, p.amount, p.screenshot_key, p.status, p.verified_by, p.verified_at, p.rejection_reason, p.notes, p.created_at, p.updated_at,
			COALESCE(u.username, '') AS user_name,
			COALESCE(u.phone_number, '') AS user_phone
		 FROM payments p
		 LEFT JOIN users u ON u.id = p.user_id
		 WHERE p.id = $1`,
		id,
	).Scan(&p.ID, &p.UserID, &p.Amount, &p.ScreenshotKey, &p.Status, &p.VerifiedBy, &p.VerifiedAt, &p.RejectionReason, &p.Notes, &p.CreatedAt, &p.UpdatedAt,
		&p.UserName, &p.UserPhone)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// VerifyPayment marks a payment verified or rejected by staff. verified_by
// and verified_at record who reviewed it and when, regardless of outcome —
// only rejection_reason is outcome-specific, cleared on approval.
func VerifyPayment(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, verified bool, rejectionReason *string, adminID uuid.UUID) error {
	if verified {
		_, err := db.Exec(ctx,
			`UPDATE payments SET status = 'verified', verified_by = $1, verified_at = NOW(), rejection_reason = NULL, updated_at = NOW() WHERE id = $2`,
			adminID, id,
		)
		return err
	}
	_, err := db.Exec(ctx,
		`UPDATE payments SET status = 'rejected', rejection_reason = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW() WHERE id = $3`,
		rejectionReason, adminID, id,
	)
	return err
}
