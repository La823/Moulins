package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CartItem struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	Quantity  int       `json:"quantity"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Joined from products, so clients can render the cart without a
	// second round-trip. Images aren't included here — batching those
	// needs the relations loader that lives in the products handler
	// package, not the models layer; clients fall back to a placeholder
	// thumbnail for cart rows, same as anywhere else a product has none.
	ProductName string  `json:"product_name"`
	Price       float64 `json:"price"`
	Mrp         float64 `json:"mrp"`
	Stock       int     `json:"stock"`
	Moq         int     `json:"moq"`
	PackSize    *string `json:"pack_size,omitempty"`
	ProductForm *string `json:"product_form,omitempty"`
	IsActive    bool    `json:"is_active"`
}

func GetCartItems(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]CartItem, error) {
	rows, err := db.Query(ctx, `
		SELECT ci.id, ci.product_id, ci.quantity, ci.created_at, ci.updated_at,
			p.name, p.price, p.mrp, p.stock, p.moq, p.pack_size, p.product_form, p.is_active
		FROM cart_items ci
		JOIN products p ON p.id = ci.product_id
		WHERE ci.user_id = $1
		ORDER BY ci.created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]CartItem, 0)
	for rows.Next() {
		var c CartItem
		if err := rows.Scan(
			&c.ID, &c.ProductID, &c.Quantity, &c.CreatedAt, &c.UpdatedAt,
			&c.ProductName, &c.Price, &c.Mrp, &c.Stock, &c.Moq, &c.PackSize, &c.ProductForm, &c.IsActive,
		); err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, rows.Err()
}

// UpsertCartItem adds a product to the cart, or updates its quantity if it's
// already there — the (user_id, product_id) unique constraint makes this a
// single statement instead of a separate exists-check.
func UpsertCartItem(ctx context.Context, db *pgxpool.Pool, userID, productID uuid.UUID, quantity int) error {
	_, err := db.Exec(ctx, `
		INSERT INTO cart_items (user_id, product_id, quantity)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, product_id)
		DO UPDATE SET quantity = $3, updated_at = now()
	`, userID, productID, quantity)
	return err
}

func UpdateCartItemQuantity(ctx context.Context, db *pgxpool.Pool, userID, productID uuid.UUID, quantity int) error {
	_, err := db.Exec(ctx, `
		UPDATE cart_items SET quantity = $3, updated_at = now()
		WHERE user_id = $1 AND product_id = $2
	`, userID, productID, quantity)
	return err
}

func DeleteCartItem(ctx context.Context, db *pgxpool.Pool, userID, productID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`, userID, productID)
	return err
}

func DeleteAllCartItems(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1`, userID)
	return err
}

// ClearCart runs inside an existing transaction (order creation) so a
// failed order never wipes the cart — only a committed one does.
func ClearCart(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	_, err := tx.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1`, userID)
	return err
}

// PurgeOldCartItems removes abandoned cart rows — nobody checked out and
// the cart was never touched again. Returns the number of rows removed,
// for the scheduler to log.
func PurgeOldCartItems(ctx context.Context, db *pgxpool.Pool) (int64, error) {
	tag, err := db.Exec(ctx, `DELETE FROM cart_items WHERE updated_at < now() - interval '2 months'`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
