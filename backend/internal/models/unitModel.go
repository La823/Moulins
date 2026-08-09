package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Unit struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

func CreateUnit(ctx context.Context, db *pgxpool.Pool, name string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO units (name) VALUES ($1) RETURNING id`, name,
	).Scan(&id)
	return id, err
}

func GetAllUnits(ctx context.Context, db *pgxpool.Pool) ([]Unit, error) {
	rows, err := db.Query(ctx, `SELECT id, name, created_at FROM units ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Unit{}
	for rows.Next() {
		var u Unit
		if err := rows.Scan(&u.ID, &u.Name, &u.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, rows.Err()
}

func DeleteUnit(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM units WHERE id = $1`, id)
	return err
}
