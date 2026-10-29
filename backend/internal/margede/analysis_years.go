package margede

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Sales year by year for Analysis: the financial years before the Corporate
// EDE sync come from Marg's Day Book (marg_daybook_*, loaded from Excel),
// the rest from the live bills (marg_ede_bills). Each month comes from one
// source only — the Day Book for months before the first live bill, the
// live bills from then on — so nothing is counted twice.
//
// Same rules as analysis.go: sale invoices only (no challans), cancelled
// and deleted bills left out, credit notes kept apart. A Day Book bill's
// amount is what it charged the party (its party line), and without GST
// that less its tax lines — as a live bill is its total less the GST on its
// lines. Product figures need line items, which the Day Book doesn't have,
// so they stay on the live data only.

// fyLabelSQL is the financial year of a date, e.g. '2025-26' for 1 Apr 2025.
func fyLabelSQL(col string) string {
	return `to_char(` + col + ` - interval '3 months', 'YYYY') || '-' || to_char(` + col + ` + interval '9 months', 'YY')`
}

// liveStartCTE: the first month the live bills cover; the Day Book is used
// only before it.
const liveStartCTE = `ls AS (SELECT COALESCE(date_trunc('month', MIN(bill_date)), DATE '2026-04-01') AS d FROM marg_ede_bills WHERE NOT is_deleted)`

// daybookBillsCTE: Day Book bills (sales, credit notes, purchases) with the
// amount they charged their party, before the live data starts.
func daybookBillsCTE(exGST bool) string {
	amt := "SUM(e.debit + e.credit) FILTER (WHERE e.party_code = v.party_code)"
	if exGST {
		amt += " - COALESCE(SUM(e.debit + e.credit) FILTER (WHERE e.account_kind = 'tax'), 0)"
	}
	return `db AS (
			SELECT v.id, v.kind, v.voucher_date AS d, v.party_code, ` + amt + ` AS amt
			FROM marg_daybook_vouchers v
			JOIN marg_daybook_entries e ON e.voucher_id = v.id
			WHERE v.kind IN ('sale', 'credit_note', 'purchase') AND v.voucher_date < (SELECT d FROM ls)
			GROUP BY v.id
		)`
}

// YearMonth is one month's company totals.
type YearMonth struct {
	Month     string  `json:"month"`  // YYYY-MM
	FY        string  `json:"fy"`     // 2025-26
	Source    string  `json:"source"` // daybook | live
	Sales     float64 `json:"sales"`
	Returns   float64 `json:"returns"` // credit notes
	Purchases float64 `json:"purchases"`
	Bills     int     `json:"bills"`     // sale invoices
	Customers int     `json:"customers"` // parties with a sale invoice
}

