package margede

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Monthly sales and profit split by the product's company: Moulins (Marg
// company IB) against everyone else (third party ID and others IC), for
// the net sales charts' "Split by company" option. Counted from bill lines
// (goods only — freight is a charge line with no company, so it stays in
// the totals alone), the same way MonthlyOverview counts profit: line
// amount less qty + free at the batch's purchase rate, always before GST.

// CompanyMonth is one month for one side of the split.
type CompanyMonth struct {
	Month          string  `json:"month"` // YYYY-MM
	MoulinsSales   float64 `json:"moulins_sales"`
	MoulinsReturns float64 `json:"moulins_returns"`
	MoulinsProfit  float64 `json:"moulins_profit"`     // on sales
	MoulinsRetProf float64 `json:"moulins_ret_profit"` // on goods returned by credit notes
	OtherSales     float64 `json:"other_sales"`
	OtherReturns   float64 `json:"other_returns"`
	OtherProfit    float64 `json:"other_profit"`
	OtherRetProf   float64 `json:"other_ret_profit"`
}

// CompanyMonthly returns every month of the year with the split. Sales and
// returns follow the GST setting; profit is always before GST.
func CompanyMonthly(ctx context.Context, db *pgxpool.Pool, exGST bool) ([]CompanyMonth, error) {
	rows, err := db.Query(ctx, `
		WITH lines AS (
			SELECT to_char(b.bill_date, 'YYYY-MM') AS month,
			       COALESCE(i.item_company_code, '') = 'IB' AS moulins,
			       b.bill_type = 'R' AS ret,
			       `+lineAmount(exGST)+` AS amt,
			       i.amount - (i.qty + i.free) * COALESCE(st.prate, 0) AS profit
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			LEFT JOIN LATERAL (
				SELECT s.purchase_rate AS prate FROM marg_ede_stock s
				WHERE s.product_pid = i.product_pid AND COALESCE(s.batch, '') = COALESCE(i.batch, '') AND NOT s.is_deleted
				LIMIT 1
			) st ON TRUE
			WHERE NOT b.is_deleted AND NOT b.is_cancelled AND NOT i.is_deleted AND i.line_kind = 'item'
			  AND ((`+saleCond+`) OR b.bill_type = 'R')
		)
		SELECT month,
		       COALESCE(SUM(amt) FILTER (WHERE moulins AND NOT ret), 0)::float8,
		       COALESCE(SUM(amt) FILTER (WHERE moulins AND ret), 0)::float8,
		       COALESCE(SUM(profit) FILTER (WHERE moulins AND NOT ret), 0)::float8,
		       COALESCE(SUM(profit) FILTER (WHERE moulins AND ret), 0)::float8,
		       COALESCE(SUM(amt) FILTER (WHERE NOT moulins AND NOT ret), 0)::float8,
		       COALESCE(SUM(amt) FILTER (WHERE NOT moulins AND ret), 0)::float8,
		       COALESCE(SUM(profit) FILTER (WHERE NOT moulins AND NOT ret), 0)::float8,
		       COALESCE(SUM(profit) FILTER (WHERE NOT moulins AND ret), 0)::float8
		FROM lines GROUP BY 1 ORDER BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CompanyMonth{}
	for rows.Next() {
		var m CompanyMonth
		if err := rows.Scan(&m.Month, &m.MoulinsSales, &m.MoulinsReturns, &m.MoulinsProfit, &m.MoulinsRetProf,
			&m.OtherSales, &m.OtherReturns, &m.OtherProfit, &m.OtherRetProf); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
