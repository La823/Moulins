package models

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditLogEntry is one recorded staff action — who did what, to which
// entity, in plain-English. Deliberately not exhaustive: only the higher-
// signal mutating actions call LogAction (deletes, credential/permission
// changes, and edits to partners/products/employees), not every single
// GET or trivial field tweak.
type AuditLogEntry struct {
	ID          string     `json:"id"`
	ActorID     *uuid.UUID `json:"actor_id,omitempty"`
	ActorName   string     `json:"actor_name,omitempty"`
	ActorPhone  string     `json:"actor_phone,omitempty"`
	Action      string     `json:"action"`
	EntityType  string     `json:"entity_type"`
	EntityID    *uuid.UUID `json:"entity_id,omitempty"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
}

// LogAction records one audit entry. Called fire-and-forget style right
// after a mutation succeeds — a logging failure is printed, never allowed
// to fail the request it's describing.
func LogAction(ctx context.Context, db *pgxpool.Pool, actorID *uuid.UUID, action, entityType string, entityID *uuid.UUID, description string) {
	_, err := db.Exec(ctx,
		`INSERT INTO audit_log (actor_id, action, entity_type, entity_id, description) VALUES ($1, $2, $3, $4, $5)`,
		actorID, action, entityType, entityID, description,
	)
	if err != nil {
		log.Printf("audit log: failed to record %s %s: %v", action, entityType, err)
	}
}

const auditLogColumns = `
	al.id, al.actor_id, al.action, al.entity_type, al.entity_id, al.description, al.created_at,
	COALESCE(u.username, ''), COALESCE(u.phone_number, '')
`

func scanAuditLogEntry(row interface{ Scan(...any) error }, e *AuditLogEntry) error {
	return row.Scan(&e.ID, &e.ActorID, &e.Action, &e.EntityType, &e.EntityID, &e.Description, &e.CreatedAt, &e.ActorName, &e.ActorPhone)
}

// ListAuditLogByActor returns an employee/admin's own recorded actions,
// most recent first — shown on their detail page.
func ListAuditLogByActor(ctx context.Context, db *pgxpool.Pool, actorID uuid.UUID, limit int) ([]AuditLogEntry, error) {
	rows, err := db.Query(ctx,
		`SELECT `+auditLogColumns+`
		 FROM audit_log al
		 LEFT JOIN users u ON u.id = al.actor_id
		 WHERE al.actor_id = $1
		 ORDER BY al.created_at DESC
		 LIMIT $2`,
		actorID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []AuditLogEntry{}
	for rows.Next() {
		var e AuditLogEntry
		if err := scanAuditLogEntry(rows, &e); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ListAuditLog returns the most recent audit entries across all staff,
// for the site-wide activity log.
func ListAuditLog(ctx context.Context, db *pgxpool.Pool, limit, offset int) ([]AuditLogEntry, int, error) {
	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM audit_log`).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := db.Query(ctx,
		`SELECT `+auditLogColumns+`
		 FROM audit_log al
		 LEFT JOIN users u ON u.id = al.actor_id
		 ORDER BY al.created_at DESC
		 LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	entries := []AuditLogEntry{}
	for rows.Next() {
		var e AuditLogEntry
		if err := scanAuditLogEntry(rows, &e); err != nil {
			return nil, 0, err
		}
		entries = append(entries, e)
	}
	return entries, total, rows.Err()
}
