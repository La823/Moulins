package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HomeHighlights struct {
	Heading         string `json:"heading"`
	Card1ImageKey   string `json:"card1_image_key,omitempty"`
	Card1ImageURL   string `json:"card1_image_url,omitempty"`
	Card1ButtonText string `json:"card1_button_text"`
	Card1LinkURL    string `json:"card1_link_url"`
	Card2ImageKey   string `json:"card2_image_key,omitempty"`
	Card2ImageURL   string `json:"card2_image_url,omitempty"`
	Card2ButtonText string `json:"card2_button_text"`
	Card2LinkURL    string `json:"card2_link_url"`
}

type UpdateHomeHighlightsRequest struct {
	Heading         string `json:"heading"`
	Card1ImageKey   string `json:"card1_image_key"`
	Card1ButtonText string `json:"card1_button_text"`
	Card1LinkURL    string `json:"card1_link_url"`
	Card2ImageKey   string `json:"card2_image_key"`
	Card2ButtonText string `json:"card2_button_text"`
	Card2LinkURL    string `json:"card2_link_url"`
}

func GetHomeHighlights(ctx context.Context, db *pgxpool.Pool) (HomeHighlights, error) {
	var h HomeHighlights
	var card1Key, card2Key *string
	err := db.QueryRow(ctx,
		`SELECT heading, card1_image_key, card1_button_text, card1_link_url,
		        card2_image_key, card2_button_text, card2_link_url
		 FROM home_highlights WHERE id = 1`,
	).Scan(&h.Heading, &card1Key, &h.Card1ButtonText, &h.Card1LinkURL,
		&card2Key, &h.Card2ButtonText, &h.Card2LinkURL)
	if card1Key != nil {
		h.Card1ImageKey = *card1Key
	}
	if card2Key != nil {
		h.Card2ImageKey = *card2Key
	}
	return h, err
}

func UpdateHomeHighlights(ctx context.Context, db *pgxpool.Pool, req UpdateHomeHighlightsRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE home_highlights SET
		   heading = $1,
		   card1_image_key = $2, card1_button_text = $3, card1_link_url = $4,
		   card2_image_key = $5, card2_button_text = $6, card2_link_url = $7,
		   updated_at = now()
		 WHERE id = 1`,
		req.Heading,
		req.Card1ImageKey, req.Card1ButtonText, req.Card1LinkURL,
		req.Card2ImageKey, req.Card2ButtonText, req.Card2LinkURL,
	)
	return err
}
