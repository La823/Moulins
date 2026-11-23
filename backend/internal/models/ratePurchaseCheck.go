package models

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RateCheckLine is one order line whose rate is about to be saved. BatchCode
// is the Marg batch picked on it ("" = the default batch, earliest expiry
// with stock — what the order will ship from).
type RateCheckLine struct {
	ProductID   uuid.UUID
	ProductName string
	BatchCode   string
	Rate        *float64
}

// RatesBelowPurchase checks that no rate is lower than the purchase rate of
// its line's batch (Marg's prate). It returns a message naming every line
// that is, or "" when all are fine. Lines with no rate, products not linked
// to Marg and batches without a purchase rate are not checked.
func RatesBelowPurchase(ctx context.Context, db *pgxpool.Pool, lines []RateCheckLine) (string, error) {
	var pids []string // as text: the driver can't send a []uuid.UUID
	var codes []string
	for _, l := range lines {
		if l.Rate == nil {
			continue
		}
		pids = append(pids, l.ProductID.String())
		if l.BatchCode != "" {
			codes = append(codes, l.BatchCode)
		}
	}
	if len(pids) == 0 {
		return "", nil
	}

	// a picked batch's purchase rate and name
	type batchInfo struct {
		prate float64
		name  string
	}
	picked := map[string]batchInfo{}
	if len(codes) > 0 {
		rows, err := db.Query(ctx, `
			SELECT DISTINCT ON (code) code, COALESCE(prate, 0)::float8, COALESCE(curbatch, code)
			FROM margmaster_product_batches WHERE code = ANY($1) AND is_deleted = FALSE`, codes)
		if err != nil {
			return "", err
		}
		for rows.Next() {
			var code string
			var b batchInfo
			if err := rows.Scan(&code, &b.prate, &b.name); err != nil {
				rows.Close()
				return "", err
			}
			picked[code] = b
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return "", err
		}
	}

	// each product's Marg code, for the default batch
	baseOf := map[uuid.UUID]string{}
	rows, err := db.Query(ctx, `SELECT id, COALESCE(marg_code, '') FROM products WHERE id = ANY($1::uuid[])`, pids)
	if err != nil {
		return "", err
	}
	var bases []string
	for rows.Next() {
		var id uuid.UUID
		var base string
		if err := rows.Scan(&id, &base); err != nil {
			rows.Close()
			return "", err
		}
		if base != "" {
			baseOf[id] = base
			bases = append(bases, base)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return "", err
	}
	batches, err := GetLiveMargBatchesByBaseCodes(ctx, db, bases)
	if err != nil {
		return "", err
	}

	var bad []string
	for _, l := range lines {
		if l.Rate == nil {
			continue
		}
		var b batchInfo
		var ok bool
		if l.BatchCode != "" {
			b, ok = picked[l.BatchCode]
		} else if list := batches[baseOf[l.ProductID]]; len(list) > 0 {
			d := DefaultBatch(list)
			if d.PRate != nil {
				b, ok = batchInfo{prate: *d.PRate, name: d.CurBatch}, true
			}
		}
		if !ok || b.prate <= 0 || *l.Rate >= b.prate-0.005 {
			continue
		}
		bad = append(bad, fmt.Sprintf("%s: rate %.2f is below the purchase rate %.2f of batch %s", l.ProductName, *l.Rate, b.prate, b.name))
	}
	if len(bad) == 0 {
		return "", nil
	}
	return "A rate can't be lower than the purchase rate. " + strings.Join(bad, "; ") + ".", nil
}

// OrderLinesForRateCheck turns rate changes on an order's lines into lines
// to check, with each line's product and picked batch.
func OrderLinesForRateCheck(ctx context.Context, db *pgxpool.Pool, rates []OrderItemRate) ([]RateCheckLine, error) {
	ids := []string{}
	rateOf := map[uuid.UUID]*float64{}
	for _, r := range rates {
		if r.Rate != nil {
			ids = append(ids, r.ItemID.String())
			rateOf[r.ItemID] = r.Rate
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := db.Query(ctx, `
		SELECT oi.id, oi.product_id, CASE WHEN oi.product_name != '' THEN oi.product_name ELSE p.name END,
		       COALESCE(oi.selected_batch_code, '')
		FROM order_items oi JOIN products p ON p.id = oi.product_id
		WHERE oi.id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RateCheckLine
	for rows.Next() {
		var id uuid.UUID
		var l RateCheckLine
		if err := rows.Scan(&id, &l.ProductID, &l.ProductName, &l.BatchCode); err != nil {
			return nil, err
		}
		l.Rate = rateOf[id]
		out = append(out, l)
	}
	return out, rows.Err()
}
