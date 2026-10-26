package margede

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Reports for the admin Analysis page, all over this financial year's
// bills (cancelled and deleted bills left out).
//
// Party and month amounts are Marg's bill totals (marg_ede_bills.total,
// incl. GST and freight), not summed from lines, because some bills come
// without all their lines; with ExGST, the total less the GST on its lines.
// Product rankings can only use lines: goods, before or after their GST.
// Credit notes are counted the same way and kept apart, not subtracted.
//
// "Sales" are sale invoices only: CA challans are left out because an
// unbilled challan is not a sale yet and a billed one shows up as its
// invoice. "Average per month" divides by every month of the year so far
// (from the first bill on record to the current month), so a party that
// bought once is not ranked as if it bought that much every month.

const saleCond = `b.bill_type = 'S' AND b.bill_mode IS DISTINCT FROM 'challan'`

// billAmount is a bill's amount in these reports: Marg's bill total, or
// with exGST that total less the GST on its lines (bvJoin). A bill with
// lines missing keeps their GST in.
func billAmount(exGST bool) string {
	if exGST {
		return "(b.total - COALESCE(bv.goods_gst + bv.charges_gst, 0))"
	}
	return "b.total"
}

const bvJoin = `
			LEFT JOIN v_marg_ede_bill_values bv ON bv.voucher = b.voucher`

// lineAmount is a goods line's amount in the product rankings.
func lineAmount(exGST bool) string {
	if exGST {
		return "i.amount"
	}
	return "(i.amount + i.gst_amount)"
}

// windowCTEs is the period a ranking covers, as two CTEs: win (s, e — the
// first day of the first month and the first day after the last) and
// months (n, the months it spans, which the averages divide by).
//
// period 0 = the year so far (from the first bill on record); period N =
// the last N months. The current month is still running, so it is left out
// unless includeCurrent; with it, "last N months" counts it as one of the
// N. Bills only go back to the start of the financial year, so a window
// reaching further back is cut at the first month on record and divides by
// the months that actually exist.
func windowCTEs(period int, includeCurrent bool) string {
	if period < 0 || period > 12 {
		period = 0
	}
	e := "date_trunc('month', CURRENT_DATE)"
	back := period
	if includeCurrent {
		e = "date_trunc('month', CURRENT_DATE) + interval '1 month'"
		back = period - 1
	}
	st := "x.mm"
	if period > 0 {
		st = fmt.Sprintf("GREATEST(x.mm, date_trunc('month', CURRENT_DATE) - interval '%d months')", back)
	}
	return `win AS (
			SELECT ` + st + ` AS s, ` + e + ` AS e
			FROM (SELECT date_trunc('month', MIN(bill_date)) AS mm FROM marg_ede_bills WHERE NOT is_deleted) x
		),
		months AS (
			SELECT GREATEST(1, (EXTRACT(YEAR FROM age(e, s)) * 12 + EXTRACT(MONTH FROM age(e, s)))::int) AS n FROM win
		)`
}

// Window is the period a ranking covered, for the page to show.
type Window struct {
	From   time.Time `json:"from"`   // first day of the first month
	To     time.Time `json:"to"`     // first day after the last month
	Months int       `json:"months"` // what the averages divide by
}

// PartyRankRow is one party in the customers or suppliers ranking.
type PartyRankRow struct {
	PartyCode    string     `json:"party_code"`
	Name         *string    `json:"name"`
	City         *string    `json:"city"`
	Kind         *string    `json:"kind"`
	PartnerID    *string    `json:"partner_id"`
	Total        float64    `json:"total"`
	AvgMonthly   float64    `json:"avg_monthly"`
	BestMonth    *time.Time `json:"best_month"`
	BestAmount   float64    `json:"best_amount"`
	ActiveMonths int        `json:"active_months"`
	Bills        int        `json:"bills"`
	Returns      float64    `json:"returns"`
	LastBill     *time.Time `json:"last_bill"`
	Last3        float64    `json:"last3"` // last 3 months incl. this one
	Prev3        float64    `json:"prev3"` // the 3 months before those
}

// RankFilter is the ranking query.
type RankFilter struct {
	Mode   string // sales (customers) | purchases (suppliers, manufacturers)
	Search string
	Sort   string // avg | total | best | bills | last | trend | returns | name | months
	Dir    string // asc | desc
	Page   int
	// Period 0 = the year so far, N = the last N months (1-12);
	// IncludeCurrent counts the running month (see windowCTEs).
	Period         int
	IncludeCurrent bool
	// Company (products only): IB Moulins, ID third party, IC others.
	Company string
	ExGST   bool // amounts without GST (see billAmount)
}

