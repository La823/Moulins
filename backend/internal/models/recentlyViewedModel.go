package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RecordProductView upserts the (user, product) view timestamp, then trims
// the user's history down to the 25 most recently viewed — a capped queue,
// not an ever-growing log.
func RecordProductView(ctx context.Context, db *pgxpool.Pool, userID, productID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO recently_viewed (user_id, product_id, viewed_at) VALUES ($1, $2, now())
		 ON CONFLICT (user_id, product_id) DO UPDATE SET viewed_at = now()`,
		userID, productID,
	)
	if err != nil {
		return err
	}

	_, err = db.Exec(ctx,
		`DELETE FROM recently_viewed
		 WHERE user_id = $1 AND id NOT IN (
		     SELECT id FROM recently_viewed WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT 25
		 )`,
		userID,
	)
	return err
}

// GetRecentlyViewedProducts returns the user's queue, most recent first —
// base fields only (the handler loads images/documents/categories the same
// way it does for favorites/list, via loadProductRelationsBatch).
func GetRecentlyViewedProducts(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Product, error) {
	rows, err := db.Query(ctx,
		`SELECT p.id, p.name, p.description, p.price, p.stock, p.is_active,
		        p.brand_name, p.hsn_code, p.gst_rate, p.mrp, p.product_form, p.consume_type,
		        p.pack_size, p.pack_form, p.key_ingredients, p.strength, p.product_weight,
		        p.key_benefits, p.direction_for_use, p.safety_information,
		        p.created_at, p.updated_at
		 FROM recently_viewed rv
		 JOIN products p ON p.id = rv.product_id
		 WHERE rv.user_id = $1
		 ORDER BY rv.viewed_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := []Product{}
	for rows.Next() {
		var p Product
		err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Price,
			&p.Stock, &p.IsActive,
			&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
			&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
			&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
			&p.SafetyInfo, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}
