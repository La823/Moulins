package margede

import (
	"context"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Expiry risk: will a product's stock sell before it expires?
//
// Batches are sold earliest expiry first (FEFO), at the product's 3-month
// average (the rate the demand report uses). A batch has to be sold a
// minimum shelf life before its expiry — buyers won't take short-dated
// stock — so its deadline is expiry − shelfDays. Walking the batches in
// expiry order, each one sells from when the batches before it are gone
// until its own deadline; what can't be sold by then is at risk. A product
// that sold nothing in the last 3 full months has all its dated stock at
// risk. Batches already past expiry are reported as expired, not at risk.

// DefaultShelfDays is the minimum shelf life left when a batch is sold.
const DefaultShelfDays = 90

// BatchRisk is one batch's outlook.
type BatchRisk struct {
	StockID       int64      `json:"stock_id"` // marg_ede_stock.marg_id, for the batch page
	Batch         *string    `json:"batch"`
	Expiry        *time.Time `json:"expiry"`
	Stock         float64    `json:"stock"`
	PurchaseRate  *float64   `json:"purchase_rate"`
	MRP           *float64   `json:"mrp"`
	SellableUntil *time.Time `json:"sellable_until"` // expiry − shelf days
	SellsOutBy    *time.Time `json:"sells_out_by"`   // when the last unit goes, at the average; nil if it won't
	RiskQty       float64    `json:"risk_qty"`       // units not sold by SellableUntil
	RiskValue     float64    `json:"risk_value"`     // at the batch's purchase rate
	Status        string     `json:"status"`         // ok | at_risk | expired | no_expiry | too_new
}

type stockBatch struct {
	id           int64
	batch        *string
	expiry       *time.Time
	stock        float64
	purchaseRate *float64
	mrp          *float64
}

// loadBatches returns batches in stock, by product, earliest expiry first.
func loadBatches(ctx context.Context, db *pgxpool.Pool, product *int64) (map[int64][]stockBatch, error) {
	rows, err := db.Query(ctx, `
		SELECT product_pid, marg_id, batch, expiry, stock::float8,
		       NULLIF(COALESCE(purchase_rate, cost_rate), 0)::float8, NULLIF(mrp, 0)::float8
		FROM marg_ede_stock
		WHERE NOT is_deleted AND stock > 0 AND ($1::bigint IS NULL OR product_pid = $1)
		ORDER BY product_pid, expiry NULLS LAST, marg_id`, product)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]stockBatch{}
	for rows.Next() {
		var pid int64
		var b stockBatch
		if err := rows.Scan(&pid, &b.id, &b.batch, &b.expiry, &b.stock, &b.purchaseRate, &b.mrp); err != nil {
			return nil, err
		}
		out[pid] = append(out[pid], b)
	}
	return out, rows.Err()
}

// batchRisks walks a product's batches (earliest expiry first) at monthly
// average avgMonthly.
func batchRisks(batches []stockBatch, avgMonthly float64, shelfDays int, today time.Time) []BatchRisk {
	daily := avgMonthly * 12 / 365
	out := make([]BatchRisk, 0, len(batches))
	used := 0.0 // days of selling taken by the batches before
	for _, b := range batches {
		r := BatchRisk{StockID: b.id, Batch: b.batch, Expiry: b.expiry, Stock: b.stock, PurchaseRate: b.purchaseRate, MRP: b.mrp}
		if b.expiry != nil && b.expiry.Before(today) {
			r.Status = "expired"
			out = append(out, r)
			continue
		}
		var sold float64
		if b.expiry == nil {
			r.Status = "no_expiry"
			sold = b.stock
		} else {
			until := b.expiry.AddDate(0, 0, -shelfDays)
			r.SellableUntil = &until
			window := until.Sub(today).Hours()/24 - used
			sold = math.Min(b.stock, math.Max(0, daily*window))
			r.RiskQty = b.stock - sold
			if r.RiskQty < 0.5 { // part of a unit is rounding, not risk
				r.RiskQty = 0
			}
			r.Status = "ok"
			if r.RiskQty > 0 {
				r.Status = "at_risk"
				if b.purchaseRate != nil {
					r.RiskValue = r.RiskQty * *b.purchaseRate
				}
			}
		}
		if daily > 0 {
			used += sold / daily
			if r.RiskQty == 0 {
				d := today.AddDate(0, 0, int(math.Ceil(used)))
				r.SellsOutBy = &d
			}
		}
		out = append(out, r)
	}
	return out
}

// istToday is today's date in India, as a UTC midnight like DATE columns scan.
func istToday() time.Time {
	t := time.Now().In(istZone)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// attachExpiryRisk fills each row's expiry risk; all batches are kept when
// allBatches (the product page), only the at-risk ones otherwise.
func attachExpiryRisk(ctx context.Context, db *pgxpool.Pool, out *DemandList, product *int64, allBatches bool) error {
	batches, err := loadBatches(ctx, db, product)
	if err != nil {
		return err
	}
	today := istToday()
	out.ExpiryRisk = 0
	for i := range out.Rows {
		r := &out.Rows[i]
		r.Batches = []BatchRisk{}
		for _, b := range batchRisks(batches[r.ProductPID], r.Avg3, out.ShelfDays, today) {
			// Under 30 days of history the average is a guess: don't
			// call its stock at risk yet.
			if r.TooNew && b.Status == "at_risk" {
				b.Status, b.RiskQty, b.RiskValue = "too_new", 0, 0
			}
			if b.Status == "at_risk" {
				r.ExpiryRiskQty += b.RiskQty
				r.ExpiryRiskValue += b.RiskValue
			}
			if allBatches || b.Status == "at_risk" {
				r.Batches = append(r.Batches, b)
			}
		}
		if r.ExpiryRiskQty > 0 {
			out.ExpiryRisk++
		}
	}
	return nil
}
