package models

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SortableColumns maps the JSON field names the frontend can sort by to
// their actual DB column, so user input never gets concatenated directly
// into the ORDER BY clause.
var SortableColumns = map[string]string{
	"sr_no":           "sr_no",
	"po_date":         "po_date",
	"po_number":       "po_number",
	"product_name":    "product_name",
	"quantity":        "quantity",
	"rate":            "rate",
	"estimate":        "estimate",
	"type":            "type",
	"company":         "company",
	"qty_received":    "qty_received",
	"category":        "category",
	"status":          "status",
	"time_stamp_date": "time_stamp_date",
	"bill_number":     "bill_number",
}

// PurchaseOrderMasterRow is a row in the master purchase-order list —
// originally a one-off import of the old "Moulins" tracking sheet
// (migration 108), and now also the live table new POs are created into
// directly (see CreatePurchaseOrderInMaster) rather than a separate
// purchase_orders table. Fields stay loosely typed (many are *string) to
// keep matching the historical source data's shape.
// PoDate and TimeStamp{Date,Time} are normalized by migration 109 from the
// original mixed-format text (kept as *_raw for audit).
type PurchaseOrderMasterRow struct {
	ID             int        `json:"id"`
	SrNo           *int       `json:"sr_no"`
	PoDate         *time.Time `json:"po_date"`
	PoDateRaw      *string    `json:"po_date_raw"`
	PoNumber       *string    `json:"po_number"`
	ProductName    *string    `json:"product_name"`
	ProductCode    *string    `json:"product_code"`
	Composition    *string    `json:"composition"`
	Quantity       *float64   `json:"quantity"`
	Mrp            *string    `json:"mrp"`
	MrpUnitID      *uuid.UUID `json:"mrp_unit_id"`
	Rate           *float64   `json:"rate"`
	Estimate       *float64   `json:"estimate"`
	Specifications *string    `json:"specifications"`
	Type           *string    `json:"type"`
	Company        *string    `json:"company"`
	QtyReceived    *float64   `json:"qty_received"`
	Remarks        *string    `json:"remarks"`
	Category       *string    `json:"category"`
	Status         *string    `json:"status"`
	TimeStampDate  *time.Time `json:"time_stamp_date"`
	TimeStampTime  *string    `json:"time_stamp_time"`
	TimeStampRaw   *string    `json:"time_stamp_raw"`
	DaysDiff       *string    `json:"days_diff"`
	BillNumber     *string    `json:"bill_number"`
}

// CountMissingProductCode returns how many rows in the master list have no
// product_code set — used to surface a "still needs a code" tally in the UI.
func CountMissingProductCode(ctx context.Context, db *pgxpool.Pool) (int, error) {
	var count int
	err := db.QueryRow(ctx, "SELECT count(*) FROM purchase_order_master WHERE product_code IS NULL OR product_code = ''").Scan(&count)
	return count, err
}

// ListActivePurchaseOrders returns the most recent rows with status =
// 'Active' — every new PO created via CreatePurchaseOrderInMaster starts
// out Active by default. Used by the /panel/purchase-orders placeholder
// page to surface what's currently open.
func ListActivePurchaseOrders(ctx context.Context, db *pgxpool.Pool, limit int) ([]PurchaseOrderMasterRow, int, error) {
	return ListPurchaseOrderMaster(ctx, db, limit, 0, "sr_no", "desc", "", "", "", "Active")
}

