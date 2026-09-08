package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WarehouseBinType is a bin type in the persistent library — available to
// every layout (including brand-new ones), independent of any one layout's
// own binTypes blob.
type WarehouseBinType struct {
	Name      string    `json:"name"`
	Width     float64   `json:"w"`
	Depth     float64   `json:"d"`
	Height    float64   `json:"h"`
	Color     string    `json:"color"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListWarehouseBinTypes returns every bin type in the library, by name.
func ListWarehouseBinTypes(ctx context.Context, db *pgxpool.Pool) ([]WarehouseBinType, error) {
	rows, err := db.Query(ctx, `SELECT name, width_m, depth_m, height_m, color, updated_at FROM warehouse_bin_types ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	types := make([]WarehouseBinType, 0)
	for rows.Next() {
		var t WarehouseBinType
		if err := rows.Scan(&t.Name, &t.Width, &t.Depth, &t.Height, &t.Color, &t.UpdatedAt); err != nil {
			return nil, err
		}
		types = append(types, t)
	}
	return types, rows.Err()
}

// SaveWarehouseBinType inserts or updates a bin type by name.
func SaveWarehouseBinType(ctx context.Context, db *pgxpool.Pool, t WarehouseBinType) error {
	_, err := db.Exec(ctx, `
		INSERT INTO warehouse_bin_types (name, width_m, depth_m, height_m, color)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (name) DO UPDATE
			SET width_m    = EXCLUDED.width_m,
				depth_m    = EXCLUDED.depth_m,
				height_m   = EXCLUDED.height_m,
				color      = EXCLUDED.color,
				updated_at = now()
	`, t.Name, t.Width, t.Depth, t.Height, t.Color)
	return err
}

// DeleteWarehouseBinType removes a bin type by name. Returns pgx.ErrNoRows if
// nothing matched.
func DeleteWarehouseBinType(ctx context.Context, db *pgxpool.Pool, name string) error {
	tag, err := db.Exec(ctx, `DELETE FROM warehouse_bin_types WHERE name = $1`, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
