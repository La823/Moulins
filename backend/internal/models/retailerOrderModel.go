package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A retailer's order to their partner (180_retailers.sql). Separate from
// orders, Moulins' own order book: the partner supplies it, and can forward
// it to Moulins as an order of their own.

type RetailerOrderItem struct {
	ID          uuid.UUID `json:"id"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	Quantity    int       `json:"quantity"`
	Unit        string    `json:"unit"`           // what the quantity counts: "Strip", "Bottle"…
	PerBox      int       `json:"per_box"`        // units in one of the partner's packs
	Mrp         *float64  `json:"mrp,omitempty"`  // of one unit
	Rate        *float64  `json:"rate,omitempty"` // the partner's, per unit
}

type RetailerOrderEvent struct {
	Event       string    `json:"event"`
	Description string    `json:"description"`
	ActorName   string    `json:"actor_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type RetailerOrder struct {
	ID               uuid.UUID            `json:"id"`
	OrderNo          int64                `json:"order_no"`
	RetailerID       uuid.UUID            `json:"retailer_id"`
	RetailerName     string               `json:"retailer_name"`
	RetailerPhone    string               `json:"retailer_phone"`
	ShopName         *string              `json:"shop_name,omitempty"`
	BuyerKind        string               `json:"buyer_kind"` // retailer | doctor | team_member
	PartnerID        uuid.UUID            `json:"partner_id"`
	PartnerName      string               `json:"partner_name"`
	Status           string               `json:"status"`
	Notes            *string              `json:"notes,omitempty"`
	PartnerNote      *string              `json:"partner_note,omitempty"`
	Total            *float64             `json:"total,omitempty"`
	ForwardedOrderID *uuid.UUID           `json:"forwarded_order_id,omitempty"`
	ItemCount        int                  `json:"item_count"`
	CreatedAt        time.Time            `json:"created_at"`
	StatusChangedAt  *time.Time           `json:"status_changed_at,omitempty"`
	Items            []RetailerOrderItem  `json:"items,omitempty"`
	Events           []RetailerOrderEvent `json:"events,omitempty"`
}

type PlaceRetailerOrderItem struct {
	ProductID uuid.UUID `json:"product_id"`
	Quantity  int       `json:"quantity"`
}

var (
	ErrRetailerOrderNotFound = errors.New("order not found")
	// ErrRetailerOrderState: the order isn't in a state that allows this.
	ErrRetailerOrderState = errors.New("order can't be changed this way now")
)

const retailerOrderSelect = `
	SELECT o.id, o.order_no, o.retailer_id, COALESCE(d.name, ru.username, ''), ru.phone_number,
	       COALESCE(r.shop_name, d.clinic_name), CASE WHEN d.id IS NOT NULL THEN 'doctor' WHEN ru.role = 'team_member' THEN 'team_member' ELSE 'retailer' END,
	       o.partner_id, COALESCE(pu.username, pu.phone_number), o.status, o.notes, o.partner_note,
	       o.total::float8, o.forwarded_order_id,
	       (SELECT count(*) FROM retailer_order_items i WHERE i.retailer_order_id = o.id),
	       o.created_at, o.status_changed_at
	FROM retailer_orders o
	JOIN users ru ON ru.id = o.retailer_id
	JOIN users pu ON pu.id = o.partner_id
	LEFT JOIN retailers r ON r.user_id = o.retailer_id
	LEFT JOIN doctors d ON d.user_id = o.retailer_id`

func scanRetailerOrder(row pgx.Row, o *RetailerOrder) error {
	return row.Scan(&o.ID, &o.OrderNo, &o.RetailerID, &o.RetailerName, &o.RetailerPhone, &o.ShopName, &o.BuyerKind,
		&o.PartnerID, &o.PartnerName, &o.Status, &o.Notes, &o.PartnerNote,
		&o.Total, &o.ForwardedOrderID, &o.ItemCount, &o.CreatedAt, &o.StatusChangedAt)
}