// ListPurchaseOrderMaster returns one page of rows ordered by sortColumn
// (a JSON field name looked up against SortableColumns; falls back to
// sr_no if empty/unknown), plus the total row count for pagination.
// hasProductCode: "" means no filter, "true" restricts to rows with a
// product_code set, "false" restricts to rows missing one.
func ListPurchaseOrderMaster(ctx context.Context, db *pgxpool.Pool, limit, offset int, sortColumn, sortDir, search, poNumber, hasProductCode, status string) ([]PurchaseOrderMasterRow, int, error) {
	var conditions []string
	var args []interface{}
	if search != "" {
		args = append(args, "%"+search+"%")
		conditions = append(conditions, fmt.Sprintf("product_name ILIKE $%d", len(args)))
	}
	if poNumber != "" {
		args = append(args, "%"+poNumber+"%")
		conditions = append(conditions, fmt.Sprintf("po_number ILIKE $%d", len(args)))
	}
	if hasProductCode == "true" {
		conditions = append(conditions, "(product_code IS NOT NULL AND product_code != '')")
	} else if hasProductCode == "false" {
		conditions = append(conditions, "(product_code IS NULL OR product_code = '')")
	}
	if status != "" {
		args = append(args, status)
		conditions = append(conditions, fmt.Sprintf("status = $%d", len(args)))
	}
	var where string
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	countQuery := "SELECT count(*) FROM purchase_order_master " + where
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	col, ok := SortableColumns[sortColumn]
	if !ok {
		col = "sr_no"
	}
	dir := "ASC"
	if sortDir == "desc" {
		dir = "DESC"
	}

	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	query := fmt.Sprintf(`
		SELECT id, sr_no, po_date, po_date_raw, po_number, product_name, product_code, composition, quantity, mrp, mrp_unit_id, rate, estimate,
		       specifications, type, company, qty_received, remarks, category, status,
		       time_stamp_date, time_stamp_time, time_stamp_raw, days_diff, bill_number
		FROM purchase_order_master
		%s
		ORDER BY %s %s NULLS LAST, id
		LIMIT $%d OFFSET $%d
	`, where, col, dir, limitPos, offsetPos)
	args = append(args, limit, offset)
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	result := make([]PurchaseOrderMasterRow, 0, limit)
	for rows.Next() {
		var r PurchaseOrderMasterRow
		if err := rows.Scan(
			&r.ID, &r.SrNo, &r.PoDate, &r.PoDateRaw, &r.PoNumber, &r.ProductName, &r.ProductCode, &r.Composition, &r.Quantity, &r.Mrp, &r.MrpUnitID,
			&r.Rate, &r.Estimate, &r.Specifications, &r.Type, &r.Company, &r.QtyReceived,
			&r.Remarks, &r.Category, &r.Status, &r.TimeStampDate, &r.TimeStampTime, &r.TimeStampRaw,
			&r.DaysDiff, &r.BillNumber,
		); err != nil {
			return nil, 0, err
		}
		result = append(result, r)
	}
	return result, total, rows.Err()
}

