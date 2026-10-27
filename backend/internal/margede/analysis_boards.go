package margede

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Reports for the Analysis boards beyond the rankings: sales by city, and
// products bought in that aren't selling. Same rules as analysis.go
// (cancelled and deleted bills left out, sale invoices only for sales).

// CityRow is one city's sales in the period. City is the customer's city
// in the Marg ledger, upper-cased so "Jaipur" and "JAIPUR" count once;
// customers with none are grouped under "".
type CityRow struct {
	City      string  `json:"city"`
	Customers int     `json:"customers"`
	Bills     int     `json:"bills"`
	Sales     float64 `json:"sales"`
	Returns   float64 `json:"returns"`
}

// CityList is the sales-by-city response.
type CityList struct {
	Rows   []CityRow `json:"rows"`
	Window Window    `json:"window"`
}

// SalesByCity splits the period's sales by the customer's city.
func SalesByCity(ctx context.Context, db *pgxpool.Pool, f RankFilter) (CityList, error) {
	out := CityList{Rows: []CityRow{}}
	amt := billAmount(f.ExGST)
	rows, err := db.Query(ctx, `
		WITH `+windowCTEs(f.Period, f.IncludeCurrent)+`,
		pb AS (
			SELECT b.party_code,
			       COALESCE(SUM(`+amt+`) FILTER (WHERE `+saleCond+`), 0) AS sales,
			       COUNT(*) FILTER (WHERE `+saleCond+`)::int AS bills,
			       COALESCE(SUM(`+amt+`) FILTER (WHERE b.bill_type = 'R'), 0) AS ret
			FROM marg_ede_bills b`+bvJoin+`
			WHERE NOT b.is_deleted AND NOT b.is_cancelled AND b.party_code IS NOT NULL
			  AND b.bill_date >= (SELECT s FROM win) AND b.bill_date < (SELECT e FROM win)
			GROUP BY 1
		)
		SELECT COALESCE(UPPER(NULLIF(TRIM(lg.city), '')), ''),
		       COUNT(*) FILTER (WHERE pb.sales > 0)::int, SUM(pb.bills)::int,
		       SUM(pb.sales)::float8, SUM(pb.ret)::float8,
		       (SELECT s FROM win), (SELECT e FROM win), (SELECT n FROM months)
		FROM pb
		LEFT JOIN LATERAL (
			SELECT l.city FROM marg_ede_ledger l
			WHERE l.party_code = pb.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
		) lg ON TRUE
		WHERE pb.sales > 0 OR pb.ret > 0
		GROUP BY 1
		ORDER BY 4 DESC`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r CityRow
		if err := rows.Scan(&r.City, &r.Customers, &r.Bills, &r.Sales, &r.Returns, &out.Window.From, &out.Window.To, &out.Window.Months); err != nil {
			return out, err
		}
		out.Rows = append(out.Rows, r)
	}
	return out, rows.Err()
}

// NotSellingRow is a product bought in this year, with what has sold of it
// since its first purchase. Units are qty + free on both sides.
type NotSellingRow struct {
	ProductPID     int64      `json:"product_pid"`
	Code           *string    `json:"code"`
	Name           *string    `json:"name"`
	Company        *string    `json:"company"`
	BoughtUnits    float64    `json:"bought_units"`
	BoughtAmount   float64    `json:"bought_amount"`
	FirstPurchase  time.Time  `json:"first_purchase"`
	LastPurchase   time.Time  `json:"last_purchase"`
	SoldUnits      float64    `json:"sold_units"`
	SoldAmount     float64    `json:"sold_amount"`
	LastSold       *time.Time `json:"last_sold"`
	SellThrough    float64    `json:"sell_through"` // sold / bought units, 0-1+
	DaysSinceFirst int        `json:"days_since_first"`
}

// NotSelling lists products purchased this year at least minDays ago,
// slowest sellers first (by share of the bought units sold since).
func NotSelling(ctx context.Context, db *pgxpool.Pool, minDays int, exGST bool) ([]NotSellingRow, error) {
	if minDays < 0 {
		minDays = 30
	}
	rows, err := db.Query(ctx, `
		WITH bought AS (
			SELECT i.product_pid, SUM(i.qty + i.free) AS units, SUM(`+lineAmount(exGST)+`) AS amount,
			       MIN(b.bill_date) AS first_p, MAX(b.bill_date) AS last_p
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE b.bill_type = 'P' AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
			GROUP BY 1
			HAVING MIN(b.bill_date) <= CURRENT_DATE - $1::int
		),
		sold AS (
			SELECT i.product_pid, SUM(i.qty + i.free) AS units, SUM(`+lineAmount(exGST)+`) AS amount, MAX(b.bill_date) AS last_s
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			JOIN bought bo ON bo.product_pid = i.product_pid AND b.bill_date >= bo.first_p
			WHERE `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
			GROUP BY 1
		)
		SELECT bo.product_pid, p.code, COALESCE(p.name, mp.name), p.company_name,
		       bo.units::float8, bo.amount::float8, bo.first_p, bo.last_p,
		       COALESCE(so.units, 0)::float8, COALESCE(so.amount, 0)::float8, so.last_s,
		       (COALESCE(so.units, 0) / NULLIF(bo.units, 0))::float8 AS st,
		       (CURRENT_DATE - bo.first_p)::int
		FROM bought bo
		LEFT JOIN sold so ON so.product_pid = bo.product_pid
		LEFT JOIN marg_ede_products p ON p.product_pid = bo.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = bo.product_pid::text
		WHERE bo.units > 0
		ORDER BY st ASC NULLS FIRST, bo.amount DESC`, minDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NotSellingRow{}
	for rows.Next() {
		var r NotSellingRow
		var st *float64
		if err := rows.Scan(&r.ProductPID, &r.Code, &r.Name, &r.Company, &r.BoughtUnits, &r.BoughtAmount, &r.FirstPurchase, &r.LastPurchase,
			&r.SoldUnits, &r.SoldAmount, &r.LastSold, &st, &r.DaysSinceFirst); err != nil {
			return nil, err
		}
		if st != nil {
			r.SellThrough = *st
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
