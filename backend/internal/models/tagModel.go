package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Tag struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateTag creates a tag with an optional color — an empty string falls
// back to the column's default gray so callers never have to think about it.
func CreateTag(ctx context.Context, db *pgxpool.Pool, name string, color string) (uuid.UUID, error) {
	var id uuid.UUID
	var err error
	if color == "" {
		err = db.QueryRow(ctx,
			`INSERT INTO tags (name) VALUES ($1) RETURNING id`, name,
		).Scan(&id)
	} else {
		err = db.QueryRow(ctx,
			`INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING id`, name, color,
		).Scan(&id)
	}
	return id, err
}

func GetAllTags(ctx context.Context, db *pgxpool.Pool) ([]Tag, error) {
	rows, err := db.Query(ctx, `SELECT id, name, color, created_at FROM tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

func UpdateTag(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, name string, color string) error {
	_, err := db.Exec(ctx,
		`UPDATE tags SET name = $1, color = COALESCE(NULLIF($2, ''), color) WHERE id = $3`,
		name, color, id,
	)
	return err
}

func DeleteTag(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM tags WHERE id = $1`, id)
	return err
}
