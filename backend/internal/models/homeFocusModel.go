package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type FocusCard struct {
	Position int    `json:"position"`
	ImageKey string `json:"image_key,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
	Title    string `json:"title"`
	LinkURL  string `json:"link_url"`
}

type UpdateFocusCardRequest struct {
	ImageKey string `json:"image_key"`
	Title    string `json:"title"`
	LinkURL  string `json:"link_url"`
}

type FocusSection struct {
	Heading     string `json:"heading"`
	Description string `json:"description"`
}

type UpdateFocusSectionRequest struct {
	Heading     string `json:"heading"`
	Description string `json:"description"`
}

func GetFocusSection(ctx context.Context, db *pgxpool.Pool) (FocusSection, error) {
	var s FocusSection
	err := db.QueryRow(ctx,
		`SELECT heading, description FROM home_focus_section WHERE id = 1`,
	).Scan(&s.Heading, &s.Description)
	return s, err
}

func UpdateFocusSection(ctx context.Context, db *pgxpool.Pool, req UpdateFocusSectionRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE home_focus_section SET heading = $1, description = $2, updated_at = now() WHERE id = 1`,
		req.Heading, req.Description,
	)
	return err
}

func GetAllFocusCards(ctx context.Context, db *pgxpool.Pool) ([]FocusCard, error) {
	rows, err := db.Query(ctx,
		`SELECT position, image_key, title, link_url FROM home_focus_cards ORDER BY position ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []FocusCard
	for rows.Next() {
		var c FocusCard
		var imageKey *string
		if err := rows.Scan(&c.Position, &imageKey, &c.Title, &c.LinkURL); err != nil {
			return nil, err
		}
		if imageKey != nil {
			c.ImageKey = *imageKey
		}
		cards = append(cards, c)
	}
	return cards, nil
}

func GetFocusCard(ctx context.Context, db *pgxpool.Pool, position int) (FocusCard, error) {
	var c FocusCard
	var imageKey *string
	err := db.QueryRow(ctx,
		`SELECT position, image_key, title, link_url FROM home_focus_cards WHERE position = $1`,
		position,
	).Scan(&c.Position, &imageKey, &c.Title, &c.LinkURL)
	if imageKey != nil {
		c.ImageKey = *imageKey
	}
	return c, err
}

func UpdateFocusCard(ctx context.Context, db *pgxpool.Pool, position int, req UpdateFocusCardRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE home_focus_cards SET image_key = $1, title = $2, link_url = $3, updated_at = now() WHERE position = $4`,
		req.ImageKey, req.Title, req.LinkURL, position,
	)
	return err
}