// PartyRankList is the ranking response.
type PartyRankList struct {
	Rows     []PartyRankRow `json:"rows"`
	Total    int            `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
	Months   int            `json:"months"` // months the averages divide by
	Window   Window         `json:"window"`
	SumTotal float64        `json:"sum_total"`
}

var rankSorts = map[string]string{
	"avg": "avg_monthly", "total": "total", "best": "best_amount", "bills": "bills",
	"last": "last_bill", "returns": "returns", "name": "name", "months": "active_months",
	"trend": "(last3 - prev3)",
}

func sortDir(d string) string {
	if strings.EqualFold(d, "asc") {
		return "ASC"
	}
	return "DESC"
}

// RankParties ranks customers by sales, or suppliers/manufacturers by
// purchases.
func RankParties(ctx context.Context, db *pgxpool.Pool, f RankFilter) (PartyRankList, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	out := PartyRankList{Rows: []PartyRankRow{}, Page: f.Page, PageSize: BillsPageSize}

	amountCond, returnCond := saleCond, `b.bill_type = 'R'`
	if f.Mode == "purchases" {
		amountCond, returnCond = `b.bill_type = 'P'`, `b.bill_type = 'B'`
	}
	order, ok := rankSorts[f.Sort]
	if !ok {
		order = "avg_monthly"
	}
	dir := sortDir(f.Dir)
	if f.Sort == "name" && f.Dir == "" {
		dir = "ASC"
	}

	where := "WHERE TRUE"
	args := []any{}
	if s := strings.TrimSpace(f.Search); s != "" {
		args = append(args, "%"+s+"%")
		where += " AND (r.party_code ILIKE $1 OR r.name ILIKE $1 OR r.city ILIKE $1)"
	}

	q := `
		WITH ` + windowCTEs(f.Period, f.IncludeCurrent) + `,
		pm AS (
			SELECT b.party_code, date_trunc('month', b.bill_date) AS mon,
			       SUM(` + billAmount(f.ExGST) + `) FILTER (WHERE ` + amountCond + `) AS amt,
			       COUNT(*) FILTER (WHERE ` + amountCond + `) AS bills,
			       SUM(` + billAmount(f.ExGST) + `) FILTER (WHERE ` + returnCond + `) AS ret,
			       MAX(b.bill_date) FILTER (WHERE ` + amountCond + `) AS last_bill,
			       BOOL_OR(b.bill_date >= (SELECT s FROM win) AND b.bill_date < (SELECT e FROM win)) AS in_win
			FROM marg_ede_bills b` + bvJoin + `
			WHERE NOT b.is_deleted AND NOT b.is_cancelled AND b.party_code IS NOT NULL
			GROUP BY 1, 2
		),
		r AS (
			SELECT pm.party_code, lg.name, lg.city, lg.kind, pt.partner_id,
			       COALESCE(SUM(pm.amt) FILTER (WHERE pm.in_win), 0) AS total,
			       COALESCE(SUM(pm.amt) FILTER (WHERE pm.in_win), 0) / (SELECT n FROM months) AS avg_monthly,
			       (ARRAY_AGG(pm.mon ORDER BY pm.amt DESC NULLS LAST) FILTER (WHERE pm.in_win))[1] AS best_month,
			       COALESCE(MAX(pm.amt) FILTER (WHERE pm.in_win), 0) AS best_amount,
			       COUNT(*) FILTER (WHERE pm.amt > 0 AND pm.in_win)::int AS active_months,
			       COALESCE(SUM(pm.bills) FILTER (WHERE pm.in_win), 0)::int AS bills,
			       COALESCE(SUM(pm.ret) FILTER (WHERE pm.in_win), 0) AS returns,
			       MAX(pm.last_bill) AS last_bill,
			       COALESCE(SUM(pm.amt) FILTER (WHERE pm.mon >= date_trunc('month', CURRENT_DATE) - interval '2 months'), 0) AS last3,
			       COALESCE(SUM(pm.amt) FILTER (WHERE pm.mon >= date_trunc('month', CURRENT_DATE) - interval '5 months'
			                                     AND pm.mon < date_trunc('month', CURRENT_DATE) - interval '2 months'), 0) AS prev3
			FROM pm
			LEFT JOIN LATERAL (
				SELECT l.name, l.city, l.kind FROM marg_ede_ledger l
				WHERE l.party_code = pm.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
			) lg ON TRUE
			LEFT JOIN LATERAL (
				SELECT u.id::text AS partner_id FROM margmaster_party mp
				JOIN users u ON u.rid = mp.rid AND u.role = 'partner'
				WHERE TRIM(mp.code) = pm.party_code LIMIT 1
			) pt ON TRUE
			GROUP BY pm.party_code, lg.name, lg.city, lg.kind, pt.partner_id
			HAVING COALESCE(SUM(pm.amt) FILTER (WHERE pm.in_win), 0) > 0
		)`

	if err := db.QueryRow(ctx, q+` SELECT COUNT(*)::int, COALESCE(SUM(r.total), 0)::float8, (SELECT n FROM months)::int,
		(SELECT s FROM win), (SELECT e FROM win) FROM r `+where, args...).
		Scan(&out.Total, &out.SumTotal, &out.Months, &out.Window.From, &out.Window.To); err != nil {
		return out, err
	}
	out.Window.Months = out.Months
	rows, err := db.Query(ctx, q+fmt.Sprintf(`
		SELECT r.party_code, r.name, r.city, r.kind, r.partner_id, r.total::float8, r.avg_monthly::float8,
		       r.best_month, r.best_amount::float8, r.active_months, r.bills, r.returns::float8, r.last_bill,
		       r.last3::float8, r.prev3::float8
		FROM r %s
		ORDER BY %s %s NULLS LAST, r.total DESC
		LIMIT %d OFFSET %d`, where, order, dir, BillsPageSize, (f.Page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r PartyRankRow
		if err := rows.Scan(&r.PartyCode, &r.Name, &r.City, &r.Kind, &r.PartnerID, &r.Total, &r.AvgMonthly,
			&r.BestMonth, &r.BestAmount, &r.ActiveMonths, &r.Bills, &r.Returns, &r.LastBill,
			&r.Last3, &r.Prev3); err != nil {
			return out, err
		}
		out.Rows = append(out.Rows, r)
	}
	return out, rows.Err()
}

// ProductRankRow is one product in the products ranking (sale invoices).
type ProductRankRow struct {
	ProductPID int64      `json:"product_pid"`
	Code       *string    `json:"code"`
	Name       *string    `json:"name"`
	Company    *string    `json:"company"`
	Amount     float64    `json:"amount"` // before GST
	Qty        float64    `json:"qty"`
	Free       float64    `json:"free"`
	AvgMonthly float64    `json:"avg_monthly"`
	BestMonth  *time.Time `json:"best_month"`
	BestAmount float64    `json:"best_amount"`
	Customers  int        `json:"customers"`
	Bills      int        `json:"bills"`
	LastSold   *time.Time `json:"last_sold"`
	// The customer who bought the most of it in the period.
	TopBuyerCode   *string `json:"top_buyer_code"`
	TopBuyerName   *string `json:"top_buyer_name"`
	TopBuyerAmount float64 `json:"top_buyer_amount"`
}

// ProductRankList is the products ranking response.
type ProductRankList struct {
	Rows     []ProductRankRow `json:"rows"`
	Total    int              `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
	Months   int              `json:"months"`
	Window   Window           `json:"window"`
	// Products per company under the other filters: {"IB": 540, ...}.
	CompanyCounts map[string]int `json:"company_counts"`
}

