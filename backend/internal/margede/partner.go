package margede

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A partner is linked to Marg by users.rid = margmaster_party.rid (set when
// the partner was created from a Marg party, or by hand on the partner
// page); that party's code is the code on marg_ede_bills.

// MonthPoint is one month of a party's bills (cancelled bills left out),
// as goods before GST (no GST, no freight or other charges).
type MonthPoint struct {
	Month     string  `json:"month"`     // "2026-04"
	Sales     float64 `json:"sales"`     // sale invoices
	Returns   float64 `json:"returns"`   // credit notes
	Purchases float64 `json:"purchases"` // purchase bills
	Bills     int     `json:"bills"`     // sale invoices + purchase bills
}

// monthlyFor is a party's month-by-month totals for this financial year:
// every month from the first bill on record to now, zero-filled.
func monthlyFor(ctx context.Context, db *pgxpool.Pool, code string) ([]MonthPoint, error) {
	rows, err := db.Query(ctx, `
		WITH months AS (
			SELECT to_char(m, 'YYYY-MM') AS month
			FROM generate_series(
				date_trunc('month', (SELECT MIN(bill_date) FROM marg_ede_bills WHERE NOT is_deleted)),
				date_trunc('month', CURRENT_DATE), interval '1 month') m
		)
		SELECT months.month,
		       COALESCE(SUM(bv.goods_amount) FILTER (WHERE b.bill_type = 'S' AND b.bill_mode IS DISTINCT FROM 'challan'), 0)::float8,
		       COALESCE(SUM(bv.goods_amount) FILTER (WHERE b.bill_type = 'R'), 0)::float8,
		       COALESCE(SUM(bv.goods_amount) FILTER (WHERE b.bill_type = 'P'), 0)::float8,
		       COUNT(b.voucher) FILTER (WHERE (b.bill_type = 'S' AND b.bill_mode IS DISTINCT FROM 'challan') OR b.bill_type = 'P')::int
		FROM months
		LEFT JOIN (marg_ede_bills b LEFT JOIN v_marg_ede_bill_values bv ON bv.voucher = b.voucher)
		       ON to_char(b.bill_date, 'YYYY-MM') = months.month
		      AND b.party_code = $1 AND NOT b.is_deleted AND NOT b.is_cancelled
		GROUP BY months.month ORDER BY months.month`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MonthPoint{}
	for rows.Next() {
		var p MonthPoint
		if err := rows.Scan(&p.Month, &p.Sales, &p.Returns, &p.Purchases, &p.Bills); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// TimelineEvent is one dated thing that happened with a partner.
type TimelineEvent struct {
	At           time.Time `json:"at"`   // bill date (no time from Marg) or order time
	Kind         string    `json:"kind"` // bill | order | joined
	BillType     string    `json:"bill_type,omitempty"`
	BillTypeName *string   `json:"bill_type_name,omitempty"`
	Voucher      int64     `json:"voucher,omitempty"`
	BillNo       string    `json:"bill_no,omitempty"`
	Total        float64   `json:"total,omitempty"`
	Lines        int       `json:"lines,omitempty"`
	Cancelled    bool      `json:"cancelled,omitempty"`
	OrderID      string    `json:"order_id,omitempty"`
	OrderStatus  string    `json:"order_status,omitempty"`
	MargOrderNo  *string   `json:"marg_order_no,omitempty"`
}

// PartnerBills is the partner page's Marg section.
type PartnerBills struct {
	Linked      bool             `json:"linked"`
	Rid         *string          `json:"rid"`
	PartyCode   *string          `json:"party_code"`
	PartyName   *string          `json:"party_name"`
	Totals      []PartyTypeTotal `json:"totals"`
	Cancelled   int              `json:"cancelled"`
	TopProducts []PartyProduct   `json:"top_products"`
	Monthly     []MonthPoint     `json:"monthly"`
	Timeline    []TimelineEvent  `json:"timeline"`
}

// GetPartnerBills returns a partner's Marg bills summary, monthly series
// (this financial year, every month up to now, zero-filled) and a timeline
// of their bills, app orders and when they joined, newest first.
func GetPartnerBills(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID) (PartnerBills, error) {
	out := PartnerBills{Totals: []PartyTypeTotal{}, TopProducts: []PartyProduct{}, Monthly: []MonthPoint{}, Timeline: []TimelineEvent{}}

	var joined time.Time
	err := db.QueryRow(ctx, `
		SELECT NULLIF(u.rid, ''), TRIM(mp.code), mp.name, u.created_at
		FROM users u
		LEFT JOIN margmaster_party mp ON mp.rid = NULLIF(u.rid, '')
		WHERE u.id = $1`, partnerID).Scan(&out.Rid, &out.PartyCode, &out.PartyName, &joined)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrPartyNotFound
	}
	if err != nil {
		return out, err
	}
	out.Linked = out.PartyCode != nil && *out.PartyCode != ""

	// App orders and the join date are part of the timeline whether or not
	// the partner is linked to Marg.
	orows, err := db.Query(ctx, `
		SELECT id::text, status, created_at, marg_order_no
		FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, partnerID)
	if err != nil {
		return out, err
	}
	for orows.Next() {
		e := TimelineEvent{Kind: "order"}
		if err := orows.Scan(&e.OrderID, &e.OrderStatus, &e.At, &e.MargOrderNo); err != nil {
			orows.Close()
			return out, err
		}
		out.Timeline = append(out.Timeline, e)
	}
	orows.Close()
	if err := orows.Err(); err != nil {
		return out, err
	}
	out.Timeline = append(out.Timeline, TimelineEvent{Kind: "joined", At: joined})

	if out.Linked {
		code := *out.PartyCode
		d, err := GetParty(ctx, db, code)
		if err != nil && !errors.Is(err, ErrPartyNotFound) {
			return out, err
		}
		out.Totals, out.Cancelled = d.Totals, d.Cancelled
		if d.TopProducts != nil {
			out.TopProducts = d.TopProducts
		}
		if d.Account != nil {
			out.PartyName = &d.Account.Name
		}

		if out.Monthly, err = monthlyFor(ctx, db, code); err != nil {
			return out, err
		}

		brows, err := db.Query(ctx, `
			SELECT b.bill_date, `+kindExpr+`, `+kindNameExpr+`, b.voucher, b.bill_no, b.total::float8,
			       b.lines_count, b.is_cancelled
			FROM marg_ede_bills b
			WHERE b.party_code = $1 AND NOT b.is_deleted`, code)
		if err != nil {
			return out, err
		}
		for brows.Next() {
			e := TimelineEvent{Kind: "bill"}
			if err := brows.Scan(&e.At, &e.BillType, &e.BillTypeName, &e.Voucher, &e.BillNo, &e.Total,
				&e.Lines, &e.Cancelled); err != nil {
				brows.Close()
				return out, err
			}
			out.Timeline = append(out.Timeline, e)
		}
		brows.Close()
		if err := brows.Err(); err != nil {
			return out, err
		}
	}

	sortTimeline(out.Timeline)
	return out, nil
}

// sortTimeline orders events newest first, by IST calendar day. Bills
// carry only a date, so within a day they come after that day's timed
// events (orders), latest bill number first.
func sortTimeline(ev []TimelineEvent) {
	day := func(t time.Time) string {
		if t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 && t.Location() == time.UTC {
			return t.Format("2006-01-02") // a DATE from Postgres: already a calendar day
		}
		return t.In(istZone).Format("2006-01-02")
	}
	sort.SliceStable(ev, func(i, j int) bool {
		a, b := ev[i], ev[j]
		if da, db := day(a.At), day(b.At); da != db {
			return da > db
		}
		if (a.Kind == "bill") != (b.Kind == "bill") {
			return a.Kind != "bill"
		}
		if a.Kind == "bill" {
			return a.BillNo > b.BillNo
		}
		return a.At.After(b.At)
	})
}
