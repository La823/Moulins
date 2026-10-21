package margede

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// One product's sales for the Analysis product page: who buys it, how much,
// month by month. Sales are lines on sale invoices (amount before GST),
// cancelled bills left out; the totals and buyers cover the chosen period
// (see windowCTEs), the monthly series always covers the whole year.

// ProductBuyer is one customer of a product.
type ProductBuyer struct {
	PartyCode string     `json:"party_code"`
	Name      *string    `json:"name"`
	City      *string    `json:"city"`
	PartnerID *string    `json:"partner_id"`
	Amount    float64    `json:"amount"`
	Qty       float64    `json:"qty"`
	Free      float64    `json:"free"`
	Bills     int        `json:"bills"`
	Share     float64    `json:"share"` // of the product's sales in the period, 0-1
	AvgRate   float64    `json:"avg_rate"`
	LastBuy   *time.Time `json:"last_buy"`
	FirstBuy  *time.Time `json:"first_buy"`
}

// ProductMonth is one month of a product, in the shape MonthlyChart reads
// (sales / returns / purchases), plus quantity.
type ProductMonth struct {
	Month     string  `json:"month"`
	Sales     float64 `json:"sales"`     // sold, before GST
	Returns   float64 `json:"returns"`   // on credit notes
	Purchases float64 `json:"purchases"` // bought in, before GST
	Qty       float64 `json:"qty"`       // sold
	Bills     int     `json:"bills"`     // sale invoices with this product
	Customers int     `json:"customers"`
}

// ProductAnalysis is the product page.
type ProductAnalysis struct {
	ProductPID   int64          `json:"product_pid"`
	Code         *string        `json:"code"`
	Name         *string        `json:"name"`
	Company      *string        `json:"company"`
	Form         *string        `json:"form"`
	HSN          *string        `json:"hsn"`
	GSTPercent   *float64       `json:"gst_percent"`
	Window       Window         `json:"window"`
	Amount       float64        `json:"amount"`
	Qty          float64        `json:"qty"`
	Free         float64        `json:"free"`
	Bills        int            `json:"bills"`
	Customers    int            `json:"customers"`
	AvgMonthly   float64        `json:"avg_monthly"`
	AvgRate      float64        `json:"avg_rate"`
	MinRate      *float64       `json:"min_rate"`
	MaxRate      *float64       `json:"max_rate"`
	BestMonth    *string        `json:"best_month"`
	BestAmount   float64        `json:"best_amount"`
	Stock        float64        `json:"stock"`
	StockBatches int            `json:"stock_batches"`
	NextExpiry   *time.Time     `json:"next_expiry"`
	Monthly      []ProductMonth `json:"monthly"`
	Buyers       []ProductBuyer `json:"buyers"`
}

// ErrProductNotFound: no such product and no lines for it.
var ErrProductNotFound = errors.New("product not found")