var productSorts = map[string]string{
	"avg": "avg_monthly", "amount": "amount", "qty": "qty", "best": "best_amount",
	"customers": "customers", "bills": "bills", "last": "last_sold", "name": "name",
}

// RankProducts ranks products by what they sold on sale invoices.
func RankProducts(ctx context.Context, db *pgxpool.Pool, f RankFilter) (ProductRankList, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	out := ProductRankList{Rows: []ProductRankRow{}, Page: f.Page, PageSize: BillsPageSize, CompanyCounts: map[string]int{}}
	order, ok := productSorts[f.Sort]
	if !ok {
		order = "avg_monthly"
	}
	dir := sortDir(f.Dir)
	where := "WHERE TRUE"
	args := []any{}
	if s := strings.TrimSpace(f.Search); s != "" {
		args = append(args, "%"+s+"%")
		where += fmt.Sprintf(" AND (r.name ILIKE $%d OR r.code ILIKE $%d OR r.product_pid::text ILIKE $%d)", len(args), len(args), len(args))
	}
	// The per-company counts ignore the company filter itself.
	countWhere, countArgs := where, append([]any{}, args...)
	if f.Company != "" {
		args = append(args, f.Company)
		where += fmt.Sprintf(" AND r.company_code = $%d", len(args))
	}
	q := `
		WITH ` + windowCTEs(f.Period, f.IncludeCurrent) + `,
		lines AS (
			SELECT i.product_pid, b.party_code, b.voucher, b.bill_date, date_trunc('month', b.bill_date) AS mon,
			       ` + lineAmount(f.ExGST) + ` AS amount, i.qty, i.free, i.item_company_code
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE ` + saleCond + ` AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
			  AND b.bill_date >= (SELECT s FROM win) AND b.bill_date < (SELECT e FROM win)
		),
		pm AS (SELECT product_pid, mon, SUM(amount) AS amt FROM lines GROUP BY 1, 2),
		best AS (
			SELECT DISTINCT ON (product_pid) product_pid, mon AS best_month, amt AS best_amount
			FROM pm ORDER BY product_pid, amt DESC
		),
		tb AS (
			SELECT DISTINCT ON (product_pid) product_pid, party_code AS top_code, amt AS top_amount
			FROM (SELECT product_pid, party_code, SUM(amount) AS amt FROM lines GROUP BY 1, 2) x
			ORDER BY product_pid, amt DESC
		),
		r AS (
			SELECT l.product_pid, p.code, COALESCE(p.name, mp.name) AS name, p.company_name AS company,
			       COALESCE(p.company_code, MAX(l.item_company_code)) AS company_code,
			       SUM(l.amount) AS amount, SUM(l.qty) AS qty, SUM(l.free) AS free,
			       SUM(l.amount) / (SELECT n FROM months) AS avg_monthly,
			       MAX(bt.best_month) AS best_month, MAX(bt.best_amount) AS best_amount,
			       COUNT(DISTINCT l.party_code)::int AS customers, COUNT(DISTINCT l.voucher)::int AS bills,
			       MAX(l.bill_date) AS last_sold,
			       MAX(tb.top_code) AS top_code, MAX(tb.top_amount) AS top_amount
			FROM lines l
			LEFT JOIN best bt ON bt.product_pid = l.product_pid
			LEFT JOIN tb ON tb.product_pid = l.product_pid
			LEFT JOIN marg_ede_products p ON p.product_pid = l.product_pid
			LEFT JOIN margmaster_products mp ON mp.base_code = l.product_pid::text
			GROUP BY l.product_pid, p.code, p.name, mp.name, p.company_name, p.company_code
		)`
	crows, err := db.Query(ctx, q+` SELECT COALESCE(r.company_code, ''), COUNT(*)::int FROM r `+countWhere+` GROUP BY 1`, countArgs...)
	if err != nil {
		return out, err
	}
	for crows.Next() {
		var code string
		var n int
		if err := crows.Scan(&code, &n); err != nil {
			crows.Close()
			return out, err
		}
		out.CompanyCounts[code] = n
	}
	crows.Close()
	if err := crows.Err(); err != nil {
		return out, err
	}

	if err := db.QueryRow(ctx, q+` SELECT COUNT(*)::int, (SELECT n FROM months)::int, (SELECT s FROM win), (SELECT e FROM win)
		FROM r `+where, args...).
		Scan(&out.Total, &out.Months, &out.Window.From, &out.Window.To); err != nil {
		return out, err
	}
	out.Window.Months = out.Months
	rows, err := db.Query(ctx, q+fmt.Sprintf(`
		SELECT r.product_pid, r.code, r.name, r.company, r.amount::float8, r.qty::float8, r.free::float8,
		       r.avg_monthly::float8, r.best_month, r.best_amount::float8, r.customers, r.bills, r.last_sold,
		       r.top_code, tl.name, COALESCE(r.top_amount, 0)::float8
		FROM r
		LEFT JOIN LATERAL (
			SELECT ld.name FROM marg_ede_ledger ld
			WHERE ld.party_code = r.top_code AND NOT ld.is_deleted ORDER BY ld.marg_id LIMIT 1
		) tl ON TRUE
		%s
		ORDER BY %s %s NULLS LAST, r.amount DESC
		LIMIT %d OFFSET %d`, where, order, dir, BillsPageSize, (f.Page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r ProductRankRow
		if err := rows.Scan(&r.ProductPID, &r.Code, &r.Name, &r.Company, &r.Amount, &r.Qty, &r.Free,
			&r.AvgMonthly, &r.BestMonth, &r.BestAmount, &r.Customers, &r.Bills, &r.LastSold,
			&r.TopBuyerCode, &r.TopBuyerName, &r.TopBuyerAmount); err != nil {
			return out, err
		}
		out.Rows = append(out.Rows, r)
	}
	return out, rows.Err()
}

// OverviewMonth is one month, company-wide.
type OverviewMonth struct {
	Month           string  `json:"month"`
	Sales           float64 `json:"sales"`
	Returns         float64 `json:"returns"`
	Purchases       float64 `json:"purchases"`
	Bills           int     `json:"bills"` // sale invoices
	ActiveCustomers int     `json:"active_customers"`
	NewCustomers    int     `json:"new_customers"` // first sale invoice of the year
	AvgBill         float64 `json:"avg_bill"`
}

// MonthlyOverview is company-wide month-by-month totals.
func MonthlyOverview(ctx context.Context, db *pgxpool.Pool, exGST bool) ([]OverviewMonth, error) {
	rows, err := db.Query(ctx, `
		WITH months AS (
			SELECT to_char(m, 'YYYY-MM') AS month
			FROM generate_series(
				date_trunc('month', (SELECT MIN(bill_date) FROM marg_ede_bills WHERE NOT is_deleted)),
				date_trunc('month', CURRENT_DATE), interval '1 month') m
		),
		live AS (
			SELECT b.*, `+billAmount(exGST)+` AS goods
			FROM marg_ede_bills b`+bvJoin+`
			WHERE NOT b.is_deleted AND NOT b.is_cancelled
		),
		firsts AS (
			SELECT b.party_code, to_char(MIN(b.bill_date), 'YYYY-MM') AS month
			FROM live b WHERE `+saleCond+` GROUP BY 1
		)
		SELECT months.month,
		       COALESCE(SUM(b.goods) FILTER (WHERE `+saleCond+`), 0)::float8,
		       COALESCE(SUM(b.goods) FILTER (WHERE b.bill_type = 'R'), 0)::float8,
		       COALESCE(SUM(b.goods) FILTER (WHERE b.bill_type = 'P'), 0)::float8,
		       COUNT(*) FILTER (WHERE `+saleCond+`)::int,
		       COUNT(DISTINCT b.party_code) FILTER (WHERE `+saleCond+`)::int,
		       (SELECT COUNT(*) FROM firsts f WHERE f.month = months.month)::int
		FROM months
		LEFT JOIN live b ON to_char(b.bill_date, 'YYYY-MM') = months.month
		GROUP BY months.month ORDER BY months.month`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OverviewMonth{}
	for rows.Next() {
		var m OverviewMonth
		if err := rows.Scan(&m.Month, &m.Sales, &m.Returns, &m.Purchases, &m.Bills, &m.ActiveCustomers, &m.NewCustomers); err != nil {
			return nil, err
		}
		if m.Bills > 0 {
			m.AvgBill = m.Sales / float64(m.Bills)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// BestMonthRow is one party's single month.
type BestMonthRow struct {
	PartyCode string    `json:"party_code"`
	Name      *string   `json:"name"`
	City      *string   `json:"city"`
	PartnerID *string   `json:"partner_id"`
	Month     time.Time `json:"month"`
	Amount    float64   `json:"amount"`
	Bills     int       `json:"bills"`
	AvgOther  float64   `json:"avg_other"` // the party's average over its other active months
}

// BestMonths lists the biggest single customer-months of the year;
// onePerParty keeps only each customer's best month, so one big buyer
// doesn't fill the list.
func BestMonths(ctx context.Context, db *pgxpool.Pool, limit int, onePerParty, exGST bool) ([]BestMonthRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := db.Query(ctx, `
		WITH pm AS (
			SELECT b.party_code, date_trunc('month', b.bill_date) AS mon, SUM(`+billAmount(exGST)+`) AS amt, COUNT(*)::int AS bills
			FROM marg_ede_bills b`+bvJoin+`
			WHERE `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled AND b.party_code IS NOT NULL
			GROUP BY 1, 2
		),
		ranked AS (
			SELECT pm.*,
			       (SUM(amt) OVER (PARTITION BY party_code) - amt)
			         / NULLIF(COUNT(*) OVER (PARTITION BY party_code) - 1, 0) AS avg_other,
			       ROW_NUMBER() OVER (PARTITION BY party_code ORDER BY amt DESC) AS rn
			FROM pm
		)
		SELECT r.party_code, lg.name, lg.city, pt.partner_id, r.mon, r.amt::float8, r.bills, COALESCE(r.avg_other, 0)::float8
		FROM ranked r
		LEFT JOIN LATERAL (
			SELECT l.name, l.city FROM marg_ede_ledger l
			WHERE l.party_code = r.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
		) lg ON TRUE
		LEFT JOIN LATERAL (
			SELECT u.id::text AS partner_id FROM margmaster_party mp
			JOIN users u ON u.rid = mp.rid AND u.role = 'partner'
			WHERE TRIM(mp.code) = r.party_code LIMIT 1
		) pt ON TRUE
		WHERE NOT $2 OR r.rn = 1
		ORDER BY r.amt DESC
		LIMIT $1`, limit, onePerParty)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BestMonthRow{}
	for rows.Next() {
		var r BestMonthRow
		if err := rows.Scan(&r.PartyCode, &r.Name, &r.City, &r.PartnerID, &r.Month, &r.Amount, &r.Bills, &r.AvgOther); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SlippingRow is a customer who bought regularly and has gone quiet.
type SlippingRow struct {
	PartyCode    string    `json:"party_code"`
	Name         *string   `json:"name"`
	City         *string   `json:"city"`
	PartnerID    *string   `json:"partner_id"`
	LastBill     time.Time `json:"last_bill"`
	DaysSince    int       `json:"days_since"`
	Total        float64   `json:"total"`
	ActiveMonths int       `json:"active_months"`
	AvgActive    float64   `json:"avg_active"` // average over the months they did buy
	Bills        int       `json:"bills"`
}

// Slipping lists customers with sale invoices in at least 2 months whose
// last one is more than `days` days old, biggest buyers first.
func Slipping(ctx context.Context, db *pgxpool.Pool, days int, exGST bool) ([]SlippingRow, error) {
	if days <= 0 {
		days = 45
	}
	rows, err := db.Query(ctx, `
		WITH pm AS (
			SELECT b.party_code, date_trunc('month', b.bill_date) AS mon, SUM(`+billAmount(exGST)+`) AS amt,
			       COUNT(*)::int AS bills, MAX(b.bill_date) AS last_bill
			FROM marg_ede_bills b`+bvJoin+`
			WHERE `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled AND b.party_code IS NOT NULL
			GROUP BY 1, 2
		),
		p AS (
			SELECT party_code, MAX(last_bill) AS last_bill, SUM(amt) AS total, COUNT(*)::int AS active_months,
			       SUM(amt) / COUNT(*) AS avg_active, SUM(bills)::int AS bills
			FROM pm GROUP BY 1
		)
		SELECT p.party_code, lg.name, lg.city, pt.partner_id, p.last_bill, (CURRENT_DATE - p.last_bill)::int,
		       p.total::float8, p.active_months, p.avg_active::float8, p.bills
		FROM p
		LEFT JOIN LATERAL (
			SELECT l.name, l.city, l.kind FROM marg_ede_ledger l
			WHERE l.party_code = p.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
		) lg ON TRUE
		LEFT JOIN LATERAL (
			SELECT u.id::text AS partner_id FROM margmaster_party mp
			JOIN users u ON u.rid = mp.rid AND u.role = 'partner'
			WHERE TRIM(mp.code) = p.party_code LIMIT 1
		) pt ON TRUE
		WHERE p.active_months >= 2 AND p.last_bill < CURRENT_DATE - $1::int
		  AND COALESCE(lg.kind, 'customer') = 'customer'
		ORDER BY p.avg_active DESC`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SlippingRow{}
	for rows.Next() {
		var r SlippingRow
		if err := rows.Scan(&r.PartyCode, &r.Name, &r.City, &r.PartnerID, &r.LastBill, &r.DaysSince,
			&r.Total, &r.ActiveMonths, &r.AvgActive, &r.Bills); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
