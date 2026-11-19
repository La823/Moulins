package models

import (
	"context"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BatchSplitPart is one batch's share of a line that was split.
type BatchSplitPart struct {
	BatchCode string // Marg batch code (what Marg receives)
	Batch     string // printed batch number
	Quantity  int
}

// BatchSplit describes one order line that was spread over several batches.
type BatchSplit struct {
	ProductName string
	Total       int
	Parts       []BatchSplitPart
}

// statuses whose lines get split: once an order is confirmed it is headed
// for Marg and packing, before that it may still change a lot
var batchSplitStatuses = map[string]bool{"confirmed": true, "packing": true, "packed": true}

// SplitOrderLinesByBatch makes sure no line of an order asks a batch for more
// than the batch holds. A line whose quantity is more than its batch's stock
// keeps what the batch can give, and the rest moves to new lines of the same
// product on the next batches, earliest expiry first (FEFO). So 100 ordered
// against batches holding 30 and 200 becomes two lines: 30 on the first
// batch, 70 on the second. Each line is then its own row on the order, the
// challan, packing and its own line in Marg.
//
// The line's own batch goes first: the one staff picked, else the FEFO
// default. Lines of the same product share the stock between them, and lines
// already sent to Marg or already checked in packing are not touched (but
// still use up their batch's stock). When all batches together are short,
// what is left stays on the line's first batch, as it did before splitting
// existed. Products not linked to Marg, or with no stock in any batch, are
// left alone.
//
// It does nothing for orders placed before splitting existed, or that are
// not confirmed, sent to packing or packed. Safe to run again: lines that already fit are left as they are.
func SplitOrderLinesByBatch(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) (splits []BatchSplit, changed bool, err error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	// the order row lock keeps two runs (confirm + push) from both splitting
	var status string
	var enabled bool
	if err := tx.QueryRow(ctx, `SELECT status, batch_split FROM orders WHERE id = $1 FOR UPDATE`, orderID).Scan(&status, &enabled); err != nil {
		return nil, false, err
	}
	// batch_split: only orders placed since splitting began (migration 193)
	if !enabled || !batchSplitStatuses[status] {
		return nil, false, nil
	}

	type line struct {
		id    uuid.UUID
		name  string
		qty   int
		batch string
		fixed bool
		base  string
	}
	rows, err := tx.Query(ctx, `
		SELECT oi.id, CASE WHEN oi.product_name != '' THEN oi.product_name ELSE p.name END,
		       oi.quantity, COALESCE(oi.selected_batch_code, ''),
		       oi.marg_pushed_at IS NOT NULL
		         OR EXISTS (SELECT 1 FROM order_item_packing k WHERE k.order_item_id = oi.id),
		       COALESCE(p.marg_code, '')
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1
		ORDER BY oi.created_at, oi.product_name, oi.id`, orderID)
	if err != nil {
		return nil, false, err
	}
	var lines []line
	baseSet := map[string]bool{}
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.id, &l.name, &l.qty, &l.batch, &l.fixed, &l.base); err != nil {
			rows.Close()
			return nil, false, err
		}
		if l.base == "" {
			continue
		}
		lines = append(lines, l)
		baseSet[l.base] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if len(lines) == 0 {
		return nil, false, nil
	}

	bases := make([]string, 0, len(baseSet))
	for b := range baseSet {
		bases = append(bases, b)
	}
	batchesByBase, err := GetLiveMargBatchesByBaseCodes(ctx, db, bases)
	if err != nil {
		return nil, false, err
	}

	// stock left per batch, per product
	avail := map[string]map[string]int{}
	for base, batches := range batchesByBase {
		m := map[string]int{}
		for _, b := range batches {
			if s := int(math.Floor(b.Stock)); s > 0 {
				m[b.Code] = s
			}
		}
		avail[base] = m
	}
	// lines already sent or packed hold their stock
	for _, l := range lines {
		if l.fixed && l.batch != "" {
			if m := avail[l.base]; m != nil {
				m[l.batch] = max(0, m[l.batch]-l.qty)
			}
		}
	}

	for _, l := range lines {
		batches := batchesByBase[l.base]
		if l.fixed || len(batches) == 0 {
			continue
		}
		left := avail[l.base]

		// the line's own batch first, then the rest FEFO
		order := make([]MargProductBatch, 0, len(batches))
		for _, b := range batches {
			if b.Code == l.batch {
				order = append(order, b)
			}
		}
		for _, b := range batches {
			if b.Code != l.batch {
				order = append(order, b)
			}
		}

		need := l.qty
		var parts []BatchSplitPart
		for _, b := range order {
			if need == 0 {
				break
			}
			a := left[b.Code]
			if a <= 0 {
				continue
			}
			take := min(a, need)
			parts = append(parts, BatchSplitPart{BatchCode: b.Code, Batch: b.CurBatch, Quantity: take})
			left[b.Code] = a - take
			need -= take
		}
		if len(parts) == 0 {
			continue // nothing in stock anywhere: leave it as it is
		}
		if need > 0 {
			parts[0].Quantity += need // short overall: the rest stays on the first batch
		}

		if len(parts) == 1 {
			code := parts[0].BatchCode
			if code == l.batch || (l.batch == "" && code == DefaultBatch(batches).Code) {
				continue // fits as it is
			}
			// its batch can't give anything (another line of the product
			// took it, or it is gone): move the line to the batch that can
			if _, err := tx.Exec(ctx, `UPDATE order_items SET selected_batch_code = $1 WHERE id = $2`, code, l.id); err != nil {
				return nil, false, err
			}
			changed = true
			continue
		}

		if _, err := tx.Exec(ctx,
			`UPDATE order_items SET quantity = $1, selected_batch_code = $2 WHERE id = $3`,
			parts[0].Quantity, parts[0].BatchCode, l.id); err != nil {
			return nil, false, err
		}
		for _, p := range parts[1:] {
			// same product, name, rate and remark; same created_at, so the
			// new line sorts right next to the original
			if _, err := tx.Exec(ctx, `
				INSERT INTO order_items (order_id, product_id, product_name, quantity, rate, remarks, selected_batch_code, created_at)
				SELECT order_id, product_id, product_name, $2, rate, remarks, $3, created_at
				FROM order_items WHERE id = $1`, l.id, p.Quantity, p.BatchCode); err != nil {
				return nil, false, err
			}
		}
		changed = true
		splits = append(splits, BatchSplit{ProductName: l.name, Total: l.qty, Parts: parts})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return splits, changed, nil
}
