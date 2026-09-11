package models

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Which table a purchase_order_logs row belongs to — the two PO tables use
// different id types (UUID vs SERIAL int) so po_id is stored as text.
const (
	POSourceLive   = "purchase_orders"
	POSourceMaster = "purchase_order_master"
)

// PurchaseOrderLogEntry is one field-level change on a purchase order —
// who changed what, from what value to what value, and when.
type PurchaseOrderLogEntry struct {
	ID         int64      `json:"id"`
	PoSource   string     `json:"po_source"`
	PoID       string     `json:"po_id"`
	PoNumber   *string    `json:"po_number"`
	FieldName  string     `json:"field_name"`
	OldValue   *string    `json:"old_value"`
	NewValue   *string    `json:"new_value"`
	ActorID    *uuid.UUID `json:"actor_id"`
	ActorName  string     `json:"actor_name"`
	ActorPhone string     `json:"actor_phone"`
	CreatedAt  time.Time  `json:"created_at"`
}

// LogPOFieldChange records one changed field. Fire-and-forget: a logging
// failure is printed, never allowed to fail the request it's describing.
// Pass old/new as nil for "field was empty" vs "" for "field was blank".
func LogPOFieldChange(ctx context.Context, db *pgxpool.Pool, source, poID string, poNumber *string, field string, oldValue, newValue *string, actorID *uuid.UUID) {
	_, err := db.Exec(ctx,
		`INSERT INTO purchase_order_logs (po_source, po_id, po_number, field_name, old_value, new_value, actor_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		source, poID, poNumber, field, oldValue, newValue, actorID,
	)
	if err != nil {
		log.Printf("po log: failed to record change to %s: %v", field, err)
	}
}

const poLogColumns = `
	pl.id, pl.po_source, pl.po_id, pl.po_number, pl.field_name, pl.old_value, pl.new_value,
	pl.actor_id, COALESCE(u.username, ''), COALESCE(u.phone_number, ''), pl.created_at
`

func scanPOLogEntry(row interface{ Scan(...any) error }, e *PurchaseOrderLogEntry) error {
	return row.Scan(&e.ID, &e.PoSource, &e.PoID, &e.PoNumber, &e.FieldName, &e.OldValue, &e.NewValue,
		&e.ActorID, &e.ActorName, &e.ActorPhone, &e.CreatedAt)
}

// ListPOLogsForOrder returns every recorded change for one PO, chronological
// (oldest first) so the history reads top-to-bottom like a timeline.
func ListPOLogsForOrder(ctx context.Context, db *pgxpool.Pool, source, poID string) ([]PurchaseOrderLogEntry, error) {
	rows, err := db.Query(ctx,
		`SELECT `+poLogColumns+`
		 FROM purchase_order_logs pl
		 LEFT JOIN users u ON u.id = pl.actor_id
		 WHERE pl.po_source = $1 AND pl.po_id = $2
		 ORDER BY pl.created_at ASC`,
		source, poID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []PurchaseOrderLogEntry{}
	for rows.Next() {
		var e PurchaseOrderLogEntry
		if err := scanPOLogEntry(rows, &e); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ListPOLogsByActor returns everything one user has changed on any PO,
// most recent first — chronological, user-wise, across all POs.
func ListPOLogsByActor(ctx context.Context, db *pgxpool.Pool, actorID uuid.UUID, limit, offset int) ([]PurchaseOrderLogEntry, int, error) {
	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM purchase_order_logs WHERE actor_id = $1`, actorID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := db.Query(ctx,
		`SELECT `+poLogColumns+`
		 FROM purchase_order_logs pl
		 LEFT JOIN users u ON u.id = pl.actor_id
		 WHERE pl.actor_id = $1
		 ORDER BY pl.created_at DESC
		 LIMIT $2 OFFSET $3`,
		actorID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	entries := []PurchaseOrderLogEntry{}
	for rows.Next() {
		var e PurchaseOrderLogEntry
		if err := scanPOLogEntry(rows, &e); err != nil {
			return nil, 0, err
		}
		entries = append(entries, e)
	}
	return entries, total, rows.Err()
}
