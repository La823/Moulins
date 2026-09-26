package models

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ProductLicenceType is one row of product_licence_types — the regulatory
// classification a product is sold under (Drug / Food / Cosmetic today,
// but admin-editable rather than hard-coded).
type ProductLicenceType struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	Description  *string `json:"description,omitempty"`
	ProductCount int     `json:"product_count"`
}

// ListProductLicenceTypes returns every licence type with how many products
// currently point at it, so the admin table can show usage and warn before
// a delete unlinks them.
func ListProductLicenceTypes(ctx context.Context, db *pgxpool.Pool) ([]ProductLicenceType, error) {
	rows, err := db.Query(ctx, `
		SELECT lt.id, lt.name, lt.description, COUNT(p.id)
		FROM product_licence_types lt
		LEFT JOIN products p ON p.licence_type_id = lt.id
		GROUP BY lt.id, lt.name, lt.description
		ORDER BY lt.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProductLicenceType{}
	for rows.Next() {
		var t ProductLicenceType
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.ProductCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func normaliseLicenceName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	return name, nil
}

func CreateProductLicenceType(ctx context.Context, db *pgxpool.Pool, name string, description *string) (int, error) {
	name, err := normaliseLicenceName(name)
	if err != nil {
		return 0, err
	}
	var id int
	err = db.QueryRow(ctx, `
		INSERT INTO product_licence_types (name, description) VALUES ($1, $2) RETURNING id`,
		name, description).Scan(&id)
	return id, err
}

func UpdateProductLicenceType(ctx context.Context, db *pgxpool.Pool, id int, name string, description *string) error {
	name, err := normaliseLicenceName(name)
	if err != nil {
		return err
	}
	tag, err := db.Exec(ctx, `
		UPDATE product_licence_types
		SET name = $2, description = $3, updated_at = NOW()
		WHERE id = $1`, id, name, description)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("licence type not found")
	}
	return nil
}

// DeleteProductLicenceType removes the type. Products referencing it are
// left in place with licence_type_id set to NULL by the foreign key, so a
// mistaken delete costs a re-classification, never product data.
func DeleteProductLicenceType(ctx context.Context, db *pgxpool.Pool, id int) (int, error) {
	var affected int
	if err := db.QueryRow(ctx,
		`SELECT COUNT(*) FROM products WHERE licence_type_id = $1`, id).Scan(&affected); err != nil {
		return 0, err
	}
	tag, err := db.Exec(ctx, `DELETE FROM product_licence_types WHERE id = $1`, id)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, fmt.Errorf("licence type not found")
	}
	return affected, nil
}

// SetProductLicenceType assigns (or with nil, clears) one product's licence
// type. Kept separate from UpdateProduct so the dropdown on the product page
// can save on its own without submitting the whole product form.
// foodType is only meaningful for products classified as Food. Passing nil
// clears it, which the caller does when the licence type moves away from
// Food — see the note in migration 136 on why this isn't a DB constraint.
func SetProductLicenceType(ctx context.Context, db *pgxpool.Pool, productID string, licenceTypeID *int, foodType *string) error {
	if foodType != nil {
		v := strings.TrimSpace(*foodType)
		if v != "Veg" && v != "Non-Veg" {
			return fmt.Errorf("food_type must be \"Veg\" or \"Non-Veg\"")
		}
		foodType = &v
	}
	tag, err := db.Exec(ctx, `
		UPDATE products SET licence_type_id = $2, food_type = $3, updated_at = NOW() WHERE id = $1`,
		productID, licenceTypeID, foodType)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("product not found")
	}
	return nil
}

// LicenceTypeBreakdown is the dashboard summary: how many products sit
// under each licence type, including the unclassified ones.
type LicenceTypeBreakdown struct {
	ID           *int   `json:"id"`
	Name         string `json:"name"`
	ProductCount int    `json:"product_count"`
	ActiveCount  int    `json:"active_count"`
	VegCount     int    `json:"veg_count"`
	NonVegCount  int    `json:"non_veg_count"`
}

// GetLicenceTypeBreakdown powers the dashboard table. Unclassified products
// are reported as their own row (id null) rather than omitted — "how many
// have we not classified yet" is the number that actually needs watching.
func GetLicenceTypeBreakdown(ctx context.Context, db *pgxpool.Pool) ([]LicenceTypeBreakdown, error) {
	rows, err := db.Query(ctx, `
		SELECT lt.id, lt.name,
		       COUNT(p.id),
		       COUNT(p.id) FILTER (WHERE p.is_active),
		       COUNT(p.id) FILTER (WHERE p.food_type = 'Veg'),
		       COUNT(p.id) FILTER (WHERE p.food_type = 'Non-Veg')
		FROM product_licence_types lt
		LEFT JOIN products p ON p.licence_type_id = lt.id
		GROUP BY lt.id, lt.name

		UNION ALL

		SELECT NULL, 'Unclassified',
		       COUNT(*),
		       COUNT(*) FILTER (WHERE is_active),
		       COUNT(*) FILTER (WHERE food_type = 'Veg'),
		       COUNT(*) FILTER (WHERE food_type = 'Non-Veg')
		FROM products WHERE licence_type_id IS NULL

		ORDER BY 3 DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LicenceTypeBreakdown{}
	for rows.Next() {
		var b LicenceTypeBreakdown
		if err := rows.Scan(&b.ID, &b.Name, &b.ProductCount, &b.ActiveCount, &b.VegCount, &b.NonVegCount); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
