package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Order struct {
	ID        uuid.UUID   `json:"id"`
	UserID    uuid.UUID   `json:"user_id"`
	Status    string      `json:"status"`
	Notes     *string     `json:"notes,omitempty"`
	Items     []OrderItem  `json:"items,omitempty"`
	Events    []OrderEvent `json:"events,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
	// Delivery details
	DeliveryPerson   *string `json:"delivery_person,omitempty"`
	TrackingNumber   *string `json:"tracking_number,omitempty"`
	ExpectedDelivery *string `json:"expected_delivery,omitempty"`
	DeliveryNotes    *string `json:"delivery_notes,omitempty"`
	// Joined fields for admin view
	UserName  string `json:"user_name,omitempty"`
	UserPhone string `json:"user_phone,omitempty"`
	ItemCount int    `json:"item_count,omitempty"`
}

type UpdateOrderDetailsRequest struct {
	DeliveryPerson   *string `json:"delivery_person"`
	TrackingNumber   *string `json:"tracking_number"`
	ExpectedDelivery *string `json:"expected_delivery"`
	DeliveryNotes    *string `json:"delivery_notes"`
}

type OrderItem struct {
	ID          uuid.UUID `json:"id"`
	OrderID     uuid.UUID `json:"order_id"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	Quantity    int       `json:"quantity"`
	CreatedAt   time.Time `json:"created_at"`
}

type OrderEvent struct {
	ID          uuid.UUID `json:"id"`
	OrderID     uuid.UUID `json:"order_id"`
	EventType   string    `json:"event_type"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateOrderRequest struct {
	Items []CreateOrderItemRequest `json:"items"`
	Notes *string                  `json:"notes,omitempty"`
}

type CreateOrderItemRequest struct {
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	Quantity    int       `json:"quantity"`
}

func CreateOrder(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, req CreateOrderRequest) (uuid.UUID, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var orderID uuid.UUID
	err = tx.QueryRow(ctx,
		`INSERT INTO orders (user_id, notes) VALUES ($1, $2) RETURNING id`,
		userID, req.Notes,
	).Scan(&orderID)
	if err != nil {
		return uuid.Nil, err
	}

	for _, item := range req.Items {
		_, err = tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, product_name, quantity) VALUES ($1, $2, $3, $4)`,
			orderID, item.ProductID, item.ProductName, item.Quantity,
		)
		if err != nil {
			return uuid.Nil, err
		}
	}

	// Log order.created event
	_, err = tx.Exec(ctx,
		`INSERT INTO order_events (order_id, event_type, description) VALUES ($1, $2, $3)`,
		orderID, "order.created", "Order was placed",
	)
	if err != nil {
		return uuid.Nil, err
	}

	if err = tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return orderID, nil
}

func GetOrdersByUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Order, error) {
	query := `
		SELECT o.id, o.user_id, o.status, o.notes, o.created_at, o.updated_at,
			COUNT(oi.id) AS item_count
		FROM orders o
		LEFT JOIN order_items oi ON oi.order_id = o.id
		WHERE o.user_id = $1
		GROUP BY o.id
		ORDER BY o.created_at DESC
	`
	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.UserID, &o.Status, &o.Notes, &o.CreatedAt, &o.UpdatedAt, &o.ItemCount); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

type OrderFilters struct {
	Status string
	Search string
	Sort   string // "newest" or "oldest"
}