// SalesByYear returns every month from the first Day Book month to now.
func SalesByYear(ctx context.Context, db *pgxpool.Pool, exGST bool) ([]YearMonth, error) {
	rows, err := db.Query(ctx, `
		WITH `+liveStartCTE+`, `+daybookBillsCTE(exGST)+`,
		live AS (
			SELECT b.bill_type, b.bill_mode, b.bill_date AS d, b.party_code, `+billAmount(exGST)+` AS amt
			FROM marg_ede_bills b`+bvJoin+`
			WHERE NOT b.is_deleted AND NOT b.is_cancelled
		),
		m AS (
			SELECT date_trunc('month', d) AS mon, 'daybook' AS src,
			       SUM(amt) FILTER (WHERE kind = 'sale') AS sales,
			       SUM(amt) FILTER (WHERE kind = 'credit_note') AS ret,
			       SUM(amt) FILTER (WHERE kind = 'purchase') AS pur,
			       COUNT(*) FILTER (WHERE kind = 'sale') AS bills,
			       COUNT(DISTINCT party_code) FILTER (WHERE kind = 'sale') AS cust
			FROM db GROUP BY 1
			UNION ALL
			SELECT date_trunc('month', b.d), 'live',
			       SUM(b.amt) FILTER (WHERE `+saleCond+`),
			       SUM(b.amt) FILTER (WHERE b.bill_type = 'R'),
			       SUM(b.amt) FILTER (WHERE b.bill_type = 'P'),
			       COUNT(*) FILTER (WHERE `+saleCond+`),
			       COUNT(DISTINCT b.party_code) FILTER (WHERE `+saleCond+`)
			FROM live b GROUP BY 1
		)
		SELECT to_char(mon, 'YYYY-MM'), `+fyLabelSQL("mon")+`, src,
		       COALESCE(sales, 0)::float8, COALESCE(ret, 0)::float8, COALESCE(pur, 0)::float8, bills::int, cust::int
		FROM m ORDER BY mon`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []YearMonth{}
	for rows.Next() {
		var m YearMonth
		if err := rows.Scan(&m.Month, &m.FY, &m.Source, &m.Sales, &m.Returns, &m.Purchases, &m.Bills, &m.Customers); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CustomerYear is one customer's sales in one financial year.
type CustomerYear struct {
	Sales   float64 `json:"sales"`
	Returns float64 `json:"returns"`
	Bills   int     `json:"bills"`
}

// CustomerYears is one customer's sales, year by year.
type CustomerYears struct {
	PartyCode string                  `json:"party_code"`
	Name      *string                 `json:"name"`
	City      *string                 `json:"city"`
	PartnerID *string                 `json:"partner_id"`
	Years     map[string]CustomerYear `json:"years"` // by FY, e.g. "2025-26"
	Total     float64                 `json:"total"` // sales over every year
	LastBill  *time.Time              `json:"last_bill"`
}

// CustomerYearList is every customer with a sale invoice in any year.
type CustomerYearList struct {
	FYs  []string        `json:"fys"` // oldest first
	Rows []CustomerYears `json:"rows"`
}

// CustomerSalesByYear lists every customer's sales per financial year,
// biggest buyers over all years first.
func CustomerSalesByYear(ctx context.Context, db *pgxpool.Pool, exGST bool) (CustomerYearList, error) {
	out := CustomerYearList{FYs: []string{}, Rows: []CustomerYears{}}
	rows, err := db.Query(ctx, `
		WITH `+liveStartCTE+`, `+daybookBillsCTE(exGST)+`,
		py AS (
			SELECT party_code, `+fyLabelSQL("d")+` AS fy,
			       SUM(amt) FILTER (WHERE kind = 'sale') AS sales,
			       SUM(amt) FILTER (WHERE kind = 'credit_note') AS ret,
			       COUNT(*) FILTER (WHERE kind = 'sale') AS bills,
			       MAX(d) FILTER (WHERE kind = 'sale') AS last_bill
			FROM db WHERE party_code IS NOT NULL GROUP BY 1, 2
			UNION ALL
			SELECT b.party_code, `+fyLabelSQL("b.bill_date")+`,
			       SUM(`+billAmount(exGST)+`) FILTER (WHERE `+saleCond+`),
			       SUM(`+billAmount(exGST)+`) FILTER (WHERE b.bill_type = 'R'),
			       COUNT(*) FILTER (WHERE `+saleCond+`),
			       MAX(b.bill_date) FILTER (WHERE `+saleCond+`)
			FROM marg_ede_bills b`+bvJoin+`
			WHERE NOT b.is_deleted AND NOT b.is_cancelled AND b.party_code IS NOT NULL
			GROUP BY 1, 2
		),
		buyers AS (SELECT party_code FROM py GROUP BY 1 HAVING SUM(sales) > 0)
		SELECT py.party_code, lg.name, lg.city, pt.partner_id, py.fy,
		       COALESCE(py.sales, 0)::float8, COALESCE(py.ret, 0)::float8, py.bills::int, py.last_bill
		FROM py
		JOIN buyers USING (party_code)
		LEFT JOIN LATERAL (
			SELECT l.name, l.city FROM marg_ede_ledger l
			WHERE l.party_code = py.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
		) lg ON TRUE
		LEFT JOIN LATERAL (
			SELECT u.id::text AS partner_id FROM margmaster_party mp
			JOIN users u ON u.rid = mp.rid AND u.role = 'partner'
			WHERE TRIM(mp.code) = py.party_code LIMIT 1
		) pt ON TRUE
		ORDER BY py.party_code, py.fy`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	index := map[string]int{}
	fys := map[string]bool{}
	for rows.Next() {
		var code, fy string
		var name, city, partner *string
		var y CustomerYear
		var last *time.Time
		if err := rows.Scan(&code, &name, &city, &partner, &fy, &y.Sales, &y.Returns, &y.Bills, &last); err != nil {
			return out, err
		}
		i, ok := index[code]
		if !ok {
			i = len(out.Rows)
			index[code] = i
			out.Rows = append(out.Rows, CustomerYears{PartyCode: code, Name: name, City: city, PartnerID: partner, Years: map[string]CustomerYear{}})
		}
		r := &out.Rows[i]
		r.Years[fy] = y
		r.Total += y.Sales
		if last != nil && (r.LastBill == nil || last.After(*r.LastBill)) {
			r.LastBill = last
		}
		if !fys[fy] {
			fys[fy] = true
			out.FYs = append(out.FYs, fy)
		}
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	sort.Strings(out.FYs)
	sort.SliceStable(out.Rows, func(i, j int) bool { return out.Rows[i].Total > out.Rows[j].Total })
	return out, nil
}
