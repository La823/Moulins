package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PurchaseOrder struct {
	ID               uuid.UUID  `json:"id"`
	PONumber         string     `json:"po_number"`
	SrNo             *int       `json:"sr_no,omitempty"`
	PODate           string     `json:"po_date"`
	ProductID        *uuid.UUID `json:"product_id,omitempty"`
	ProductName      string     `json:"product_name"`
	Quantity         int        `json:"quantity"`
	MRP              *float64   `json:"mrp,omitempty"`
	Rate             *float64   `json:"rate,omitempty"`
	Estimate         *float64   `json:"estimate,omitempty"`
	Specifications   *string    `json:"specifications,omitempty"`
	Type             *string    `json:"type,omitempty"`
	ManufacturerID   *uuid.UUID `json:"manufacturer_id,omitempty"`
	ManufacturerName string     `json:"manufacturer_name,omitempty"`
	QtyReceived      int        `json:"qty_received"`
	Remarks          *string    `json:"remarks,omitempty"`
	Category         *string    `json:"category,omitempty"`
	Status           string     `json:"status"`
	BillNumber       *string    `json:"bill_number,omitempty"`
	DocumentKey      *string    `json:"document_key,omitempty"`
	DocumentURL      string     `json:"document_url,omitempty"`
	CreatedBy        *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type CreatePORequest struct {
	PODate         string     `json:"po_date"`
	ProductID      *uuid.UUID `json:"product_id,omitempty"`
	ProductName    string     `json:"product_name"`
	Quantity       int        `json:"quantity"`
	MRP            *float64   `json:"mrp,omitempty"`
	Rate           *float64   `json:"rate,omitempty"`
	Specifications *string    `json:"specifications,omitempty"`
	Type           *string    `json:"type,omitempty"`
	ManufacturerID uuid.UUID  `json:"manufacturer_id"`
	Remarks        *string    `json:"remarks,omitempty"`
	Category       *string    `json:"category,omitempty"`
	Status         string     `json:"status,omitempty"`
}

type UpdatePORequest struct {
	PODate         *string    `json:"po_date,omitempty"`
	ProductID      *uuid.UUID `json:"product_id,omitempty"`
	ProductName    *string    `json:"product_name,omitempty"`
	Quantity       *int       `json:"quantity,omitempty"`
	MRP            *float64   `json:"mrp,omitempty"`
	Rate           *float64   `json:"rate,omitempty"`
	Specifications *string    `json:"specifications,omitempty"`
	Type           *string    `json:"type,omitempty"`
	ManufacturerID *uuid.UUID `json:"manufacturer_id,omitempty"`
	QtyReceived    *int       `json:"qty_received,omitempty"`
	Remarks        *string    `json:"remarks,omitempty"`
	Category       *string    `json:"category,omitempty"`
	Status         *string    `json:"status,omitempty"`
	BillNumber     *string    `json:"bill_number,omitempty"`
}

func GeneratePONumber(ctx context.Context, db *pgxpool.Pool) (string, error) {
	var maxNum int
	err := db.QueryRow(ctx,
		`SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 3) AS INT)), 0) FROM purchase_orders WHERE po_number ~ '^MP[0-9]+$'`,
	).Scan(&maxNum)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("MP%04d", maxNum+1), nil
}

func CreatePurchaseOrder(ctx context.Context, db *pgxpool.Pool, req CreatePORequest, createdBy uuid.UUID, poNumber string) (uuid.UUID, error) {
	if req.Status == "" {
		req.Status = "mail_done"
	}

	var estimate *float64
	if req.Rate != nil {
		e := float64(req.Quantity) * (*req.Rate)
		estimate = &e
	}

	var poID uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO purchase_orders (
			po_number, po_date, product_id, product_name, quantity, mrp, rate, estimate,
			specifications, type, manufacturer_id, remarks, category, status, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING id`,
		poNumber, req.PODate, req.ProductID, req.ProductName, req.Quantity, req.MRP, req.Rate, estimate,
		req.Specifications, req.Type, req.ManufacturerID, req.Remarks, req.Category, req.Status, createdBy,
	).Scan(&poID)
	return poID, err
}

func UpdatePurchaseOrder(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, req UpdatePORequest) error {
	// Build dynamic update
	query := `UPDATE purchase_orders SET updated_at = NOW()`
	args := []interface{}{}
	idx := 1

	add := func(field string, val interface{}) {
		query += fmt.Sprintf(", %s = $%d", field, idx)
		args = append(args, val)
		idx++
	}

	if req.PODate != nil {
		add("po_date", *req.PODate)
	}
	if req.ProductID != nil {
		add("product_id", *req.ProductID)
	}
	if req.ProductName != nil {
		add("product_name", *req.ProductName)
	}
	if req.Quantity != nil {
		add("quantity", *req.Quantity)
	}
	if req.MRP != nil {
		add("mrp", *req.MRP)
	}
	if req.Rate != nil {
		add("rate", *req.Rate)
		// recompute estimate
		if req.Quantity != nil {
			e := float64(*req.Quantity) * (*req.Rate)
			add("estimate", e)
		}
	}
	if req.Specifications != nil {
		add("specifications", *req.Specifications)
	}
	if req.Type != nil {
		add("type", *req.Type)
	}
	if req.ManufacturerID != nil {
		add("manufacturer_id", *req.ManufacturerID)
	}
	if req.QtyReceived != nil {
		add("qty_received", *req.QtyReceived)
	}
	if req.Remarks != nil {
		add("remarks", *req.Remarks)
	}
	if req.Category != nil {
		add("category", *req.Category)
	}
	if req.Status != nil {
		add("status", *req.Status)
	}
	if req.BillNumber != nil {
		add("bill_number", *req.BillNumber)
	}

	query += fmt.Sprintf(" WHERE id = $%d", idx)
	args = append(args, id)

	_, err := db.Exec(ctx, query, args...)
	return err
}

func SetPODocumentKey(ctx context.Context, db *pgxpool.Pool, poID uuid.UUID, key string) error {
	_, err := db.Exec(ctx,
		`UPDATE purchase_orders SET document_key = $1, updated_at = NOW() WHERE id = $2`,
		key, poID,
	)
	return err
}

func GetAllPurchaseOrders(ctx context.Context, db *pgxpool.Pool) ([]PurchaseOrder, error) {
	rows, err := db.Query(ctx,
		`SELECT po.id, po.po_number, po.sr_no, po.po_date::text, po.product_id, po.product_name,
		        po.quantity, po.mrp, po.rate, po.estimate, po.specifications, po.type,
		        po.manufacturer_id, COALESCE(m.name, ''), po.qty_received, po.remarks, po.category,
		        po.status, po.bill_number, po.document_key, po.created_by, po.created_at, po.updated_at
		 FROM purchase_orders po
		 LEFT JOIN manufacturers m ON m.id = po.manufacturer_id
		 ORDER BY po.po_date DESC, po.po_number DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []PurchaseOrder{}
	for rows.Next() {
		var po PurchaseOrder
		if err := rows.Scan(&po.ID, &po.PONumber, &po.SrNo, &po.PODate, &po.ProductID, &po.ProductName,
			&po.Quantity, &po.MRP, &po.Rate, &po.Estimate, &po.Specifications, &po.Type,
			&po.ManufacturerID, &po.ManufacturerName, &po.QtyReceived, &po.Remarks, &po.Category,
			&po.Status, &po.BillNumber, &po.DocumentKey, &po.CreatedBy, &po.CreatedAt, &po.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, po)
	}
	return list, rows.Err()
}

func GetPurchaseOrderByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*PurchaseOrder, error) {
	var po PurchaseOrder
	err := db.QueryRow(ctx,
		`SELECT po.id, po.po_number, po.sr_no, po.po_date::text, po.product_id, po.product_name,
		        po.quantity, po.mrp, po.rate, po.estimate, po.specifications, po.type,
		        po.manufacturer_id, COALESCE(m.name, ''), po.qty_received, po.remarks, po.category,
		        po.status, po.bill_number, po.document_key, po.created_by, po.created_at, po.updated_at
		 FROM purchase_orders po
		 LEFT JOIN manufacturers m ON m.id = po.manufacturer_id
		 WHERE po.id = $1`, id,
	).Scan(&po.ID, &po.PONumber, &po.SrNo, &po.PODate, &po.ProductID, &po.ProductName,
		&po.Quantity, &po.MRP, &po.Rate, &po.Estimate, &po.Specifications, &po.Type,
		&po.ManufacturerID, &po.ManufacturerName, &po.QtyReceived, &po.Remarks, &po.Category,
		&po.Status, &po.BillNumber, &po.DocumentKey, &po.CreatedBy, &po.CreatedAt, &po.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &po, nil
}

func DeletePurchaseOrder(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM purchase_orders WHERE id = $1`, id)
	return err
}
