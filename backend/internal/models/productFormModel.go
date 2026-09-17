package models

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProductFormCount is one entry in the admin "Product Forms" manager — the
// canonical name and prefix from product_forms, plus how many products
// currently link to it.
type ProductFormCount struct {
	Name   string `json:"name"`
	Prefix string `json:"prefix"`
	Count  int    `json:"count"`
}

var nonLetterRe = regexp.MustCompile(`[^A-Za-z]`)

// ListProductFormsWithCounts returns every product_forms row with its
// current product count, for the admin management list.
func ListProductFormsWithCounts(ctx context.Context, db *pgxpool.Pool) ([]ProductFormCount, error) {
	rows, err := db.Query(ctx, `
		SELECT pf.name, pf.prefix, COUNT(p.id) AS cnt
		FROM product_forms pf
		LEFT JOIN products p ON p.product_form_id = pf.id
		GROUP BY pf.id, pf.name, pf.prefix
		ORDER BY pf.name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []ProductFormCount{}
	for rows.Next() {
		var f ProductFormCount
		if err := rows.Scan(&f.Name, &f.Prefix, &f.Count); err != nil {
			return nil, err
		}
		result = append(result, f)
	}
	return result, rows.Err()
}

// RenameProductForm renames a form by id (looked up by its current name) —
// this updates product_forms.name plus the free-text products.product_form
// column (kept in sync for the many places that still read that column
// directly), but never touches prefix or inventory_code, so both stay
// stable across the rename. Returns how many products were touched.
func RenameProductForm(ctx context.Context, db *pgxpool.Pool, oldName, newName string) (int64, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var formID int
	err = tx.QueryRow(ctx, `SELECT id FROM product_forms WHERE name = $1`, oldName).Scan(&formID)
	if err != nil {
		return 0, fmt.Errorf("product form %q not found: %w", oldName, err)
	}

	if _, err := tx.Exec(ctx, `UPDATE product_forms SET name = $1 WHERE id = $2`, newName, formID); err != nil {
		return 0, err
	}

	tag, err := tx.Exec(ctx, `UPDATE products SET product_form = $1 WHERE product_form_id = $2`, newName, formID)
	if err != nil {
		return 0, err
	}

	return tag.RowsAffected(), tx.Commit(ctx)
}

// RenameProductFormPrefix changes the prefix used for new inventory codes on
// this form (e.g. "T" -> "TAB"). Existing products keep their already-issued
// codes unchanged — only future codes for this form use the new prefix —
// so to avoid a form silently mixing two prefixes, this refuses to change
// the prefix once any code has been issued (next_sequence > 1). Rename the
// form and start a fresh one instead if that's what's needed.
func RenameProductFormPrefix(ctx context.Context, db *pgxpool.Pool, name, newPrefix string) error {
	newPrefix = strings.ToUpper(strings.TrimSpace(newPrefix))
	if newPrefix == "" {
		return fmt.Errorf("prefix is required")
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var formID, nextSeq int
	err = tx.QueryRow(ctx, `SELECT id, next_sequence FROM product_forms WHERE name = $1 FOR UPDATE`, name).Scan(&formID, &nextSeq)
	if err != nil {
		return fmt.Errorf("product form %q not found: %w", name, err)
	}
	if nextSeq > 1 {
		return fmt.Errorf("cannot change the prefix for %q — it already has inventory codes assigned", name)
	}

	if _, err := tx.Exec(ctx, `UPDATE product_forms SET prefix = $1 WHERE id = $2`, newPrefix, formID); err != nil {
		return fmt.Errorf("that prefix may already be in use by another form: %w", err)
	}

	return tx.Commit(ctx)
}

// ClearProductForm removes a form entirely: every product linked to it has
// product_form, product_form_id and inventory_code all cleared, then the
// now-unused product_forms row (and its prefix) is deleted so a future form
// with the same name starts fresh. Returns how many products were touched.
func ClearProductForm(ctx context.Context, db *pgxpool.Pool, name string) (int64, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var formID int
	err = tx.QueryRow(ctx, `SELECT id FROM product_forms WHERE name = $1`, name).Scan(&formID)
	if err != nil {
		return 0, fmt.Errorf("product form %q not found: %w", name, err)
	}

	tag, err := tx.Exec(ctx,
		`UPDATE products SET product_form = NULL, product_form_id = NULL, inventory_code = NULL WHERE product_form_id = $1`,
		formID,
	)
	if err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM product_forms WHERE id = $1`, formID); err != nil {
		return 0, err
	}

	return tag.RowsAffected(), tx.Commit(ctx)
}

