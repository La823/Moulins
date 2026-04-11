package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Manufacturer struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Emails    []string  `json:"emails"`
	Phone     *string   `json:"phone,omitempty"`
	Address   *string   `json:"address,omitempty"`
	GstNumber *string   `json:"gst_number,omitempty"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO manufacturers (name, emails, phone, address, gst_number, notes)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		req.Name, req.Emails, req.Phone, req.Address, req.GstNumber, req.Notes,
	).Scan(&id)
	return id, err
}

func GetAllManufacturers(ctx context.Context, db *pgxpool.Pool) ([]Manufacturer, error) {
	rows, err := db.Query(ctx,
		`SELECT id, name, emails, phone, address, gst_number, notes, created_at, updated_at
		 FROM manufacturers ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Manufacturer{}
	for rows.Next() {
		var m Manufacturer
		if err := rows.Scan(&m.ID, &m.Name, &m.Emails, &m.Phone, &m.Address, &m.GstNumber, &m.Notes, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

func GetManufacturerByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Manufacturer, error) {
	var m Manufacturer
	err := db.QueryRow(ctx,
		`SELECT id, name, emails, phone, address, gst_number, notes, created_at, updated_at
		 FROM manufacturers WHERE id = $1`, id,
	).Scan(&m.ID, &m.Name, &m.Emails, &m.Phone, &m.Address, &m.GstNumber, &m.Notes, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
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
