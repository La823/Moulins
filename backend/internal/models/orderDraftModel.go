package models

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Order drafts (migration 177): staff orders not placed yet. The page's
// state is kept as JSON — the server only needs the customer and the item
// count to list them.

// OrderDraft is one unfinished order.
type OrderDraft struct {
	ID            uuid.UUID       `json:"id"`
	CustomerID    *uuid.UUID      `json:"customer_id"`
	CustomerName  *string         `json:"customer_name"`
	CustomerPhone *string         `json:"customer_phone"`
	Data          json.RawMessage `json:"data,omitempty"`
	ItemCount     int             `json:"item_count"`
	CreatedBy     *string         `json:"created_by"`
	UpdatedBy     *string         `json:"updated_by"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// ErrDraftNotFound: no such draft (placed or discarded meanwhile).
var ErrDraftNotFound = errors.New("order draft not found")

const draftColumns = `
	d.id, d.customer_id, c.username, c.phone_number, d.item_count,
	COALESCE(NULLIF(cb.username, ''), cb.phone_number), COALESCE(NULLIF(ub.username, ''), ub.phone_number),
	d.created_at, d.updated_at`

const draftFrom = `
	FROM order_drafts d
	LEFT JOIN users c ON c.id = d.customer_id
	LEFT JOIN users cb ON cb.id = d.created_by
	LEFT JOIN users ub ON ub.id = d.updated_by`

// ListOrderDrafts returns every draft, last changed first, without its data.
func ListOrderDrafts(ctx context.Context, db *pgxpool.Pool) ([]OrderDraft, error) {
	rows, err := db.Query(ctx, `SELECT `+draftColumns+draftFrom+` ORDER BY d.updated_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OrderDraft{}
	for rows.Next() {
		var d OrderDraft
		if err := rows.Scan(&d.ID, &d.CustomerID, &d.CustomerName, &d.CustomerPhone, &d.ItemCount,
			&d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// GetOrderDraft returns one draft with its data.
func GetOrderDraft(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (OrderDraft, error) {
	var d OrderDraft
	err := db.QueryRow(ctx, `SELECT `+draftColumns+`, d.data`+draftFrom+` WHERE d.id = $1`, id).
		Scan(&d.ID, &d.CustomerID, &d.CustomerName, &d.CustomerPhone, &d.ItemCount,
			&d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt, &d.Data)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrDraftNotFound
	}
	return d, err
}

// SaveOrderDraft creates a draft (id nil) or replaces one's contents, and
// returns its id.
func SaveOrderDraft(ctx context.Context, db *pgxpool.Pool, id *uuid.UUID, customer *uuid.UUID, data json.RawMessage, items int, by *uuid.UUID) (uuid.UUID, error) {
	if id == nil {
		var out uuid.UUID
		err := db.QueryRow(ctx, `
			INSERT INTO order_drafts (customer_id, data, item_count, created_by, updated_by)
			VALUES ($1, $2, $3, $4, $4) RETURNING id`, customer, string(data), items, by).Scan(&out)
		return out, err
	}
	tag, err := db.Exec(ctx, `
		UPDATE order_drafts SET customer_id = $2, data = $3, item_count = $4, updated_by = $5, updated_at = NOW()
		WHERE id = $1`, *id, customer, string(data), items, by)
	if err != nil {
		return uuid.Nil, err
	}
	if tag.RowsAffected() == 0 {
		return uuid.Nil, ErrDraftNotFound
	}
	return *id, nil
}

// DeleteOrderDraft removes a draft; a missing one is not an error (it may
// have been placed or discarded already).
func DeleteOrderDraft(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM order_drafts WHERE id = $1`, id)
	return err
}
