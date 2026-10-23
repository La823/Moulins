package margede

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Product trend for one party: per product, what they bought this month
// against last month and their average over the last N full months — to
// see which products to push to them.
//
// Bought = units charged (free units left out) on sale invoices and
// challans not yet billed, cancelled bills left out. The average counts
// full months only, from the window start or the month they first bought
// the product, whichever is later (bills go back to 1 April), so a product
// they took up two months ago is averaged over those two months.
//
// Flags:
//   - down: this month is below both last month and the average (includes
//     not bought yet this month)
//   - lapsed: bought earlier this year, nothing in the window or this month
//   - new: first bought this month
//   - ok: otherwise

// PartyTrendRow is one product.
type PartyTrendRow struct {
	ProductPID int64      `json:"product_pid"`
	Name       string     `json:"name"`
	Company    *string    `json:"company"`
	ThisQty    float64    `json:"this_qty"`
	ThisValue  float64    `json:"this_value"` // before GST
	LastQty    float64    `json:"last_qty"`
	AvgQty     *float64   `json:"avg_qty"` // nil when there's no full month to average
	AvgValue   *float64   `json:"avg_value"`
	AvgMonths  int        `json:"avg_months"`
	FirstMonth time.Time  `json:"first_month"` // first month they bought it this year
	LastBought *time.Time `json:"last_bought"`
	YearQty    float64    `json:"year_qty"`
	Bills      int        `json:"bills"`
	Status     string     `json:"status"`    // down | lapsed | new | ok
	Shortfall  float64    `json:"shortfall"` // average − this month, when down

	// Month by month this financial year, zero-filled, for the chart.
	Monthly []PartyProductMonth `json:"monthly"`
}

// PartyProductMonth is one month of one product for the party.
type PartyProductMonth struct {
	Month string  `json:"month"` // yyyy-mm
	Qty   float64 `json:"qty"`   // charged
	Free  float64 `json:"free"`
	Value float64 `json:"value"` // before GST
	Bills int     `json:"bills"`
}

// PartyTrend is the report.
type PartyTrend struct {
	PartyCode   string          `json:"party_code"`
	Months      int             `json:"months"` // N
	ThisMonth   time.Time       `json:"this_month"`
	DaysGone    int             `json:"days_gone"` // of this month, today included
	DaysInMonth int             `json:"days_in_month"`
	Rows        []PartyTrendRow `json:"rows"`
	Counts      map[string]int  `json:"counts"`
}

// PartyProductTrend builds the report for a party code over N months (1-12).
func PartyProductTrend(ctx context.Context, db *pgxpool.Pool, code string, months int) (PartyTrend, error) {
	if months < 1 || months > 12 {
		months = 3
	}
	today := istToday()
	m0 := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC)
	out := PartyTrend{
		PartyCode: code, Months: months, ThisMonth: m0, DaysGone: today.Day(),
		DaysInMonth: m0.AddDate(0, 1, -1).Day(), Rows: []PartyTrendRow{},
		Counts: map[string]int{"down": 0, "lapsed": 0, "new": 0, "ok": 0},
	}
	var fyStart time.Time
	if err := db.QueryRow(ctx, `
		SELECT COALESCE(date_trunc('month', MIN(bill_date)), date_trunc('month', CURRENT_DATE))::date
		FROM marg_ede_bills WHERE NOT is_deleted`).Scan(&fyStart); err != nil {
		return out, err
	}
	windowStart := m0.AddDate(0, -months, 0)
	if windowStart.Before(fyStart) {
		windowStart = fyStart
	}

	rows, err := db.Query(ctx, `
		WITH l AS (
			SELECT i.product_pid, date_trunc('month', b.bill_date)::date AS mon, b.bill_date, b.voucher,
			       i.qty, i.amount
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE b.party_code = $1 AND b.bill_type = 'S' AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
		)
		SELECT l.product_pid, COALESCE(p.name, mp.name, 'Product ' || l.product_pid), p.company_name,
		       COALESCE(SUM(l.qty) FILTER (WHERE l.mon = $2), 0)::float8,
		       COALESCE(SUM(l.amount) FILTER (WHERE l.mon = $2), 0)::float8,
		       COALESCE(SUM(l.qty) FILTER (WHERE l.mon = $2::date - interval '1 month'), 0)::float8,
		       COALESCE(SUM(l.qty) FILTER (WHERE l.mon >= $3 AND l.mon < $2), 0)::float8,
		       COALESCE(SUM(l.amount) FILTER (WHERE l.mon >= $3 AND l.mon < $2), 0)::float8,
		       MIN(l.mon), MAX(l.bill_date), COALESCE(SUM(l.qty), 0)::float8, COUNT(DISTINCT l.voucher)::int
		FROM l
		LEFT JOIN marg_ede_products p ON p.product_pid = l.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = l.product_pid::text
		GROUP BY l.product_pid, p.name, mp.name, p.company_name`, code, m0, windowStart)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r PartyTrendRow
		var winQty, winValue float64
		if err := rows.Scan(&r.ProductPID, &r.Name, &r.Company, &r.ThisQty, &r.ThisValue, &r.LastQty,
			&winQty, &winValue, &r.FirstMonth, &r.LastBought, &r.YearQty, &r.Bills); err != nil {
			return out, err
		}
		start := windowStart
		if r.FirstMonth.After(start) {
			start = r.FirstMonth
		}
		r.AvgMonths = monthsBetween(start, m0)
		if r.AvgMonths > 0 {
			q, v := winQty/float64(r.AvgMonths), winValue/float64(r.AvgMonths)
			r.AvgQty, r.AvgValue = &q, &v
		}
		r.Status = trendStatus(r, winQty)
		if r.Status == "down" && r.AvgQty != nil {
			r.Shortfall = math.Max(*r.AvgQty-r.ThisQty, 0)
		}
		out.Counts[r.Status]++
		out.Rows = append(out.Rows, r)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	rows.Close()
	if err := attachTrendMonthly(ctx, db, &out, code, fyStart, m0); err != nil {
		return out, err
	}
	// Biggest shortfall first, then lapsed products by how much they took.
	rank := map[string]int{"down": 0, "lapsed": 1, "new": 2, "ok": 3}
	sort.SliceStable(out.Rows, func(i, j int) bool {
		a, b := out.Rows[i], out.Rows[j]
		if rank[a.Status] != rank[b.Status] {
			return rank[a.Status] < rank[b.Status]
		}
		if a.Shortfall != b.Shortfall {
			return a.Shortfall > b.Shortfall
		}
		return a.YearQty > b.YearQty
	})
	return out, nil
}

