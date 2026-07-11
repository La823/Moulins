package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func AddFavorite(ctx context.Context, db *pgxpool.Pool, userID, productID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO product_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, productID,
	)
	return err
}

func RemoveFavorite(ctx context.Context, db *pgxpool.Pool, userID, productID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`DELETE FROM product_favorites WHERE user_id = $1 AND product_id = $2`,
		userID, productID,
	)
	return err
}

// GetFavoriteProducts returns the user's favorited products (base fields
// only — the handler layer loads images/documents/categories the same way
// it does for GetAllProducts, via loadProductRelationsBatch).
func GetFavoriteProducts(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Product, error) {
	rows, err := db.Query(ctx,
		`SELECT p.id, p.name, p.description, p.price, p.stock, p.is_active,
		        p.brand_name, p.hsn_code, p.gst_rate, p.mrp, p.product_form, p.consume_type,
		        p.pack_size, p.pack_form, p.key_ingredients, p.strength, p.product_weight,
		        p.key_benefits, p.direction_for_use, p.safety_information,
		        p.created_at, p.updated_at
		 FROM product_favorites f
		 JOIN products p ON p.id = f.product_id
		 WHERE f.user_id = $1
		 ORDER BY f.created_at DESC`,
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

func GetFavoriteProductIDs(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := db.Query(ctx, `SELECT product_id FROM product_favorites WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
