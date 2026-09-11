package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Manufacturer struct {
	ID        uuid.UUID `json:"id"`
	Code      *string   `json:"code,omitempty"`
	Name      string    `json:"name"`
	Emails    []string  `json:"emails"`
	Phone     *string   `json:"phone,omitempty"`
	Address   *string   `json:"address,omitempty"`
	GstNumber *string   `json:"gst_number,omitempty"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GenerateManufacturerCode returns the next sequential code, MFR0001-style,
// matching the existing PO number scheme (MP0001, ...). Reads the highest
// existing numeric suffix rather than a DB sequence, consistent with
// GeneratePONumber.
func GenerateManufacturerCode(ctx context.Context, db *pgxpool.Pool) (string, error) {
	var maxNum int
	err := db.QueryRow(ctx,
		`SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INT)), 0) FROM manufacturers WHERE code ~ '^MFR[0-9]+$'`,
	).Scan(&maxNum)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("MFR%04d", maxNum+1), nil
}

type CreateManufacturerRequest struct {
	Name      string   `json:"name"`
	Emails    []string `json:"emails"`
	Phone     *string  `json:"phone,omitempty"`
	Address   *string  `json:"address,omitempty"`
	GstNumber *string  `json:"gst_number,omitempty"`
	Notes     *string  `json:"notes,omitempty"`
}

func CreateManufacturer(ctx context.Context, db *pgxpool.Pool, req CreateManufacturerRequest) (uuid.UUID, error) {
	code, err := GenerateManufacturerCode(ctx, db)
	if err != nil {
		return uuid.Nil, err
	}

	var id uuid.UUID
	err = db.QueryRow(ctx,
		`INSERT INTO manufacturers (code, name, emails, phone, address, gst_number, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		code, req.Name, req.Emails, req.Phone, req.Address, req.GstNumber, req.Notes,
	).Scan(&id)
	return id, err
}

func GetAllManufacturers(ctx context.Context, db *pgxpool.Pool) ([]Manufacturer, error) {
	rows, err := db.Query(ctx,
		`SELECT id, code, name, emails, phone, address, gst_number, notes, created_at, updated_at
		 FROM manufacturers ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Manufacturer{}
	for rows.Next() {
		var m Manufacturer
		if err := rows.Scan(&m.ID, &m.Code, &m.Name, &m.Emails, &m.Phone, &m.Address, &m.GstNumber, &m.Notes, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

func GetManufacturerByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Manufacturer, error) {
	var m Manufacturer
	err := db.QueryRow(ctx,
		`SELECT id, code, name, emails, phone, address, gst_number, notes, created_at, updated_at
		 FROM manufacturers WHERE id = $1`, id,
	).Scan(&m.ID, &m.Code, &m.Name, &m.Emails, &m.Phone, &m.Address, &m.GstNumber, &m.Notes, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// GetManufacturerByName looks up a manufacturer by exact name, case- and
// whitespace-insensitive — used to resolve the loosely-typed `company` text
// column on purchase_order_master back to a real manufacturer record (e.g.
// for its email addresses). Returns (nil, nil) if there's no match.
func GetManufacturerByName(ctx context.Context, db *pgxpool.Pool, name string) (*Manufacturer, error) {
	var m Manufacturer
	err := db.QueryRow(ctx,
		`SELECT id, code, name, emails, phone, address, gst_number, notes, created_at, updated_at
		 FROM manufacturers WHERE lower(trim(name)) = lower(trim($1))`, name,
	).Scan(&m.ID, &m.Code, &m.Name, &m.Emails, &m.Phone, &m.Address, &m.GstNumber, &m.Notes, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &m, nil
}

func UpdateManufacturer(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, req CreateManufacturerRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE manufacturers SET name=$1, emails=$2, phone=$3, address=$4, gst_number=$5, notes=$6, updated_at=NOW()
		 WHERE id=$7`,
		req.Name, req.Emails, req.Phone, req.Address, req.GstNumber, req.Notes, id,
	)
	return err
}

func DeleteManufacturer(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM manufacturers WHERE id = $1`, id)
	return err
}