// PlaceRetailerOrder records the retailer's order to their partner, with
// each product's MRP as it is now, and empties the retailer's cart in the
// same transaction. Products the retailer can't see are refused.
func PlaceRetailerOrder(ctx context.Context, db *pgxpool.Pool, retailerID, partnerID uuid.UUID, items []PlaceRetailerOrderItem, notes *string) (uuid.UUID, int64, error) {
	viewer := ProductViewer{PartnerID: &partnerID}
	tx, err := db.Begin(ctx)
	if err != nil {
		return uuid.Nil, 0, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	var no int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO retailer_orders (retailer_id, partner_id, notes) VALUES ($1, $2, $3) RETURNING id, order_no`,
		retailerID, partnerID, notes).Scan(&id, &no); err != nil {
		return uuid.Nil, 0, err
	}
	for i, it := range items {
		ok, err := CanSeeProduct(ctx, db, viewer, it.ProductID)
		if err != nil {
			return uuid.Nil, 0, err
		}
		if !ok {
			return uuid.Nil, 0, fmt.Errorf("%w: product %s", ErrProductNotVisible, it.ProductID)
		}
		// ordered in single packs (RetailUnit): keep the unit, how many make
		// a box, and the MRP of one
		var name string
		var packSize, packForm, mrpUnit *string
		var mrp *float64
		if err := tx.QueryRow(ctx, `SELECT name, pack_size, pack_form, mrp_unit, mrp::float8 FROM products WHERE id = $1`,
			it.ProductID).Scan(&name, &packSize, &packForm, &mrpUnit, &mrp); err != nil {
			return uuid.Nil, 0, err
		}
		unit, perBox, unitMrp := RetailUnit(packSize, packForm, mrpUnit, mrp)
		if _, err := tx.Exec(ctx, `
			INSERT INTO retailer_order_items (retailer_order_id, product_id, product_name, quantity, unit, per_box, mrp, sort_order)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			id, it.ProductID, name, it.Quantity, unit, perBox, unitMrp, i); err != nil {
			return uuid.Nil, 0, err
		}
	}
	if err := addRetailerOrderEvent(ctx, tx, id, "placed", "Order was placed", retailerID); err != nil {
		return uuid.Nil, 0, err
	}
	if err := ClearCart(ctx, tx, retailerID); err != nil {
		return uuid.Nil, 0, err
	}
	return id, no, tx.Commit(ctx)
}

// ErrProductNotVisible: an ordered product isn't in the retailer's catalogue.
var ErrProductNotVisible = errors.New("product not available")

