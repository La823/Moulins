package margede

import (
	"context"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Demand analysis: how fast each product leaves stock, and whether what is
// in stock lasts the next 90 days.
//
// Consumption is the units that left stock on sale invoices and on sale
// challans not yet billed (a billed challan disappears from Marg and its
// invoice counts instead), free units included — what empties the shelf,
// not only what was charged for. Averages are per month over full months
// (the month in progress would pull them down); a window reaching before
// the first month on record (Marg sends the current financial year only)
// divides by the months that exist.
//
// A product needs ordering when its usable stock (batches not yet expired)
// covers fewer than DemandCoverDays days at the 3-month average.

// DemandCoverDays is how many days of stock a product should have.
const DemandCoverDays = 90

// DemandRow is one product.
type DemandRow struct {
	ProductPID   int64      `json:"product_pid"`
	Code         *string    `json:"code"`
	Name         string     `json:"name"`
	Unit         *string    `json:"unit"`
	CompanyCode  *string    `json:"company_code"`
	Company      *string    `json:"company"`
	Stock        float64    `json:"stock"`         // usable: batches not expired
	ExpiredStock float64    `json:"expired_stock"` // in batches past expiry
	Avg2         float64    `json:"avg2"`          // units per month
	Avg3         float64    `json:"avg3"`
	Avg6         float64    `json:"avg6"`
	Avg12        float64    `json:"avg12"`
	ThisMonth    float64    `json:"this_month"`    // so far, not in the averages
	CoverDays    *float64   `json:"cover_days"`    // stock / daily avg3; nil when nothing sold
	NeedsOrder   bool       `json:"needs_order"`   // cover under DemandCoverDays
	SuggestedQty float64    `json:"suggested_qty"` // to reach DemandCoverDays days
	LastSold     *time.Time `json:"last_sold"`
	LastPurchase *time.Time `json:"last_purchase"`

	// Review state (demand_review.go).
	Review       string        `json:"review"` // ok | to_review | on_order | snoozed
	POs          []DemandPO    `json:"pos"`
	HasOpenPO    bool          `json:"has_open_po"`
	OpenPOQty    float64       `json:"open_po_qty"`    // ordered on open POs, not yet received
	StillToOrder float64       `json:"still_to_order"` // suggested less open PO qty
	Snooze       *DemandSnooze `json:"snooze"`         // active snooze
	SnoozeEnded  *DemandSnooze `json:"snooze_ended"`   // ended in the last two weeks, or early on running out
	LastRemark   *DemandRemark `json:"last_remark"`
	RemarksCount int           `json:"remarks_count"`
}

// DemandList is the demand analysis response.
type DemandList struct {
	Rows       []DemandRow `json:"rows"`
	CoverDays  int         `json:"cover_days"`
	FirstMonth time.Time   `json:"first_month"` // first month on record
	ThisMonth  time.Time   `json:"this_month"`  // the month left out of the averages
	Months     struct {
		Avg2  int `json:"avg2"`
		Avg3  int `json:"avg3"`
		Avg6  int `json:"avg6"`
		Avg12 int `json:"avg12"`
	} `json:"months"` // what each average divides by
	NeedsOrder int `json:"needs_order"`
	ToReview   int `json:"to_review"`
	OnOrder    int `json:"on_order"`
	Snoozed    int `json:"snoozed"`
}

// Demand returns every product with stock or sales this year.
func Demand(ctx context.Context, db *pgxpool.Pool) (DemandList, error) {
	out := DemandList{Rows: []DemandRow{}, CoverDays: DemandCoverDays}
	if err := db.QueryRow(ctx, `
		SELECT COALESCE(date_trunc('month', MIN(bill_date)), date_trunc('month', CURRENT_DATE))::date,
		       date_trunc('month', CURRENT_DATE)::date
		FROM marg_ede_bills WHERE NOT is_deleted`).Scan(&out.FirstMonth, &out.ThisMonth); err != nil {
		return out, err
	}
	avail := (out.ThisMonth.Year()-out.FirstMonth.Year())*12 + int(out.ThisMonth.Month()-out.FirstMonth.Month())
	div := func(n int) int {
		if avail < n {
			n = avail
		}
		if n < 1 {
			n = 1
		}
		return n
	}
	out.Months.Avg2, out.Months.Avg3, out.Months.Avg6, out.Months.Avg12 = div(2), div(3), div(6), div(12)

	rows, err := db.Query(ctx, `
		WITH m AS (SELECT date_trunc('month', CURRENT_DATE)::date AS m0),
		used AS (
			SELECT i.product_pid, date_trunc('month', b.bill_date)::date AS mon,
			       SUM(i.qty + i.free) AS q, MAX(b.bill_date) AS last_sold
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE b.bill_type = 'S' AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
			GROUP BY 1, 2
		),
		u AS (
			SELECT product_pid,
			       SUM(q) FILTER (WHERE mon < m0 AND mon >= m0 - interval '2 months') AS q2,
			       SUM(q) FILTER (WHERE mon < m0 AND mon >= m0 - interval '3 months') AS q3,
			       SUM(q) FILTER (WHERE mon < m0 AND mon >= m0 - interval '6 months') AS q6,
			       SUM(q) FILTER (WHERE mon < m0 AND mon >= m0 - interval '12 months') AS q12,
			       SUM(q) FILTER (WHERE mon = m0) AS qnow,
			       MAX(last_sold) AS last_sold
			FROM used, m GROUP BY product_pid
		),
		st AS (
			SELECT product_pid,
			       SUM(stock) FILTER (WHERE expiry IS NULL OR expiry >= CURRENT_DATE) AS usable,
			       SUM(stock) FILTER (WHERE expiry < CURRENT_DATE) AS expired
			FROM marg_ede_stock WHERE NOT is_deleted GROUP BY product_pid
		),
		lp AS (
			SELECT i.product_pid, MAX(b.bill_date) AS last_purchase
			FROM marg_ede_bill_items i JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE b.bill_type = 'P' AND NOT b.is_deleted AND NOT b.is_cancelled AND NOT i.is_deleted
			  AND i.line_kind <> 'charge'
			GROUP BY 1
		),
		pids AS (SELECT product_pid FROM u UNION SELECT product_pid FROM st)
		SELECT pids.product_pid, p.code, COALESCE(p.name, mp.name, 'Product ' || pids.product_pid), p.unit,
		       p.company_code, p.company_name,
		       COALESCE(st.usable, 0)::float8, COALESCE(st.expired, 0)::float8,
		       COALESCE(u.q2, 0)::float8, COALESCE(u.q3, 0)::float8, COALESCE(u.q6, 0)::float8,
		       COALESCE(u.q12, 0)::float8, COALESCE(u.qnow, 0)::float8,
		       u.last_sold, lp.last_purchase
		FROM pids
		LEFT JOIN u ON u.product_pid = pids.product_pid
		LEFT JOIN st ON st.product_pid = pids.product_pid
		LEFT JOIN lp ON lp.product_pid = pids.product_pid
		LEFT JOIN marg_ede_products p ON p.product_pid = pids.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = pids.product_pid::text
		WHERE NOT COALESCE(p.is_deleted, FALSE)`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r DemandRow
		var q2, q3, q6, q12 float64
		if err := rows.Scan(&r.ProductPID, &r.Code, &r.Name, &r.Unit, &r.CompanyCode, &r.Company,
			&r.Stock, &r.ExpiredStock, &q2, &q3, &q6, &q12, &r.ThisMonth, &r.LastSold, &r.LastPurchase); err != nil {
			return out, err
		}
		// Products that never moved and hold nothing (charges, old items)
		// say nothing about demand.
		if q12 == 0 && r.ThisMonth == 0 && r.Stock <= 0 {
			continue
		}
		r.Avg2 = q2 / float64(out.Months.Avg2)
		r.Avg3 = q3 / float64(out.Months.Avg3)
		r.Avg6 = q6 / float64(out.Months.Avg6)
		r.Avg12 = q12 / float64(out.Months.Avg12)
		if r.Avg3 > 0 {
			stock := math.Max(r.Stock, 0)
			daily := r.Avg3 * 12 / 365
			days := stock / daily
			r.CoverDays = &days
			if days < DemandCoverDays {
				r.NeedsOrder = true
				r.SuggestedQty = math.Ceil(daily*DemandCoverDays - stock)
				out.NeedsOrder++
			}
		}
		out.Rows = append(out.Rows, r)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	rows.Close()
	return out, attachReviews(ctx, db, &out)
}
