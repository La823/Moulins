package margede

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PartyProductRow is one product a party has bought this year, from its
// sale invoices (cancelled bills and unbilled challans left out). Amounts
// are goods before GST. Profit is the goods less (qty + free) at the sold
// batch's Marg purchase rate, as on the Analysis pages; credit notes
// (goods returned) are shown apart.
type PartyProductRow struct {
	ProductPID   int64      `json:"product_pid"`
	Code         *string    `json:"code"`
	Name         *string    `json:"name"`
	Company      *string    `json:"company"`
	CompanyCode  *string    `json:"company_code"`
	Qty          float64    `json:"qty"`
	Free         float64    `json:"free"`
	Amount       float64    `json:"amount"`
	Bills        int        `json:"bills"`
	Months       int        `json:"months"` // months it was bought in
	AvgRate      float64    `json:"avg_rate"`
	LastRate     *float64   `json:"last_rate"`
	FirstBought  time.Time  `json:"first_bought"`
	LastBought   time.Time  `json:"last_bought"`
	Profit       float64    `json:"profit"`
	ReturnedQty  float64    `json:"returned_qty"`
	ReturnedAmt  float64    `json:"returned_amount"`
	DaysSince    int        `json:"days_since"`
	LastBillNo   *string    `json:"last_bill_no"`
	LastBillDate *time.Time `json:"last_bill_date"`
}

// PartyProducts lists every product on a party's sale invoices this year,
// biggest first.
func PartyProducts(ctx context.Context, db *pgxpool.Pool, code string) ([]PartyProductRow, error) {
	rows, err := db.Query(ctx, `
		WITH sl AS (
			SELECT i.product_pid, i.qty, i.free, i.amount, i.rate, b.bill_date, b.bill_no, b.voucher, i.marg_line_id,
			       (i.qty + i.free) * st.prate AS cost
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			LEFT JOIN LATERAL (
				SELECT s.purchase_rate AS prate FROM marg_ede_stock s
				WHERE s.product_pid = i.product_pid AND COALESCE(s.batch, '') = COALESCE(i.batch, '') AND NOT s.is_deleted
				ORDER BY s.marg_id DESC LIMIT 1
			) st ON TRUE
			WHERE b.party_code = $1 AND `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
		),
		agg AS (
			SELECT product_pid, SUM(qty) AS qty, SUM(free) AS free, SUM(amount) AS amount,
			       COUNT(DISTINCT voucher)::int AS bills,
			       COUNT(DISTINCT date_trunc('month', bill_date))::int AS months,
			       SUM(amount) / NULLIF(SUM(qty), 0) AS avg_rate,
			       MIN(bill_date) AS first_b, MAX(bill_date) AS last_b,
			       SUM(amount) - COALESCE(SUM(cost), 0) AS profit
			FROM sl GROUP BY 1
		),
		lastline AS (
			SELECT DISTINCT ON (product_pid) product_pid, rate, bill_no, bill_date
			FROM sl ORDER BY product_pid, bill_date DESC, marg_line_id DESC
		),
		ret AS (
			SELECT i.product_pid, SUM(i.qty + i.free) AS qty, SUM(i.amount) AS amount
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			WHERE b.party_code = $1 AND b.bill_type = 'R' AND NOT b.is_deleted AND NOT b.is_cancelled
			  AND NOT i.is_deleted AND i.line_kind <> 'charge'
			GROUP BY 1
		)
		SELECT a.product_pid, p.code, COALESCE(p.name, mp.name), p.company_name, p.company_code,
		       a.qty::float8, a.free::float8, a.amount::float8, a.bills, a.months, COALESCE(a.avg_rate, 0)::float8,
		       ll.rate::float8, a.first_b, a.last_b, a.profit::float8,
		       COALESCE(r.qty, 0)::float8, COALESCE(r.amount, 0)::float8,
		       (CURRENT_DATE - a.last_b)::int, ll.bill_no, ll.bill_date
		FROM agg a
		LEFT JOIN lastline ll ON ll.product_pid = a.product_pid
		LEFT JOIN ret r ON r.product_pid = a.product_pid
		LEFT JOIN marg_ede_products p ON p.product_pid = a.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = a.product_pid::text
		ORDER BY a.amount DESC`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PartyProductRow{}
	for rows.Next() {
		var r PartyProductRow
		if err := rows.Scan(&r.ProductPID, &r.Code, &r.Name, &r.Company, &r.CompanyCode,
			&r.Qty, &r.Free, &r.Amount, &r.Bills, &r.Months, &r.AvgRate,
			&r.LastRate, &r.FirstBought, &r.LastBought, &r.Profit,
			&r.ReturnedQty, &r.ReturnedAmt, &r.DaysSince, &r.LastBillNo, &r.LastBillDate); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
