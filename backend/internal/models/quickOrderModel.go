package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The staff order page loads the whole catalogue at once — every product
// with its live Marg batches — and the chosen partner's last rate for each
// product, so searching, paging and the quantity/rate/batch box need no
// further requests. Both are small (the catalogue is a few hundred
// products) and cached in Redis by their handlers.

// QuickProduct is one product as the order page needs it.
type QuickProduct struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	MargCode *string  `json:"marg_code,omitempty"`
	Moq      int      `json:"moq"`
	Price    float64  `json:"price"` // selling price
	MRP      *float64 `json:"mrp,omitempty"`
	ThumbKey *string  `json:"-"`
	ThumbURL string   `json:"thumb_url,omitempty"`
	Active   bool     `json:"is_active"`
	Stock    float64  `json:"stock"` // across its live Marg batches
}

// QuickBatch is one live Marg batch of a product.
type QuickBatch struct {
	Code     string   `json:"code"`
	CurBatch string   `json:"curbatch"`
	Exp      string   `json:"exp"` // Marg's YYYYMMDD
	Stock    float64  `json:"stock"`
	MRP      *float64 `json:"mrp,omitempty"`
	PRate    *float64 `json:"prate,omitempty"` // purchase rate
}

// QuickCatalogue is the order page's catalogue.
type QuickCatalogue struct {
	Products []QuickProduct          `json:"products"`
	Batches  map[string][]QuickBatch `json:"batches"` // by product id, earliest expiry first
	BuiltAt  time.Time               `json:"built_at"`
}

// GetQuickCatalogue reads every product (active first, then by name) and
// every live batch, in two queries.
func GetQuickCatalogue(ctx context.Context, db *pgxpool.Pool) (QuickCatalogue, error) {
	out := QuickCatalogue{Products: []QuickProduct{}, Batches: map[string][]QuickBatch{}, BuiltAt: time.Now()}
	rows, err := db.Query(ctx, `
		SELECT id::text, name, NULLIF(marg_code, ''), COALESCE(moq, 0), COALESCE(price, 0)::float8, mrp::float8, thumb_key, is_active
		FROM products
		ORDER BY is_active DESC, name`)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var p QuickProduct
		if err := rows.Scan(&p.ID, &p.Name, &p.MargCode, &p.Moq, &p.Price, &p.MRP, &p.ThumbKey, &p.Active); err != nil {
			rows.Close()
			return out, err
		}
		out.Products = append(out.Products, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	rows, err = db.Query(ctx, `
		SELECT p.id::text, b.code, COALESCE(b.curbatch, ''), COALESCE(b.exp, ''), COALESCE(b.stock, 0)::float8, b.mrp::float8, b.prate::float8
		FROM products p
		JOIN margmaster_products mp ON mp.base_code = p.marg_code
		JOIN margmaster_product_batches b ON b.margmaster_product_id = mp.id AND NOT b.is_deleted
		WHERE p.marg_code IS NOT NULL AND p.marg_code <> ''
		ORDER BY p.id, NULLIF(trim(b.exp), '') ASC NULLS LAST, b.curbatch`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	stock := map[string]float64{}
	for rows.Next() {
		var pid string
		var b QuickBatch
		if err := rows.Scan(&pid, &b.Code, &b.CurBatch, &b.Exp, &b.Stock, &b.MRP, &b.PRate); err != nil {
			return out, err
		}
		out.Batches[pid] = append(out.Batches[pid], b)
		if b.Stock > 0 {
			stock[pid] += b.Stock
		}
	}
	for i := range out.Products {
		out.Products[i].Stock = stock[out.Products[i].ID]
	}
	return out, rows.Err()
}

// LastRate is what a partner was last charged for a product.
type LastRate struct {
	Rate   float64   `json:"rate"`
	Date   time.Time `json:"date"`
	Source string    `json:"source"` // bill | order
}

// GetLastRates returns, for every product the partner has been charged
// for, the most recent rate: their latest Marg sale bill line (the same
// party link as GetRateHistory), else their latest app order with a rate.
func GetLastRates(ctx context.Context, db *pgxpool.Pool, partnerID string) (map[string]LastRate, error) {
	out := map[string]LastRate{}
	rows, err := db.Query(ctx, `
		WITH party AS (
			SELECT TRIM(mp.code) AS code FROM users u
			JOIN margmaster_party mp ON mp.rid = NULLIF(u.rid, '')
			WHERE u.id = $1::uuid
		), bill AS (
			SELECT DISTINCT ON (p.id) p.id::text AS pid, i.rate::float8 AS rate, b.bill_date::timestamptz AS d
			FROM marg_ede_bills b
			JOIN marg_ede_bill_items i ON i.voucher = b.voucher AND NOT i.is_deleted
			JOIN products p ON p.marg_code = i.product_pid::text
			WHERE b.party_code = (SELECT code FROM party LIMIT 1)
			  AND b.bill_type = 'S' AND NOT b.is_deleted AND NOT b.is_cancelled AND COALESCE(i.rate, 0) > 0
			ORDER BY p.id, b.bill_date DESC, b.bill_no DESC
		), ord AS (
			SELECT DISTINCT ON (oi.product_id) oi.product_id::text AS pid, oi.rate::float8 AS rate, o.created_at AS d
			FROM order_items oi JOIN orders o ON o.id = oi.order_id
			WHERE o.user_id = $1::uuid AND oi.rate IS NOT NULL AND oi.rate > 0 AND o.status <> 'cancelled'
			ORDER BY oi.product_id, o.created_at DESC
		)
		SELECT pid, rate, d, 'bill' FROM bill
		UNION ALL
		SELECT pid, rate, d, 'order' FROM ord WHERE pid NOT IN (SELECT pid FROM bill)`, partnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid string
		var r LastRate
		if err := rows.Scan(&pid, &r.Rate, &r.Date, &r.Source); err != nil {
			return nil, err
		}
		out[pid] = r
	}
	return out, rows.Err()
}
