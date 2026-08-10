package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TransportMode is an admin-managed category like "courier" or "transport"
// — transports.mode and orders/users transport_mode columns store the name
// as plain text rather than a foreign key, same as how units.name is used.
type TransportMode struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

func CreateTransportMode(ctx context.Context, db *pgxpool.Pool, name string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO transport_modes (name) VALUES ($1) RETURNING id`, name,
	).Scan(&id)
	return id, err
}

func GetAllTransportModes(ctx context.Context, db *pgxpool.Pool) ([]TransportMode, error) {
	rows, err := db.Query(ctx, `SELECT id, name, created_at FROM transport_modes ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []TransportMode{}
	for rows.Next() {
		var m TransportMode
		if err := rows.Scan(&m.ID, &m.Name, &m.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

func DeleteTransportMode(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM transport_modes WHERE id = $1`, id)
	return err
}

// IsValidTransportMode checks a mode name against the admin-managed list —
// every place that used to hardcode `mode != "courier" && mode != "transport"`
// now calls this instead, so newly-added modes work everywhere immediately.
func IsValidTransportMode(ctx context.Context, db *pgxpool.Pool, mode string) (bool, error) {
	if mode == "" {
		return false, nil
	}
	var exists bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM transport_modes WHERE name = $1)`, mode).Scan(&exists)
	return exists, err
}
