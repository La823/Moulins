package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WarehouseBinAssignment links a product to a location (a rack bin's
// row-bay-level key, or a pallet's id) within one layout. See migration 107
// for why this lives in its own table instead of the layout's JSONB blob.
type WarehouseBinAssignment struct {
	LocationType string    `json:"location_type"` // "bin" | "pallet"
	LocationKey  string    `json:"location_key"`
	Slot         string    `json:"slot"` // "L" | "R" | "A"
	ProductID    uuid.UUID `json:"product_id"`
	ProductName  string    `json:"product_name"`
	Quantity     *int      `json:"quantity,omitempty"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ListWarehouseBinAssignments returns every product assignment for a layout,
// joined with the product's name for display without a second round trip.
func ListWarehouseBinAssignments(ctx context.Context, db *pgxpool.Pool, layoutName string) ([]WarehouseBinAssignment, error) {
	rows, err := db.Query(ctx, `
		SELECT a.location_type, a.location_key, a.slot, a.product_id, p.name, a.quantity, a.updated_at
		FROM warehouse_bin_assignments a
		JOIN products p ON p.id = a.product_id
		WHERE a.layout_name = $1
		ORDER BY a.location_type, a.location_key, a.slot
	`, layoutName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assignments := make([]WarehouseBinAssignment, 0)
	for rows.Next() {
		var a WarehouseBinAssignment
		if err := rows.Scan(&a.LocationType, &a.LocationKey, &a.Slot, &a.ProductID, &a.ProductName, &a.Quantity, &a.UpdatedAt); err != nil {
			return nil, err
		}
		assignments = append(assignments, a)
	}
	return assignments, rows.Err()
}

// SaveWarehouseBinAssignment assigns (or reassigns) a product to a
// location+slot.
func SaveWarehouseBinAssignment(ctx context.Context, db *pgxpool.Pool, layoutName, locationType, locationKey, slot string, productID uuid.UUID) error {
	_, err := db.Exec(ctx, `
		INSERT INTO warehouse_bin_assignments (layout_name, location_type, location_key, slot, product_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (layout_name, location_type, location_key, slot) DO UPDATE
			SET product_id = EXCLUDED.product_id,
				updated_at = now()
	`, layoutName, locationType, locationKey, slot, productID)
	return err
}

// DeleteWarehouseBinAssignment clears whatever product is assigned to a
// location+slot. Returns pgx.ErrNoRows if nothing was assigned there.
func DeleteWarehouseBinAssignment(ctx context.Context, db *pgxpool.Pool, layoutName, locationType, locationKey, slot string) error {
	tag, err := db.Exec(ctx, `
		DELETE FROM warehouse_bin_assignments
		WHERE layout_name = $1 AND location_type = $2 AND location_key = $3 AND slot = $4
	`, layoutName, locationType, locationKey, slot)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