// AnalyzeProduct builds the product page.
func AnalyzeProduct(ctx context.Context, db *pgxpool.Pool, pid int64, period int, includeCurrent bool) (ProductAnalysis, error) {
	a := ProductAnalysis{ProductPID: pid, Monthly: []ProductMonth{}, Buyers: []ProductBuyer{}}

	err := db.QueryRow(ctx, `
		SELECT p.code, COALESCE(p.name, mp.name), p.company_name, p.form_name, p.hsn_code, p.gst_percent::float8
		FROM (SELECT $1::bigint AS pid) x
		LEFT JOIN marg_ede_products p ON p.product_pid = x.pid
		LEFT JOIN margmaster_products mp ON mp.base_code = x.pid::text`, pid).
		Scan(&a.Code, &a.Name, &a.Company, &a.Form, &a.HSN, &a.GSTPercent)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return a, err
	}

	// Sale lines of this product inside the window.
	win := `WITH ` + windowCTEs(period, includeCurrent) + `,
		lines AS (
			SELECT b.party_code, b.voucher, b.bill_date, date_trunc('month', b.bill_date) AS mon,
			       i.amount, i.qty, i.free, i.rate
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE i.product_pid = $1 AND ` + saleCond + ` AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted
			  AND b.bill_date >= (SELECT s FROM win) AND b.bill_date < (SELECT e FROM win)
		)`

	err = db.QueryRow(ctx, win+`,
		pm AS (SELECT to_char(mon, 'YYYY-MM') AS month, SUM(amount) AS amt FROM lines GROUP BY 1)
		SELECT (SELECT s FROM win), (SELECT e FROM win), (SELECT n FROM months),
		       COALESCE(SUM(amount), 0)::float8, COALESCE(SUM(qty), 0)::float8, COALESCE(SUM(free), 0)::float8,
		       COUNT(DISTINCT voucher)::int, COUNT(DISTINCT party_code)::int,
		       COALESCE(SUM(amount), 0)::float8 / (SELECT n FROM months),
		       CASE WHEN SUM(qty) > 0 THEN (SUM(amount) / SUM(qty))::float8 ELSE 0 END,
		       MIN(rate) FILTER (WHERE rate > 0)::float8, MAX(rate)::float8,
		       (SELECT month FROM pm ORDER BY amt DESC LIMIT 1),
		       COALESCE((SELECT MAX(amt) FROM pm), 0)::float8
		FROM lines`, pid).
		Scan(&a.Window.From, &a.Window.To, &a.Window.Months, &a.Amount, &a.Qty, &a.Free, &a.Bills, &a.Customers,
			&a.AvgMonthly, &a.AvgRate, &a.MinRate, &a.MaxRate, &a.BestMonth, &a.BestAmount)
	if err != nil {
		return a, err
	}

	if err := db.QueryRow(ctx, `
		SELECT COALESCE(SUM(stock), 0)::float8, COUNT(*) FILTER (WHERE stock > 0)::int,
		       MIN(expiry) FILTER (WHERE stock > 0 AND expiry >= CURRENT_DATE)
		FROM marg_ede_stock WHERE product_pid = $1 AND NOT is_deleted`, pid).
		Scan(&a.Stock, &a.StockBatches, &a.NextExpiry); err != nil {
		return a, err
	}

	// The whole year month by month, whatever the period.
	mrows, err := db.Query(ctx, `
		WITH months AS (
			SELECT to_char(m, 'YYYY-MM') AS month
			FROM generate_series(
				date_trunc('month', (SELECT MIN(bill_date) FROM marg_ede_bills WHERE NOT is_deleted)),
				date_trunc('month', CURRENT_DATE), interval '1 month') m
		),
		l AS (
			SELECT to_char(b.bill_date, 'YYYY-MM') AS month, b.bill_type, b.bill_mode, b.voucher, b.party_code,
			       i.amount, i.qty
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE i.product_pid = $1 AND NOT b.is_deleted AND NOT b.is_cancelled AND NOT i.is_deleted
		)
		SELECT months.month,
		       COALESCE(SUM(l.amount) FILTER (WHERE l.bill_type = 'S' AND l.bill_mode IS DISTINCT FROM 'challan'), 0)::float8,
		       COALESCE(SUM(l.amount) FILTER (WHERE l.bill_type = 'R'), 0)::float8,
		       COALESCE(SUM(l.amount) FILTER (WHERE l.bill_type = 'P'), 0)::float8,
		       COALESCE(SUM(l.qty) FILTER (WHERE l.bill_type = 'S' AND l.bill_mode IS DISTINCT FROM 'challan'), 0)::float8,
		       COUNT(DISTINCT l.voucher) FILTER (WHERE l.bill_type = 'S' AND l.bill_mode IS DISTINCT FROM 'challan')::int,
		       COUNT(DISTINCT l.party_code) FILTER (WHERE l.bill_type = 'S' AND l.bill_mode IS DISTINCT FROM 'challan')::int
		FROM months LEFT JOIN l ON l.month = months.month
		GROUP BY months.month ORDER BY months.month`, pid)
	if err != nil {
		return a, err
	}
	for mrows.Next() {
		var m ProductMonth
		if err := mrows.Scan(&m.Month, &m.Sales, &m.Returns, &m.Purchases, &m.Qty, &m.Bills, &m.Customers); err != nil {
			mrows.Close()
			return a, err
		}
		a.Monthly = append(a.Monthly, m)
	}
	mrows.Close()
	if err := mrows.Err(); err != nil {
		return a, err
	}

	brows, err := db.Query(ctx, win+`
		SELECT l.party_code, lg.name, lg.city, pt.partner_id,
		       SUM(l.amount)::float8, SUM(l.qty)::float8, SUM(l.free)::float8, COUNT(DISTINCT l.voucher)::int,
		       CASE WHEN SUM(l.qty) > 0 THEN (SUM(l.amount) / SUM(l.qty))::float8 ELSE 0 END,
		       MAX(l.bill_date), MIN(l.bill_date)
		FROM lines l
		LEFT JOIN LATERAL (
			SELECT ld.name, ld.city FROM marg_ede_ledger ld
			WHERE ld.party_code = l.party_code AND NOT ld.is_deleted ORDER BY ld.marg_id LIMIT 1
		) lg ON TRUE
		LEFT JOIN LATERAL (
			SELECT u.id::text AS partner_id FROM margmaster_party mp
			JOIN users u ON u.rid = mp.rid AND u.role = 'partner'
			WHERE TRIM(mp.code) = l.party_code LIMIT 1
		) pt ON TRUE
		GROUP BY l.party_code, lg.name, lg.city, pt.partner_id
		ORDER BY SUM(l.amount) DESC`, pid)
	if err != nil {
		return a, err
	}
	defer brows.Close()
	for brows.Next() {
		var b ProductBuyer
		if err := brows.Scan(&b.PartyCode, &b.Name, &b.City, &b.PartnerID, &b.Amount, &b.Qty, &b.Free, &b.Bills,
			&b.AvgRate, &b.LastBuy, &b.FirstBuy); err != nil {
			return a, err
		}
		if a.Amount > 0 {
			b.Share = b.Amount / a.Amount
		}
		a.Buyers = append(a.Buyers, b)
	}
	if err := brows.Err(); err != nil {
		return a, err
	}

	if a.Name == nil && a.Amount == 0 && len(a.Buyers) == 0 {
		hasAny := false
		for _, m := range a.Monthly {
			if m.Sales != 0 || m.Purchases != 0 || m.Returns != 0 {
				hasAny = true
				break
			}
		}
		if !hasAny {
			return a, ErrProductNotFound
		}
	}
	return a, nil
}
