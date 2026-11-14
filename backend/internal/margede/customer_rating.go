package margede

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Customer ratings: each customer scored 0-100 from two h-indices over this
// financial year's sale bills (decided with the owner, 14 Nov 2026):
//
//   - loyalty h: the largest h where the customer bought h different products
//     each on at least h separate bills (breadth and repeat buying);
//   - value h: the largest h where they bought h different products each for
//     at least h x Rs 1,000 before GST (breadth in real money).
//
// Each is scaled to the best customer's (best = 100) and the rating is
// ratingLoyaltyWeight x loyalty + ratingValueWeight x value. A third h-index
// on months was left out: it moved with loyalty almost exactly (0.97).
//
// Profit is counted the way the Analysis pages count it (MonthlyOverview,
// CompanyMonthly): goods lines before GST less (qty + free) at the sold
// batch's Marg purchase rate; goods returned on credit notes come back off,
// credit notes without lines (rate differences) come off whole, and freight
// charged on the customer's invoices counts as profit. Moulins products are
// Marg company IB; everything else is third party.

const (
	ratingLoyaltyWeight = 50.0
	ratingValueWeight   = 50.0
	ratingValueStep     = 1000.0 // rupees per step of the value h-index
)

// CustomerRating is one customer's score and money for the year.
type CustomerRating struct {
	PartyCode string  `json:"party_code"`
	Name      string  `json:"name"`
	City      string  `json:"city,omitempty"`
	Rating    float64 `json:"rating"` // 0-100
	HLoyalty  int     `json:"h_loyalty"`
	HValue    int     `json:"h_value"`
	Products  int     `json:"products"` // different products bought
	Bills     int     `json:"bills"`
	LastBill  *string `json:"last_bill,omitempty"` // YYYY-MM-DD

	Sales        float64 `json:"sales"`   // goods on sale invoices, before GST
	Returns      float64 `json:"returns"` // goods back on credit notes, before GST
	MoulinsSales float64 `json:"moulins_sales"`
	OtherSales   float64 `json:"other_sales"`   // third-party products
	MoulinsShare float64 `json:"moulins_share"` // % of sales that are Moulins products

	MoulinsProfit float64 `json:"moulins_profit"` // after goods returned
	OtherProfit   float64 `json:"other_profit"`
	Freight       float64 `json:"freight"`        // freight charged, net of freight credited back
	OtherCredit   float64 `json:"other_credit"`   // credit notes without lines
	Profit        float64 `json:"profit"`         // moulins + other + freight - other credit
	Margin        float64 `json:"margin"`         // profit as % of net sales
	UncostedLines int     `json:"uncosted_lines"` // sale lines whose batch has no purchase rate (counted at no cost)
}

// CustomerRatings is the whole list with what it was worked out from.
type CustomerRatings struct {
	From          string           `json:"from"` // first day counted
	LoyaltyWeight float64          `json:"loyalty_weight"`
	ValueWeight   float64          `json:"value_weight"`
	ValueStep     float64          `json:"value_step"`
	BestLoyalty   int              `json:"best_loyalty"`
	BestValue     int              `json:"best_value"`
	Customers     []CustomerRating `json:"customers"`
}

// fyStart is 1 April of the current Indian financial year.
func fyStart(now time.Time) time.Time {
	y := now.Year()
	if now.Month() < time.April {
		y--
	}
	return time.Date(y, time.April, 1, 0, 0, 0, 0, time.UTC)
}

