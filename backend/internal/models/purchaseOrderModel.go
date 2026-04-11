package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PurchaseOrder struct {
	ID               uuid.UUID           `json:"id"`
	PONumber         string              `json:"po_number"`
	ManufacturerID   uuid.UUID           `json:"manufacturer_id"`
	ManufacturerName string              `json:"manufacturer_name,omitempty"`
	Date             string              `json:"date"`
	Notes            *string             `json:"notes,omitempty"`
	DocumentKey      *string             `json:"document_key,omitempty"`
	DocumentURL      string              `json:"document_url,omitempty"`
	Status           string              `json:"status"`
	CreatedBy        uuid.UUID           `json:"created_by"`
	Items            []PurchaseOrderItem `json:"items,omitempty"`
	CreatedAt        time.Time           `json:"created_at"`
	UpdatedAt        time.Time           `json:"updated_at"`
}

type PurchaseOrderItem struct {
	ID          uuid.UUID  `json:"id"`
	POID        uuid.UUID  `json:"po_id"`
	ProductID   *uuid.UUID `json:"product_id,omitempty"`
	ProductName string     `json:"product_name"`
	Quantity    int        `json:"quantity"`
	Rate        float64    `json:"rate"`
	MRP         float64    `json:"mrp"`
	Packing     *string    `json:"packing,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type CreatePORequest struct {
	ManufacturerID uuid.UUID           `json:"manufacturer_id"`
	Date           string              `json:"date"`
	Notes          *string             `json:"notes,omitempty"`
	Items          []CreatePOItemInput `json:"items"`
}

type CreatePOItemInput struct {
	ProductID   *uuid.UUID `json:"product_id,omitempty"`
	ProductName string     `json:"product_name"`
	Quantity    int        `json:"quantity"`
	Rate        float64    `json:"rate"`
	MRP         float64    `json:"mrp"`
	Packing     *string    `json:"packing,omitempty"`
}

func GeneratePONumber(ctx context.Context, db *pgxpool.Pool) (string, error) {
	var count int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM purchase_orders`).Scan(&count)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("PO-%05d", count+1), nil
}

func CreatePurchaseOrder(ctx context.Context, db *pgxpool.Pool, req CreatePORequest, createdBy uuid.UUID, poNumber string) (uuid.UUID, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var poID uuid.UUID
	err = tx.QueryRow(ctx,
		`INSERT INTO purchase_orders (po_number, manufacturer_id, date, notes, created_by)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		poNumber, req.ManufacturerID, req.Date, req.Notes, createdBy,
	).Scan(&poID)
	if err != nil {
		return uuid.Nil, err
	}

	for _, item := range req.Items {
		_, err = tx.Exec(ctx,
			`INSERT INTO purchase_order_items (po_id, product_id, product_name, quantity, rate, mrp, packing)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			poID, item.ProductID, item.ProductName, item.Quantity, item.Rate, item.MRP, item.Packing,
		)
		if err != nil {
			return uuid.Nil, err
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return poID, nil
}

func SetPODocumentKey(ctx context.Context, db *pgxpool.Pool, poID uuid.UUID, key string) error {
	_, err := db.Exec(ctx,
		`UPDATE purchase_orders SET document_key = $1, updated_at = NOW() WHERE id = $2`,
		key, poID,
	)
	return err
}

func UpdatePOStatus(ctx context.Context, db *pgxpool.Pool, poID uuid.UUID, status string) error {
	_, err := db.Exec(ctx,
		`UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, poID,
	)
	return err
}

func GetAllPurchaseOrders(ctx context.Context, db *pgxpool.Pool) ([]PurchaseOrder, error) {
	rows, err := db.Query(ctx,
		`SELECT po.id, po.po_number, po.manufacturer_id, m.name, po.date::text, po.notes,
		        po.document_key, po.status, po.created_by, po.created_at, po.updated_at
		 FROM purchase_orders po
		 JOIN manufacturers m ON m.id = po.manufacturer_id
		 ORDER BY po.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []PurchaseOrder{}
	for rows.Next() {
		var po PurchaseOrder
		if err := rows.Scan(&po.ID, &po.PONumber, &po.ManufacturerID, &po.ManufacturerName,
			&po.Date, &po.Notes, &po.DocumentKey, &po.Status, &po.CreatedBy,
			&po.CreatedAt, &po.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, po)
	}
	return list, rows.Err()
}

func GetPurchaseOrderByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*PurchaseOrder, error) {
	var po PurchaseOrder
	err := db.QueryRow(ctx,
		`SELECT po.id, po.po_number, po.manufacturer_id, m.name, po.date::text, po.notes,
		        po.document_key, po.status, po.created_by, po.created_at, po.updated_at
		 FROM purchase_orders po
		 JOIN manufacturers m ON m.id = po.manufacturer_id
		 WHERE po.id = $1`, id,
	).Scan(&po.ID, &po.PONumber, &po.ManufacturerID, &po.ManufacturerName,
		&po.Date, &po.Notes, &po.DocumentKey, &po.Status, &po.CreatedBy,
		&po.CreatedAt, &po.UpdatedAt)
	if err != nil {
		return nil, err
	}

	// Fetch items
	rows, err := db.Query(ctx,
		`SELECT id, po_id, product_id, product_name, quantity, rate, mrp, packing, created_at
		 FROM purchase_order_items WHERE po_id = $1 ORDER BY created_at`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	po.Items = []PurchaseOrderItem{}
	for rows.Next() {
		var item PurchaseOrderItem
		if err := rows.Scan(&item.ID, &item.POID, &item.ProductID, &item.ProductName,
			&item.Quantity, &item.Rate, &item.MRP, &item.Packing, &item.CreatedAt); err != nil {
			return nil, err
		}
		po.Items = append(po.Items, item)
	}

	return &po, rows.Err()
}

func DeletePurchaseOrder(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM purchase_orders WHERE id = $1`, id)
	return err
}