// SearchMasterProductNames returns distinct product_name values from the
// master list matching query (case-insensitive substring), for use as
// autocomplete suggestions on the new-PO form — not for autofilling other
// fields, just names to pick from.
func SearchMasterProductNames(ctx context.Context, db *pgxpool.Pool, query string, limit int) ([]string, error) {
	rows, err := db.Query(ctx,
		`SELECT DISTINCT product_name FROM purchase_order_master
		 WHERE product_name IS NOT NULL AND product_name ILIKE $1
		 ORDER BY product_name
		 LIMIT $2`,
		"%"+query+"%", limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// LastMasterPO is a trimmed view of the most recent master-list row for a
// product name — just what the new-PO form's preview/prefill needs.
type LastMasterPO struct {
	ID             int      `json:"id"`
	PoNumber       *string  `json:"po_number"`
	PoDate         *string  `json:"po_date"`
	Quantity       *float64 `json:"quantity"`
	Mrp            *string  `json:"mrp"`
	Rate           *float64 `json:"rate"`
	Specifications *string  `json:"specifications"`
	Type           *string  `json:"type"`
	Company        *string  `json:"company"`
	Category       *string  `json:"category"`
	Status         *string  `json:"status"`
}

// GetLastMasterPOByProductName returns the most recent master-list row for
// an exact (case/whitespace-insensitive) product name match — the "last PO"
// preview/prefill on the new-PO form now looks here, since new POs are
// created directly into this table rather than a separate live one.
func GetLastMasterPOByProductName(ctx context.Context, db *pgxpool.Pool, productName string) (*LastMasterPO, error) {
	if productName == "" {
		return nil, nil
	}
	var p LastMasterPO
	err := db.QueryRow(ctx,
		`SELECT id, po_number, po_date::text, quantity, mrp, rate, specifications, type, company, category, status
		 FROM purchase_order_master
		 WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
		 ORDER BY po_date DESC NULLS LAST, id DESC
		 LIMIT 1`,
		productName,
	).Scan(&p.ID, &p.PoNumber, &p.PoDate, &p.Quantity, &p.Mrp, &p.Rate, &p.Specifications, &p.Type, &p.Company, &p.Category, &p.Status)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// UpdatePurchaseOrderMasterMrpUnit sets (or clears, if unitID is nil) the
// mrp_unit_id tag on one row.
func UpdatePurchaseOrderMasterMrpUnit(ctx context.Context, db *pgxpool.Pool, id int, unitID *uuid.UUID) error {
	_, err := db.Exec(ctx, "UPDATE purchase_order_master SET mrp_unit_id = $1 WHERE id = $2", unitID, id)
	return err
}

// UpdatePurchaseOrderMasterProductCode sets (or clears, if code is nil/empty)
// the product_code tag on one row.
func UpdatePurchaseOrderMasterProductCode(ctx context.Context, db *pgxpool.Pool, id int, code *string) error {
	if code != nil && *code == "" {
		code = nil
	}
	_, err := db.Exec(ctx, "UPDATE purchase_order_master SET product_code = $1 WHERE id = $2", code, id)
	return err
}

// UpdatePurchaseOrderMasterProductName renames the product on one row.
// name must be non-empty — product_name is required across the app (search,
// last-PO lookup, etc.), unlike product_code.
func UpdatePurchaseOrderMasterProductName(ctx context.Context, db *pgxpool.Pool, id int, name string) error {
	_, err := db.Exec(ctx, "UPDATE purchase_order_master SET product_name = $1 WHERE id = $2", name, id)
	return err
}

// UpdatePurchaseOrderMasterComposition sets (or clears, if text is nil/empty)
// the composition tag on one row.
func UpdatePurchaseOrderMasterComposition(ctx context.Context, db *pgxpool.Pool, id int, composition *string) error {
	if composition != nil && *composition == "" {
		composition = nil
	}
	_, err := db.Exec(ctx, "UPDATE purchase_order_master SET composition = $1 WHERE id = $2", composition, id)
	return err
}

// MatchedProduct is what a product_code lookup resolves to — just the two
// fields the master list wants to auto-fill (name and composition).
type MatchedProduct struct {
	Name           string  `json:"name"`
	KeyIngredients *string `json:"key_ingredients"`
}

// LookupProductByMargCode finds the catalog product whose marg_code matches
// code exactly (trimmed). Returns (nil, nil) if there's no match — that's
// not an error, just means the code doesn't correspond to a known product.
func LookupProductByMargCode(ctx context.Context, db *pgxpool.Pool, code string) (*MatchedProduct, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, nil
	}
	var p MatchedProduct
	err := db.QueryRow(ctx, "SELECT name, key_ingredients FROM products WHERE marg_code = $1", code).Scan(&p.Name, &p.KeyIngredients)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// CreateMasterPORequest is what the "New Purchase Order" form submits.
// ManufacturerID is resolved to a manufacturer name and stored in the
// loosely-typed `company` column — the master table has no manufacturer_id
// FK (kept as-is, matching the historical import's shape).
type CreateMasterPORequest struct {
	PODate         string     `json:"po_date"`
	ProductName    string     `json:"product_name"`
	Quantity       int        `json:"quantity"`
	MRP            *float64   `json:"mrp,omitempty"`
	MrpUnitID      *uuid.UUID `json:"mrp_unit_id,omitempty"`
	Rate           *float64   `json:"rate,omitempty"`
	Specifications *string    `json:"specifications,omitempty"`
	Type           *string    `json:"type,omitempty"`
	ManufacturerID uuid.UUID  `json:"manufacturer_id"`
	Remarks        *string    `json:"remarks,omitempty"`
	Category       *string    `json:"category,omitempty"`
	Status         string     `json:"status,omitempty"`
}

// CreatePurchaseOrderInMaster inserts a new PO directly into the master
// list, continuing its existing sr_no/po_number sequence (MP1864, MP1865,
// ...) rather than starting a separate numbering scheme. Returns the new
// row's id and po_number.
func CreatePurchaseOrderInMaster(ctx context.Context, db *pgxpool.Pool, req CreateMasterPORequest) (int, string, error) {
	if req.Status == "" {
		req.Status = "Active"
	}

	var manufacturerName string
	if err := db.QueryRow(ctx, "SELECT name FROM manufacturers WHERE id = $1", req.ManufacturerID).Scan(&manufacturerName); err != nil {
		return 0, "", fmt.Errorf("manufacturer not found: %w", err)
	}

	var nextSrNo int
	if err := db.QueryRow(ctx, "SELECT COALESCE(MAX(sr_no), 0) + 1 FROM purchase_order_master").Scan(&nextSrNo); err != nil {
		return 0, "", err
	}
	poNumber := fmt.Sprintf("MP%04d", nextSrNo)

	var mrpText *string
	if req.MRP != nil {
		s := fmt.Sprintf("%.2f", *req.MRP)
		mrpText = &s
	}

	var estimate *float64
	if req.Rate != nil {
		e := float64(req.Quantity) * (*req.Rate)
		estimate = &e
	}

	var id int
	err := db.QueryRow(ctx,
		`INSERT INTO purchase_order_master (
			sr_no, po_date, po_number, product_name, quantity, mrp, mrp_unit_id, rate, estimate,
			specifications, type, company, remarks, category, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING id`,
		nextSrNo, req.PODate, poNumber, req.ProductName, req.Quantity, mrpText, req.MrpUnitID, req.Rate, estimate,
		req.Specifications, req.Type, manufacturerName, req.Remarks, req.Category, req.Status,
	).Scan(&id)
	return id, poNumber, err
}