// GetCustomerRatings works out every customer with a sale this financial
// year, best rated first.
func GetCustomerRatings(ctx context.Context, db *pgxpool.Pool) (*CustomerRatings, error) {
	from := fyStart(time.Now().In(time.FixedZone("IST", 5*3600+1800)))
	rows, err := db.Query(ctx, `
		WITH lines AS (
			SELECT b.party_code, i.product_pid, i.voucher, b.bill_date, b.bill_type = 'R' AS ret,
			       i.amount,
			       i.amount - (i.qty + i.free) * COALESCE(st.prate, 0) AS profit,
			       COALESCE(st.prate, 0) = 0 AS uncosted,
			       COALESCE(i.item_company_code, '') = 'IB' AS moulins
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			LEFT JOIN LATERAL (
				SELECT s.purchase_rate AS prate FROM marg_ede_stock s
				WHERE s.product_pid = i.product_pid AND COALESCE(s.batch, '') = COALESCE(i.batch, '') AND NOT s.is_deleted
				ORDER BY s.marg_id DESC LIMIT 1
			) st ON TRUE
			WHERE NOT b.is_deleted AND NOT b.is_cancelled AND NOT i.is_deleted AND i.line_kind = 'item'
			  AND ((`+saleCond+`) OR b.bill_type = 'R') AND b.bill_date >= $1
		),
		pp AS (
			SELECT party_code, product_pid, COUNT(DISTINCT voucher) AS bills, SUM(amount) AS value
			FROM lines WHERE NOT ret GROUP BY 1, 2
		),
		ranked AS (
			SELECT party_code, bills, value,
			       row_number() OVER (PARTITION BY party_code ORDER BY bills DESC) AS rb,
			       row_number() OVER (PARTITION BY party_code ORDER BY value DESC) AS rv
			FROM pp
		),
		h AS (
			SELECT party_code,
			       COALESCE(MAX(rb) FILTER (WHERE bills >= rb), 0)::int AS h_loyalty,
			       COALESCE(MAX(rv) FILTER (WHERE value >= rv * $2), 0)::int AS h_value,
			       COUNT(*)::int AS products
			FROM ranked GROUP BY 1
		),
		money AS (
			SELECT party_code,
			       COUNT(DISTINCT voucher) FILTER (WHERE NOT ret)::int AS bills,
			       MAX(bill_date) FILTER (WHERE NOT ret) AS last_bill,
			       COALESCE(SUM(amount) FILTER (WHERE NOT ret), 0)::float8 AS sales,
			       COALESCE(SUM(amount) FILTER (WHERE ret), 0)::float8 AS returns,
			       COALESCE(SUM(amount) FILTER (WHERE moulins AND NOT ret), 0)::float8 AS m_sales,
			       COALESCE(SUM(amount) FILTER (WHERE NOT moulins AND NOT ret), 0)::float8 AS o_sales,
			       COALESCE(SUM(CASE WHEN ret THEN -profit ELSE profit END) FILTER (WHERE moulins), 0)::float8 AS m_profit,
			       COALESCE(SUM(CASE WHEN ret THEN -profit ELSE profit END) FILTER (WHERE NOT moulins), 0)::float8 AS o_profit,
			       COUNT(*) FILTER (WHERE uncosted AND NOT ret)::int AS uncosted
			FROM lines GROUP BY 1
		),
		credit AS (
			SELECT b.party_code, SUM(`+billAmount(true)+`)::float8 AS other_credit
			FROM marg_ede_bills b`+bvJoin+`
			WHERE b.bill_type = 'R' AND b.lines_count = 0 AND NOT b.is_deleted AND NOT b.is_cancelled AND b.bill_date >= $1
			GROUP BY 1
		),
		freight AS (
			SELECT b.party_code,
			       SUM(CASE WHEN b.bill_type = 'R' THEN -i.amount ELSE i.amount END)::float8 AS freight
			FROM marg_ede_bill_items i
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			JOIN marg_ede_products p ON p.product_pid = i.product_pid
			WHERE i.line_kind = 'charge' AND p.name ILIKE 'FREIGHT%' AND NOT i.is_deleted
			  AND NOT b.is_deleted AND NOT b.is_cancelled AND ((`+saleCond+`) OR b.bill_type = 'R') AND b.bill_date >= $1
			GROUP BY 1
		)
		SELECT h.party_code, COALESCE(l.name, h.party_code), COALESCE(l.city, ''),
		       h.h_loyalty, h.h_value, h.products, m.bills, to_char(m.last_bill, 'YYYY-MM-DD'),
		       m.sales, m.returns, m.m_sales, m.o_sales, m.m_profit, m.o_profit,
		       COALESCE(f.freight, 0), COALESCE(c.other_credit, 0), m.uncosted
		FROM h
		JOIN money m ON m.party_code = h.party_code
		LEFT JOIN credit c ON c.party_code = h.party_code
		LEFT JOIN freight f ON f.party_code = h.party_code
		LEFT JOIN LATERAL (
			SELECT name, city FROM marg_ede_ledger WHERE party_code = h.party_code AND NOT is_deleted
			ORDER BY marg_id DESC LIMIT 1
		) l ON TRUE`, from, ratingValueStep)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := &CustomerRatings{
		From: from.Format("2006-01-02"), LoyaltyWeight: ratingLoyaltyWeight, ValueWeight: ratingValueWeight,
		ValueStep: ratingValueStep, Customers: []CustomerRating{},
	}
	for rows.Next() {
		var c CustomerRating
		if err := rows.Scan(&c.PartyCode, &c.Name, &c.City, &c.HLoyalty, &c.HValue, &c.Products, &c.Bills, &c.LastBill,
			&c.Sales, &c.Returns, &c.MoulinsSales, &c.OtherSales, &c.MoulinsProfit, &c.OtherProfit,
			&c.Freight, &c.OtherCredit, &c.UncostedLines); err != nil {
			return nil, err
		}
		c.Profit = c.MoulinsProfit + c.OtherProfit + c.Freight - c.OtherCredit
		if c.Sales > 0 {
			c.MoulinsShare = round1(100 * c.MoulinsSales / c.Sales)
		}
		if net := c.Sales - c.Returns - c.OtherCredit; net > 0 {
			c.Margin = round1(100 * c.Profit / net)
		}
		out.BestLoyalty = max(out.BestLoyalty, c.HLoyalty)
		out.BestValue = max(out.BestValue, c.HValue)
		out.Customers = append(out.Customers, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out.Customers {
		c := &out.Customers[i]
		var l, v float64
		if out.BestLoyalty > 0 {
			l = float64(c.HLoyalty) / float64(out.BestLoyalty)
		}
		if out.BestValue > 0 {
			v = float64(c.HValue) / float64(out.BestValue)
		}
		c.Rating = round1(ratingLoyaltyWeight*l + ratingValueWeight*v)
	}
	sortRatings(out.Customers)
	return out, nil
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }

// sortRatings: best rating first; ties by profit, then sales.
func sortRatings(cs []CustomerRating) {
	sort.SliceStable(cs, func(i, j int) bool {
		a, b := cs[i], cs[j]
		if a.Rating != b.Rating {
			return a.Rating > b.Rating
		}
		if a.Profit != b.Profit {
			return a.Profit > b.Profit
		}
		return a.Sales > b.Sales
	})
}
