package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Product card thumbnails (migration 150). One per product, made from its
// first image — the first not hidden, by sort order — which is what a card
// shows. The original image is never changed; see utils/thumbnail.go.

// coverImageSQL picks a product's first image the same way cards do.
const coverImageSQL = `
	SELECT pi.image_key FROM product_images pi
	WHERE pi.product_id = products.id AND NOT pi.hidden
	ORDER BY pi.sort_order, pi.created_at
	LIMIT 1`

// GetProductCoverImageKey returns the product's first image's key, or ""
// when it has none.
func GetProductCoverImageKey(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) (string, error) {
	var key *string
	err := db.QueryRow(ctx, `SELECT (`+coverImageSQL+`) FROM products WHERE products.id = $1`, productID).Scan(&key)
	if err != nil || key == nil {
		return "", err
	}
	return *key, nil
}

// SetProductThumbnail records a product's new thumbnail and the image it was
// made from, returning the thumbnail it replaces (nil if none) so the caller
// can delete that file.
func SetProductThumbnail(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, thumbKey, sourceKey string) (*string, error) {
	var old *string
	err := db.QueryRow(ctx, `
		UPDATE products p SET thumb_key = $2, thumb_source_key = $3
		FROM (SELECT thumb_key FROM products WHERE id = $1) prev
		WHERE p.id = $1
		RETURNING prev.thumb_key`, productID, thumbKey, sourceKey).Scan(&old)
	return old, err
}

// ProductNeedingThumbnail is a product whose card thumbnail is missing.
type ProductNeedingThumbnail struct {
	ID       uuid.UUID
	CoverKey string
}

// ListProductsWithoutThumbnail returns products that have a first image but
// no thumbnail yet — for the one-off backfill.
func ListProductsWithoutThumbnail(ctx context.Context, db *pgxpool.Pool) ([]ProductNeedingThumbnail, error) {
	rows, err := db.Query(ctx, `
		SELECT id, cover FROM (
			SELECT products.id, (`+coverImageSQL+`) AS cover
			FROM products WHERE products.thumb_key IS NULL
		) x WHERE cover IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProductNeedingThumbnail
	for rows.Next() {
		var p ProductNeedingThumbnail
		if err := rows.Scan(&p.ID, &p.CoverKey); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