func GetAllOrders(ctx context.Context, db *pgxpool.Pool, limit, offset int, filters OrderFilters) ([]Order, int, error) {
	where := ""
	args := []interface{}{}
	argIdx := 1

	if filters.Status != "" {
		where += fmt.Sprintf(" AND o.status = $%d", argIdx)
		args = append(args, filters.Status)
		argIdx++
	}
	if filters.Search != "" {
		where += fmt.Sprintf(" AND (u.username ILIKE $%d OR u.phone_number ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+filters.Search+"%")
		argIdx++
	}

	// Count query
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE 1=1%s`, where)
	var total int
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	sortDir := "DESC"
	if filters.Sort == "oldest" {
		sortDir = "ASC"
	}

	query := fmt.Sprintf(`
		SELECT o.id, o.user_id, o.status, o.notes, o.created_at, o.updated_at,
			COALESCE(u.username, '') AS user_name,
			COALESCE(u.phone_number, '') AS user_phone,
			COUNT(oi.id) AS item_count
		FROM orders o
		LEFT JOIN users u ON u.id = o.user_id
		LEFT JOIN order_items oi ON oi.order_id = o.id
		WHERE 1=1%s
		GROUP BY o.id, u.username, u.phone_number
		ORDER BY o.created_at %s
		LIMIT $%d OFFSET $%d
	`, where, sortDir, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.UserID, &o.Status, &o.Notes, &o.CreatedAt, &o.UpdatedAt,
			&o.UserName, &o.UserPhone, &o.ItemCount); err != nil {
			return nil, 0, err
		}
		orders = append(orders, o)
	}
	return orders, total, rows.Err()
}

func GetOrderByID(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) (*Order, error) {
	query := `
		SELECT o.id, o.user_id, o.status, o.notes, o.created_at, o.updated_at,
			o.delivery_person, o.tracking_number,
			CAST(o.expected_delivery AS TEXT), o.delivery_notes,
			COALESCE(u.username, '') AS user_name,
			COALESCE(u.phone_number, '') AS user_phone
		FROM orders o
		LEFT JOIN users u ON u.id = o.user_id
		WHERE o.id = $1
	`
	var o Order
	err := db.QueryRow(ctx, query, orderID).Scan(
		&o.ID, &o.UserID, &o.Status, &o.Notes, &o.CreatedAt, &o.UpdatedAt,
		&o.DeliveryPerson, &o.TrackingNumber,
		&o.ExpectedDelivery, &o.DeliveryNotes,
		&o.UserName, &o.UserPhone,
	)
	if err != nil {
		return nil, err
	}

	// Fetch items
	itemRows, err := db.Query(ctx,
		`SELECT id, order_id, product_id, product_name, quantity, created_at FROM order_items WHERE order_id = $1`,
		orderID,
	)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	o.Items = []OrderItem{}
	for itemRows.Next() {
		var item OrderItem
		if err := itemRows.Scan(&item.ID, &item.OrderID, &item.ProductID, &item.ProductName, &item.Quantity, &item.CreatedAt); err != nil {
			return nil, err
		}
		o.Items = append(o.Items, item)
	}

	if err := itemRows.Err(); err != nil {
		return nil, err
	}

	// Fetch events
	o.Events, err = GetOrderEvents(ctx, db, orderID)
	if err != nil {
		return nil, err
	}

	return &o, nil
}

func InsertOrderEvent(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID, eventType, description string) error {
	_, err := db.Exec(ctx,
		`INSERT INTO order_events (order_id, event_type, description) VALUES ($1, $2, $3)`,
		orderID, eventType, description,
	)
	return err
}

func GetOrderEvents(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) ([]OrderEvent, error) {
	rows, err := db.Query(ctx,
		`SELECT id, order_id, event_type, description, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at ASC`,
		orderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []OrderEvent{}
	for rows.Next() {
		var e OrderEvent
		if err := rows.Scan(&e.ID, &e.OrderID, &e.EventType, &e.Description, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func UpdateOrderStatus(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID, status string) error {
	_, err := db.Exec(ctx, `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`, status, orderID)
	return err
}

func UpdateOrderDetails(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID, req UpdateOrderDetailsRequest) error {
	_, err := db.Exec(ctx,
		`UPDATE orders SET delivery_person = $1, tracking_number = $2, expected_delivery = $3, delivery_notes = $4, updated_at = NOW() WHERE id = $5`,
		req.DeliveryPerson, req.TrackingNumber, req.ExpectedDelivery, req.DeliveryNotes, orderID,
	)
	return err
}

func UpdateOrderItem(ctx context.Context, db *pgxpool.Pool, itemID uuid.UUID, quantity int) error {
	_, err := db.Exec(ctx,
		`UPDATE order_items SET quantity = $1 WHERE id = $2`,
		quantity, itemID,
	)
	return err
}

func DeleteOrderItem(ctx context.Context, db *pgxpool.Pool, itemID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM order_items WHERE id = $1`, itemID)
	return err
}
