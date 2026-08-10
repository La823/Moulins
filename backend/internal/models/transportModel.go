package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Transport is a named carrier under one of the two transport modes
// (courier/transport) — e.g. "Blue Dart" under courier, "Sharma Roadways"
// under transport. Orders reference one via transport_id once the partner
// (or staff) picks a mode and then a specific transport within it.
type Transport struct {
	ID        uuid.UUID `json:"id"`
	Mode      string    `json:"mode"`
	Name      string    `json:"name"`
	GstNumber *string   `json:"gst_number,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func CreateTransport(ctx context.Context, db *pgxpool.Pool, mode, name string, gstNumber *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO transports (mode, name, gst_number) VALUES ($1, $2, $3) RETURNING id`,
		mode, name, gstNumber,
	).Scan(&id)
	return id, err
}

// GetAllTransports returns every transport, optionally filtered by mode
// ("" returns all). Used both for the public checkout dropdown and the
// admin management screen.
func GetAllTransports(ctx context.Context, db *pgxpool.Pool, mode string) ([]Transport, error) {
	query := `SELECT id, mode, name, gst_number, created_at FROM transports`
	args := []any{}
	if mode != "" {
		query += ` WHERE mode = $1`
		args = append(args, mode)
	}
	query += ` ORDER BY mode, name`

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Transport{}
	for rows.Next() {
		var t Transport
		if err := rows.Scan(&t.ID, &t.Mode, &t.Name, &t.GstNumber, &t.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

func GetTransportByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Transport, error) {
	var t Transport
	err := db.QueryRow(ctx,
		`SELECT id, mode, name, gst_number, created_at FROM transports WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Mode, &t.Name, &t.GstNumber, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func UpdateTransport(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, name string, gstNumber *string) error {
	_, err := db.Exec(ctx,
		`UPDATE transports SET name = $1, gst_number = $2 WHERE id = $3`,
		name, gstNumber, id,
	)
	return err
}

func DeleteTransport(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM transports WHERE id = $1`, id)
	return err
}