// trendStatus flags a product (see the package comment above).
func trendStatus(r PartyTrendRow, winQty float64) string {
	switch {
	case r.AvgMonths == 0:
		return "new"
	case winQty == 0 && r.ThisQty == 0:
		return "lapsed"
	case r.AvgQty != nil && r.ThisQty < r.LastQty && r.ThisQty < *r.AvgQty:
		return "down"
	}
	return "ok"
}

// monthsBetween counts whole months from a to b (both first of a month).
func monthsBetween(a, b time.Time) int {
	n := (b.Year()-a.Year())*12 + int(b.Month()-a.Month())
	if n < 0 {
		return 0
	}
	return n
}

// attachTrendMonthly adds each product's months, from the first month on
// record to this one, zero-filled.
func attachTrendMonthly(ctx context.Context, db *pgxpool.Pool, out *PartyTrend, code string, fyStart, m0 time.Time) error {
	var months []string
	for m := fyStart; !m.After(m0); m = m.AddDate(0, 1, 0) {
		months = append(months, m.Format("2006-01"))
	}
	idx := map[int64]map[string]*PartyProductMonth{}
	for i := range out.Rows {
		r := &out.Rows[i]
		r.Monthly = make([]PartyProductMonth, len(months))
		idx[r.ProductPID] = map[string]*PartyProductMonth{}
		for j, m := range months {
			r.Monthly[j] = PartyProductMonth{Month: m}
			idx[r.ProductPID][m] = &r.Monthly[j]
		}
	}
	rows, err := db.Query(ctx, `
		SELECT i.product_pid, to_char(b.bill_date, 'YYYY-MM'),
		       SUM(i.qty)::float8, SUM(i.free)::float8, SUM(i.amount)::float8, COUNT(DISTINCT b.voucher)::int
		FROM marg_ede_bill_items i
		JOIN marg_ede_bills b ON b.voucher = i.voucher
		WHERE b.party_code = $1 AND b.bill_type = 'S' AND NOT b.is_deleted AND NOT b.is_cancelled
		  AND NOT i.is_deleted AND i.line_kind <> 'charge'
		GROUP BY 1, 2`, code)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var pid int64
		var m PartyProductMonth
		if err := rows.Scan(&pid, &m.Month, &m.Qty, &m.Free, &m.Value, &m.Bills); err != nil {
			return err
		}
		if slot := idx[pid][m.Month]; slot != nil {
			*slot = m
		}
	}
	return rows.Err()
}
