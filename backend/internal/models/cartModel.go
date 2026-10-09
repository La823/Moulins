package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

type CartItem struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	Quantity  int       `json:"quantity"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Joined from products, so clients can render the cart without a
	// second round-trip.
	ProductName string  `json:"product_name"`
	Price       float64 `json:"price"`
	Mrp         float64 `json:"mrp"`
	Stock       int     `json:"stock"`
	Moq         int     `json:"moq"`
	PackSize    *string `json:"pack_size,omitempty"`
	ProductForm *string `json:"product_form,omitempty"`
	IsActive    bool    `json:"is_active"`
	// The product's first visible image. A cart is a handful of rows, so
	// this is a per-row subquery rather than the batched relations loader
	// the products handler uses — the loader lives in that handler's
	// package and is not worth reaching for at this size.
	//
	// Hidden images are excluded here, not client-side, so an image staff
	// pulled from customer view cannot reach a customer through the cart.
	ImageKey *string `json:"image_key,omitempty"`
	ImageURL string  `json:"image_url,omitempty"`
}

// viewer leaves out items the user can no longer see: a product hidden from
// them after it went into their cart quietly drops out of it, and ordering
// it is refused (orders.CreateOrderHandler).
func GetCartItems(ctx context.Context, db *pgxpool.Pool, viewer ProductViewer, userID uuid.UUID) ([]CartItem, error) {
	query, args := viewer.andVisible(`
		SELECT ci.id, ci.product_id, ci.quantity, ci.created_at, ci.updated_at,
			p.name, p.price, p.mrp, p.stock, p.moq, p.pack_size, p.product_form, p.is_active,
			(SELECT pi.image_key FROM product_images pi
			  WHERE pi.product_id = p.id AND NOT pi.hidden
			  ORDER BY pi.sort_order, pi.created_at
			  LIMIT 1) AS image_key
		FROM cart_items ci
		JOIN products p ON p.id = ci.product_id
		WHERE ci.user_id = $1`, "p", []any{userID})
	rows, err := db.Query(ctx, query+` ORDER BY ci.created_at ASC`, args...)
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
			&c.ImageKey,
		); err != nil {
			return nil, err
		}
		// Resolved here rather than in each handler: two of them return
		// carts, and a handler that forgot would serve a key the client
		// cannot turn into an image.
		if c.ImageKey != nil && *c.ImageKey != "" {
			c.ImageURL = utils.GetPublicURL(*c.ImageKey)
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
