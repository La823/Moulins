package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Request struct {
	ID          uuid.UUID  `json:"id"`
	UserID      uuid.UUID  `json:"user_id"`
	UserName    string     `json:"user_name,omitempty"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	AdminNotes  *string    `json:"admin_notes,omitempty"`
	ResolvedBy  *uuid.UUID `json:"resolved_by,omitempty"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateRequestRequest struct {
	Description string `json:"description"`
}

type UpdateRequestStatusRequest struct {
	Status     string  `json:"status"`
	AdminNotes *string `json:"admin_notes,omitempty"`
}

func CreateRequest(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, description string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO requests (user_id, description) VALUES ($1, $2) RETURNING id`,
		userID, description,
	).Scan(&id)
	return id, err
}

func GetRequestsForUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Request, error) {
	rows, err := db.Query(ctx,
		`SELECT id, user_id, description, status, admin_notes, resolved_by, resolved_at, created_at, updated_at
		 FROM requests WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := []Request{}
	for rows.Next() {
		var r Request
		if err := rows.Scan(&r.ID, &r.UserID, &r.Description, &r.Status, &r.AdminNotes, &r.ResolvedBy, &r.ResolvedAt, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		requests = append(requests, r)
	}
	return requests, rows.Err()
}

func GetRequestByID(ctx context.Context, db *pgxpool.Pool, requestID uuid.UUID) (*Request, error) {
	var r Request
	err := db.QueryRow(ctx,
		`SELECT id, user_id, description, status, admin_notes, resolved_by, resolved_at, created_at, updated_at
		 FROM requests WHERE id = $1`,
		requestID,
	).Scan(&r.ID, &r.UserID, &r.Description, &r.Status, &r.AdminNotes, &r.ResolvedBy, &r.ResolvedAt, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func GetAllRequests(ctx context.Context, db *pgxpool.Pool, status, userIDFilter string, limit, offset int) ([]Request, int, error) {
	conditions := []string{}
	args := []any{}
	argIdx := 1

	if status != "" {
		conditions = append(conditions, fmt.Sprintf("r.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}
	if userIDFilter != "" {
		conditions = append(conditions, fmt.Sprintf("r.user_id = $%d", argIdx))
		args = append(args, userIDFilter)
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + conditions[0]
		for _, c := range conditions[1:] {
			where += " AND " + c
		}
	}

	var total int
	countQuery := "SELECT count(*) FROM requests r" + where
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT r.id, r.user_id, u.username, r.description, r.status, r.admin_notes, r.resolved_by, r.resolved_at, r.created_at, r.updated_at
		FROM requests r
		JOIN users u ON u.id = r.user_id` + where + fmt.Sprintf(`
		ORDER BY r.created_at DESC
		LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	requests := []Request{}
	for rows.Next() {
		var r Request
		var username *string
		if err := rows.Scan(&r.ID, &r.UserID, &username, &r.Description, &r.Status, &r.AdminNotes, &r.ResolvedBy, &r.ResolvedAt, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, 0, err
		}
		if username != nil {
			r.UserName = *username
		}
		requests = append(requests, r)
	}
	return requests, total, rows.Err()
}

func UpdateRequestStatus(ctx context.Context, db *pgxpool.Pool, requestID, resolvedBy uuid.UUID, req UpdateRequestStatusRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE requests SET status = $1, admin_notes = $2, resolved_by = $3, resolved_at = now(), updated_at = now()
		 WHERE id = $4`,
		req.Status, req.AdminNotes, resolvedBy, requestID,
	)
	return err
}