func addRetailerOrderEvent(ctx context.Context, tx pgx.Tx, orderID uuid.UUID, event, desc string, actor uuid.UUID) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO retailer_order_events (order_id, event, description, actor_id) VALUES ($1, $2, $3, $4)`,
		orderID, event, desc, actor)
	return err
}

// ListRetailerOrders is a retailer's own orders (byRetailer) or every order
// a partner's retailers placed with them, newest first, optionally of one
// status.
func ListRetailerOrders(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, byRetailer bool, status string) ([]RetailerOrder, error) {
	col := "o.partner_id"
	if byRetailer {
		col = "o.retailer_id"
	}
	rows, err := db.Query(ctx, retailerOrderSelect+`
		WHERE `+col+` = $1 AND ($2 = '' OR o.status = $2)
		ORDER BY o.created_at DESC LIMIT 500`, userID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RetailerOrder{}
	for rows.Next() {
		var o RetailerOrder
		if err := scanRetailerOrder(rows, &o); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// GetRetailerOrder is one order with its lines and history, if userID is
// its retailer or its partner.
func GetRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, userID uuid.UUID) (*RetailerOrder, error) {
	var o RetailerOrder
	err := scanRetailerOrder(db.QueryRow(ctx, retailerOrderSelect+` WHERE o.id = $1 AND (o.retailer_id = $2 OR o.partner_id = $2)`, orderID, userID), &o)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRetailerOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, `
		SELECT id, product_id, product_name, quantity, COALESCE(unit, 'Unit'), per_box, mrp::float8, rate::float8
		FROM retailer_order_items WHERE retailer_order_id = $1 ORDER BY sort_order`, orderID)
	if err != nil {
		return nil, err
	}
	o.Items = []RetailerOrderItem{}
	for rows.Next() {
		var it RetailerOrderItem
		if err := rows.Scan(&it.ID, &it.ProductID, &it.ProductName, &it.Quantity, &it.Unit, &it.PerBox, &it.Mrp, &it.Rate); err != nil {
			rows.Close()
			return nil, err
		}
		o.Items = append(o.Items, it)
	}
	rows.Close()
	// a failure part-way must not pass for an order with no lines
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows, err = db.Query(ctx, `
		SELECT e.event, e.description, COALESCE(u.username, u.phone_number, ''), e.created_at
		FROM retailer_order_events e LEFT JOIN users u ON u.id = e.actor_id
		WHERE e.order_id = $1 ORDER BY e.created_at`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	o.Events = []RetailerOrderEvent{}
	for rows.Next() {
		var e RetailerOrderEvent
		if err := rows.Scan(&e.Event, &e.Description, &e.ActorName, &e.CreatedAt); err != nil {
			return nil, err
		}
		o.Events = append(o.Events, e)
	}
	return &o, rows.Err()
}

// setRetailerOrderStatus moves an order from one of `from` to `to`, for its
// partner (byPartner) or its retailer, logging the change. Returns
// ErrRetailerOrderNotFound or ErrRetailerOrderState when it can't.
func setRetailerOrderStatus(ctx context.Context, tx pgx.Tx, orderID, actor uuid.UUID, byPartner bool, from []string, to, note, event, desc string) error {
	col := "retailer_id"
	if byPartner {
		col = "partner_id"
	}
	var current string
	err := tx.QueryRow(ctx, `SELECT status FROM retailer_orders WHERE id = $1 AND `+col+` = $2 FOR UPDATE`, orderID, actor).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRetailerOrderNotFound
	}
	if err != nil {
		return err
	}
	allowed := false
	for _, f := range from {
		allowed = allowed || f == current
	}
	if !allowed {
		return ErrRetailerOrderState
	}
	if _, err := tx.Exec(ctx, `
		UPDATE retailer_orders SET status = $2, partner_note = COALESCE(NULLIF($3, ''), partner_note),
		       status_changed_at = now(), status_changed_by = $4, updated_at = now()
		WHERE id = $1`, orderID, to, note, actor); err != nil {
		return err
	}
	return addRetailerOrderEvent(ctx, tx, orderID, event, desc, actor)
}

func inTx(ctx context.Context, db *pgxpool.Pool, f func(pgx.Tx) error) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := f(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// AcceptRetailerOrder: the partner accepts, with their rate for each line
// (item id -> rate); the total is worked out from them.
func AcceptRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, partnerID uuid.UUID, rates map[uuid.UUID]float64, note string) error {
	return inTx(ctx, db, func(tx pgx.Tx) error {
		if err := setRetailerOrderStatus(ctx, tx, orderID, partnerID, true, []string{"pending"}, "accepted", note, "accepted", "Order was accepted"); err != nil {
			return err
		}
		ids := make([]string, 0, len(rates))
		vals := make([]float64, 0, len(rates))
		for id, v := range rates {
			ids, vals = append(ids, id.String()), append(vals, v)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE retailer_order_items i SET rate = x.rate
			FROM unnest($2::uuid[], $3::float8[]) AS x(id, rate)
			WHERE i.id = x.id AND i.retailer_order_id = $1`, orderID, ids, vals); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			UPDATE retailer_orders SET total = (SELECT COALESCE(sum(rate * quantity), 0) FROM retailer_order_items WHERE retailer_order_id = $1)
			WHERE id = $1`, orderID)
		return err
	})
}

func RejectRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, partnerID uuid.UUID, reason string) error {
	return inTx(ctx, db, func(tx pgx.Tx) error {
		return setRetailerOrderStatus(ctx, tx, orderID, partnerID, true, []string{"pending", "accepted"}, "rejected", reason, "rejected", "Order was declined")
	})
}

func DispatchRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, partnerID uuid.UUID, note string) error {
	return inTx(ctx, db, func(tx pgx.Tx) error {
		return setRetailerOrderStatus(ctx, tx, orderID, partnerID, true, []string{"accepted"}, "dispatched", note, "dispatched", "Order was dispatched")
	})
}

func DeliverRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, partnerID uuid.UUID, note string) error {
	return inTx(ctx, db, func(tx pgx.Tx) error {
		return setRetailerOrderStatus(ctx, tx, orderID, partnerID, true, []string{"accepted", "dispatched"}, "delivered", note, "delivered", "Order was delivered")
	})
}

// CancelRetailerOrder: the retailer withdraws an order the partner hasn't
// accepted yet.
func CancelRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, retailerID uuid.UUID) error {
	return inTx(ctx, db, func(tx pgx.Tx) error {
		return setRetailerOrderStatus(ctx, tx, orderID, retailerID, false, []string{"pending"}, "cancelled", "", "cancelled", "Order was cancelled by the retailer")
	})
}

// ErrAlreadyForwarded: the order was forwarded to Moulins before.
var ErrAlreadyForwarded = errors.New("already forwarded")

// ForwardRetailerOrder places the retailer order's lines as the partner's
// own order to Moulins (orders, so staff, Marg and the rest see it as any
// other partner order) and links the two. The partner's cart is untouched.
// Returns the new Moulins order's id.
func ForwardRetailerOrder(ctx context.Context, db *pgxpool.Pool, orderID, partnerID uuid.UUID) (uuid.UUID, error) {
	o, err := GetRetailerOrder(ctx, db, orderID, partnerID)
	if err != nil {
		return uuid.Nil, err
	}
	if o.PartnerID != partnerID {
		return uuid.Nil, ErrRetailerOrderNotFound
	}
	if o.ForwardedOrderID != nil {
		return uuid.Nil, ErrAlreadyForwarded
	}
	if o.Status == "rejected" || o.Status == "cancelled" || len(o.Items) == 0 {
		return uuid.Nil, ErrRetailerOrderState
	}
	note := fmt.Sprintf("For retailer order RO-%d (%s)", o.OrderNo, o.RetailerName)
	req := CreateOrderRequest{Notes: &note}
	// Moulins sells the partner whole packs: strips round up to boxes
	for _, it := range o.Items {
		req.Items = append(req.Items, CreateOrderItemRequest{ProductID: it.ProductID, ProductName: it.ProductName, Quantity: BoxesFor(it.Quantity, it.PerBox)})
	}
	newID, err := createOrderKeepingCart(ctx, db, partnerID, fmt.Sprintf("Order was placed from retailer order RO-%d", o.OrderNo), req)
	if err != nil {
		return uuid.Nil, err
	}
	err = inTx(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE retailer_orders SET forwarded_order_id = $2, updated_at = now() WHERE id = $1`, orderID, newID); err != nil {
			return err
		}
		return addRetailerOrderEvent(ctx, tx, orderID, "forwarded", "Order was forwarded to Moulins", partnerID)
	})
	return newID, err
}
