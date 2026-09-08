package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WarehouseLayoutMeta is the list-view shape — everything except the data
// blob itself, matching the standalone editor's list_layouts().
type WarehouseLayoutMeta struct {
	ID            int       `json:"id"`
	Name          string    `json:"name"`
	SchemaVersion int       `json:"schema_version"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// SaveWarehouseLayout inserts or updates a layout by name — a direct port of
// the standalone editor's LayoutRepository.save(). The client (the editor's
// own JS, via validateLayout()) is trusted to have validated the shape
// before saving, same as other write endpoints in this codebase.
func SaveWarehouseLayout(ctx context.Context, db *pgxpool.Pool, name string, schemaVersion int, data json.RawMessage) error {
	_, err := db.Exec(ctx, `
		INSERT INTO warehouse_layouts (name, schema_version, data)
		VALUES ($1, $2, $3::jsonb)
		ON CONFLICT (name) DO UPDATE
			SET schema_version = EXCLUDED.schema_version,
				data           = EXCLUDED.data,
				updated_at     = now()
	`, name, schemaVersion, data)
	return err
}

// GetWarehouseLayout returns the raw layout JSON stored under name, or
// pgx.ErrNoRows if it doesn't exist.
func GetWarehouseLayout(ctx context.Context, db *pgxpool.Pool, name string) (json.RawMessage, error) {
	var data json.RawMessage
	err := db.QueryRow(ctx, `SELECT data FROM warehouse_layouts WHERE name = $1`, name).Scan(&data)
	if err != nil {
		return nil, err
	}
	return data, nil
}

// ListWarehouseLayouts returns metadata for every stored layout, no data
// blobs — matches LayoutRepository.list_layouts().
func ListWarehouseLayouts(ctx context.Context, db *pgxpool.Pool) ([]WarehouseLayoutMeta, error) {
	rows, err := db.Query(ctx, `SELECT id, name, schema_version, updated_at FROM warehouse_layouts ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	layouts := make([]WarehouseLayoutMeta, 0)
	for rows.Next() {
		var l WarehouseLayoutMeta
		if err := rows.Scan(&l.ID, &l.Name, &l.SchemaVersion, &l.UpdatedAt); err != nil {
			return nil, err
		}
		layouts = append(layouts, l)
	}
	return layouts, rows.Err()
}

// DeleteWarehouseLayout removes a layout by name. Returns pgx.ErrNoRows if
// nothing matched, so the handler can distinguish "already gone" from a
// real failure.
func DeleteWarehouseLayout(ctx context.Context, db *pgxpool.Pool, name string) error {
	tag, err := db.Exec(ctx, `DELETE FROM warehouse_layouts WHERE name = $1`, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