// choosePrefix grows a candidate prefix (letters only, taken from name) one
// character at a time until it isn't already used by another form; falls
// back to appending digits if the whole name collides (should never happen
// in practice with real dosage-form names). Must be called with a lock that
// prevents two concurrent inserts from picking the same candidate — callers
// pass an open transaction.
func choosePrefix(ctx context.Context, tx pgx.Tx, name string) (string, error) {
	letters := strings.ToUpper(nonLetterRe.ReplaceAllString(name, ""))
	if letters == "" {
		letters = "X"
	}
	for length := 1; length <= len(letters); length++ {
		candidate := letters[:length]
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_forms WHERE prefix = $1)`, candidate).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	suffix := 2
	for {
		candidate := fmt.Sprintf("%s%d", letters, suffix)
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_forms WHERE prefix = $1)`, candidate).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
		suffix++
	}
}

// findOrCreateProductForm returns the product_forms.id for name (trimmed),
// creating the row (with a freshly-chosen prefix) if this is the first time
// this exact form name has been used.
func findOrCreateProductForm(ctx context.Context, tx pgx.Tx, name string) (int, error) {
	var id int
	err := tx.QueryRow(ctx, `SELECT id FROM product_forms WHERE name = $1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}

	prefix, err := choosePrefix(ctx, tx, name)
	if err != nil {
		return 0, err
	}
	err = tx.QueryRow(ctx,
		`INSERT INTO product_forms (name, prefix) VALUES ($1, $2)
		 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`,
		name, prefix,
	).Scan(&id)
	return id, err
}

// AssignProductForm links productID to the product_forms row for formName
// (creating it if it's brand new) and, if the product doesn't already have
// an inventory_code, assigns the next one for that form (e.g. "T-14").
// A product's inventory_code is permanent once assigned — it never changes
// even if the form is corrected later, since it may already be written on a
// physical shelf/pallet label. formName == "" only clears the link
// (product_form_id set to NULL), leaving any existing inventory_code as-is.
func AssignProductForm(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, formName string) error {
	formName = strings.TrimSpace(formName)

	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if formName == "" {
		if _, err := tx.Exec(ctx, `UPDATE products SET product_form_id = NULL WHERE id = $1`, productID); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	formID, err := findOrCreateProductForm(ctx, tx, formName)
	if err != nil {
		return err
	}

	var hasCode bool
	if err := tx.QueryRow(ctx, `SELECT inventory_code IS NOT NULL FROM products WHERE id = $1 FOR UPDATE`, productID).Scan(&hasCode); err != nil {
		return err
	}
	if hasCode {
		_, err := tx.Exec(ctx, `UPDATE products SET product_form_id = $1 WHERE id = $2`, formID, productID)
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	// Lock the form row so two products getting their first code for the
	// same form at the same time don't race on the same sequence number.
	var seq int
	var prefix string
	if err := tx.QueryRow(ctx, `SELECT next_sequence, prefix FROM product_forms WHERE id = $1 FOR UPDATE`, formID).Scan(&seq, &prefix); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE product_forms SET next_sequence = next_sequence + 1 WHERE id = $1`, formID); err != nil {
		return err
	}

	code := fmt.Sprintf("%s-%d", prefix, seq)
	if _, err := tx.Exec(ctx,
		`UPDATE products SET product_form_id = $1, inventory_code = $2 WHERE id = $3`,
		formID, code, productID,
	); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetInventoryCodesForProducts returns inventory_code keyed by product id,
// for exactly the given ids (skipping any with no code assigned) — used to
// annotate an admin product list without touching the shared Product
// struct/query that the storefront and mobile app also rely on.
func GetInventoryCodesForProducts(ctx context.Context, db *pgxpool.Pool, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	result := map[uuid.UUID]string{}
	if len(ids) == 0 {
		return result, nil
	}

	idStrings := make([]string, len(ids))
	for i, id := range ids {
		idStrings[i] = id.String()
	}
	rows, err := db.Query(ctx,
		`SELECT id, inventory_code FROM products WHERE id = ANY($1::uuid[]) AND inventory_code IS NOT NULL`,
		idStrings,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id uuid.UUID
		var code string
		if err := rows.Scan(&id, &code); err != nil {
			return nil, err
		}
		result[id] = code
	}
	return result, rows.Err()
}

// GetProductInventoryInfo returns the inventory code and form/prefix for one
// product (nil fields if it has no form/code yet) — for the admin product
// detail page to display alongside the Product Form dropdown.
type ProductInventoryInfo struct {
	InventoryCode *string `json:"inventory_code"`
	FormName      *string `json:"form_name"`
	FormPrefix    *string `json:"form_prefix"`
}

func GetProductInventoryInfo(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) (*ProductInventoryInfo, error) {
	var info ProductInventoryInfo
	err := db.QueryRow(ctx, `
		SELECT p.inventory_code, pf.name, pf.prefix
		FROM products p
		LEFT JOIN product_forms pf ON pf.id = p.product_form_id
		WHERE p.id = $1
	`, productID).Scan(&info.InventoryCode, &info.FormName, &info.FormPrefix)
	if err != nil {
		return nil, err
	}
	return &info, nil
}
