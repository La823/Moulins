package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type CarouselSlide struct {
	Position    int    `json:"position"`
	ImageKey    string `json:"image_key,omitempty"`
	ImageURL    string `json:"image_url,omitempty"`
	Heading     string `json:"heading"`
	Description string `json:"description"`
	ButtonText  string `json:"button_text"`
	ButtonLink  string `json:"button_link"`
}

type UpdateCarouselSlideRequest struct {
	ImageKey    string `json:"image_key"`
	Heading     string `json:"heading"`
	Description string `json:"description"`
	ButtonText  string `json:"button_text"`
	ButtonLink  string `json:"button_link"`
}

func GetAllCarouselSlides(ctx context.Context, db *pgxpool.Pool) ([]CarouselSlide, error) {
	rows, err := db.Query(ctx,
		`SELECT position, image_key, heading, description, button_text, button_link
		 FROM home_carousel_slides ORDER BY position ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var slides []CarouselSlide
	for rows.Next() {
		var s CarouselSlide
		var imageKey *string
		if err := rows.Scan(&s.Position, &imageKey, &s.Heading, &s.Description, &s.ButtonText, &s.ButtonLink); err != nil {
			return nil, err
		}
		if imageKey != nil {
			s.ImageKey = *imageKey
		}
		slides = append(slides, s)
	}
	return slides, nil
}

func GetCarouselSlide(ctx context.Context, db *pgxpool.Pool, position int) (CarouselSlide, error) {
	var s CarouselSlide
	var imageKey *string
	err := db.QueryRow(ctx,
		`SELECT position, image_key, heading, description, button_text, button_link
		 FROM home_carousel_slides WHERE position = $1`,
		position,
	).Scan(&s.Position, &imageKey, &s.Heading, &s.Description, &s.ButtonText, &s.ButtonLink)
	if imageKey != nil {
		s.ImageKey = *imageKey
	}
	return s, err
}

func UpdateCarouselSlide(ctx context.Context, db *pgxpool.Pool, position int, req UpdateCarouselSlideRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE home_carousel_slides SET
		   image_key = $1, heading = $2, description = $3, button_text = $4, button_link = $5, updated_at = now()
		 WHERE position = $6`,
		req.ImageKey, req.Heading, req.Description, req.ButtonText, req.ButtonLink, position,
	)
	return err
}

func CreateCarouselSlide(ctx context.Context, db *pgxpool.Pool) (CarouselSlide, error) {
	var s CarouselSlide
	err := db.QueryRow(ctx,
		`INSERT INTO home_carousel_slides (position, button_text, button_link)
		 VALUES (coalesce((SELECT max(position) FROM home_carousel_slides), 0) + 1, 'Learn More', '/products')
		 RETURNING position, heading, description, button_text, button_link`,
	).Scan(&s.Position, &s.Heading, &s.Description, &s.ButtonText, &s.ButtonLink)
	return s, err
}

func DeleteCarouselSlide(ctx context.Context, db *pgxpool.Pool, position int) error {
	_, err := db.Exec(ctx, `DELETE FROM home_carousel_slides WHERE position = $1`, position)
	return err
}
