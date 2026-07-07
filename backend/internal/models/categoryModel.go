package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Category struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

func CreateCategory(ctx context.Context, db *pgxpool.Pool, name string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO categories (name) VALUES ($1) RETURNING id`, name,
	).Scan(&id)
	return id, err
}

func GetAllCategories(ctx context.Context, db *pgxpool.Pool) ([]Category, error) {
	rows, err := db.Query(ctx, `SELECT id, name, created_at FROM categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Category{}
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func UpdateCategory(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, name string) error {
	_, err := db.Exec(ctx, `UPDATE categories SET name = $1 WHERE id = $2`, name, id)
	return err
}

func DeleteCategory(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM categories WHERE id = $1`, id)
	return err
}
