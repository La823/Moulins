package models

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// WarehouseZone is one physical picking zone from the WMS SKU spec — the
// [ZONE] segment of [ZONE]-[SEQUENCE]-[FORM]/[REGULATORY]/[DIET].
type WarehouseZone struct {
	ID           int     `json:"id"`
	Code         string  `json:"code"`
	Name         string  `json:"name"`
	Description  *string `json:"description,omitempty"`
	Scope        *string `json:"scope,omitempty"`
	SortOrder    int     `json:"sort_order"`
	FormCount    int     `json:"form_count"`
	ProductCount int     `json:"product_count"`
}

// ZoneForm is a product form as seen from the zone-assignment screen.
type ZoneForm struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	Prefix       string  `json:"prefix"`
	FormCode     *string `json:"form_code,omitempty"`
	ZoneID       *int    `json:"zone_id,omitempty"`
	ZoneCode     *string `json:"zone_code,omitempty"`
	ProductCount int     `json:"product_count"`
}

// ListWarehouseZones returns the zones with how many forms and products sit
// in each, so the admin screen can show the split without a second call.
func ListWarehouseZones(ctx context.Context, db *pgxpool.Pool) ([]WarehouseZone, error) {
	rows, err := db.Query(ctx, `
		SELECT z.id, z.code, z.name, z.description, z.scope, z.sort_order,
		       COUNT(DISTINCT f.id),
		       COUNT(p.id)
		FROM warehouse_zones z
		LEFT JOIN product_forms f ON f.zone_id = z.id
		LEFT JOIN products p ON p.product_form_id = f.id
		GROUP BY z.id, z.code, z.name, z.description, z.scope, z.sort_order
		ORDER BY z.sort_order, z.code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WarehouseZone{}
	for rows.Next() {
		var z WarehouseZone
		if err := rows.Scan(&z.ID, &z.Code, &z.Name, &z.Description, &z.Scope,
			&z.SortOrder, &z.FormCount, &z.ProductCount); err != nil {
			return nil, err
		}
		out = append(out, z)
	}
	return out, rows.Err()
}

// ListFormsWithZones returns every product form and the zone it belongs to
// (nil when unassigned), which is what the assignment table renders.
func ListFormsWithZones(ctx context.Context, db *pgxpool.Pool) ([]ZoneForm, error) {
	rows, err := db.Query(ctx, `
		SELECT f.id, f.name, f.prefix, f.form_code, f.zone_id, z.code, COUNT(p.id)
		FROM product_forms f
		LEFT JOIN warehouse_zones z ON z.id = f.zone_id
		LEFT JOIN products p ON p.product_form_id = f.id
		GROUP BY f.id, f.name, f.prefix, f.form_code, f.zone_id, z.code
		ORDER BY f.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ZoneForm{}
	for rows.Next() {
		var f ZoneForm
		if err := rows.Scan(&f.ID, &f.Name, &f.Prefix, &f.FormCode,
			&f.ZoneID, &f.ZoneCode, &f.ProductCount); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func normaliseZoneCode(code string) (string, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return "", fmt.Errorf("code is required")
	}
	if len(code) > 4 {
		return "", fmt.Errorf("code should be short (the SKU prefix), e.g. \"OS\"")
	}
	return code, nil
}

func CreateWarehouseZone(ctx context.Context, db *pgxpool.Pool, code, name string, description, scope *string, sortOrder int) (int, error) {
	code, err := normaliseZoneCode(code)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(name) == "" {
		return 0, fmt.Errorf("name is required")
	}
	var id int
	err = db.QueryRow(ctx, `
		INSERT INTO warehouse_zones (code, name, description, scope, sort_order)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		code, strings.TrimSpace(name), description, scope, sortOrder).Scan(&id)
	return id, err
}

func UpdateWarehouseZone(ctx context.Context, db *pgxpool.Pool, id int, code, name string, description, scope *string, sortOrder int) error {
	code, err := normaliseZoneCode(code)
	if err != nil {
		return err
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("name is required")
	}
	tag, err := db.Exec(ctx, `
		UPDATE warehouse_zones
		SET code = $2, name = $3, description = $4, scope = $5, sort_order = $6, updated_at = NOW()
		WHERE id = $1`,
		id, code, strings.TrimSpace(name), description, scope, sortOrder)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("zone not found")
	}
	return nil
}

// DeleteWarehouseZone removes a zone. Forms pointing at it are left in place
// and become unassigned (FK is ON DELETE SET NULL) — deleting a zone must
// never cascade into product data. Returns how many forms were unassigned.
func DeleteWarehouseZone(ctx context.Context, db *pgxpool.Pool, id int) (int, error) {
	var affected int
	if err := db.QueryRow(ctx,
		`SELECT COUNT(*) FROM product_forms WHERE zone_id = $1`, id).Scan(&affected); err != nil {
		return 0, err
	}
	tag, err := db.Exec(ctx, `DELETE FROM warehouse_zones WHERE id = $1`, id)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, fmt.Errorf("zone not found")
	}
	return affected, nil
}

// SetFormZone assigns a product form to a zone (nil clears it) and optionally
// sets its 3-letter form code. The code is uppercased and uniqueness is
// enforced by a partial unique index, so two forms can't share one.
func SetFormZone(ctx context.Context, db *pgxpool.Pool, formID int, zoneID *int, formCode *string) error {
	if formCode != nil {
		v := strings.ToUpper(strings.TrimSpace(*formCode))
		if v == "" {
			formCode = nil
		} else {
			if len(v) != 3 {
				return fmt.Errorf("form code must be exactly 3 letters")
			}
			formCode = &v
		}
	}
	tag, err := db.Exec(ctx, `
		UPDATE product_forms SET zone_id = $2, form_code = $3 WHERE id = $1`,
		formID, zoneID, formCode)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("product form not found")
	}
	return nil
}
