package margede

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A partner's own invoices, for the partner panel. Only final sale invoices
// to the partner's Marg party (users.rid → margmaster_party.code) — no
// challans, no cancelled bills — with the bill total including GST as
// printed. Deliberately its own narrow shapes rather than the admin
// BillDetail: a partner must not see internal fields (the ledger name and
// group, sync times, AddField, order refs, purchase data).

// ErrNotLinked is returned when the partner has no Marg party.
var ErrNotLinked = errors.New("partner not linked to Marg")

// MyBill is one invoice in the partner's list.
type MyBill struct {
	Voucher int64     `json:"voucher"`
	BillNo  string    `json:"bill_no"`
	Date    time.Time `json:"date"`
	Items   int       `json:"items"`
	Amount  float64   `json:"amount"` // before GST
	GST     float64   `json:"gst"`
	Total   float64   `json:"total"` // the bill total, GST included
}

// MyBills is the partner's invoice list for the financial year Marg sends.
type MyBills struct {
	Linked bool     `json:"linked"`
	Bills  []MyBill `json:"bills"`
	Count  int      `json:"count"`
	Total  float64  `json:"total"`
}

// MyBillLine is one line of an invoice as the partner sees it.
type MyBillLine struct {
	Kind       string     `json:"kind"` // item | charge
	Product    *string    `json:"product"`
	Batch      *string    `json:"batch"`
	Expiry     *time.Time `json:"expiry"`
	Qty        float64    `json:"qty"`
	Free       float64    `json:"free"`
	MRP        *float64   `json:"mrp"`
	Rate       *float64   `json:"rate"`
	Discount   float64    `json:"discount"`
	Amount     float64    `json:"amount"`
	GSTPercent *float64   `json:"gst_percent"`
	GSTAmount  float64    `json:"gst_amount"`
	LineTotal  float64    `json:"line_total"`
}

// MyBillDetail is one invoice with its lines.
type MyBillDetail struct {
	MyBill
	Lines []MyBillLine `json:"lines"`
}

// invoiceWhere picks the partner's final invoices: sale bills that aren't
// challans, cancelled, or gone from Marg.
const invoiceWhere = `b.party_code = $1 AND b.bill_type = 'S' AND COALESCE(b.bill_mode, '') <> 'challan'
	AND NOT b.is_deleted AND NOT b.is_cancelled`

// PartyCodeOfUser is a partner's Marg party code (users.rid -> margmaster_party).
func PartyCodeOfUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (string, error) {
	var code *string
	err := db.QueryRow(ctx, `
		SELECT TRIM(mp.code) FROM users u
		JOIN margmaster_party mp ON mp.rid = NULLIF(u.rid, '')
		WHERE u.id = $1`, userID).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (code == nil || *code == "")) {
		return "", ErrNotLinked
	}
	if err != nil {
		return "", err
	}
	return *code, nil
}

// ListMyBills returns every invoice of the partner, newest first.
func ListMyBills(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (MyBills, error) {
	out := MyBills{Bills: []MyBill{}}
	code, err := PartyCodeOfUser(ctx, db, userID)
	if errors.Is(err, ErrNotLinked) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	out.Linked = true
	rows, err := db.Query(ctx, `
		SELECT b.voucher, b.bill_no, b.bill_date, b.total::float8,
		       COUNT(i.*) FILTER (WHERE i.line_kind = 'item')::int,
		       COALESCE(SUM(i.amount), 0)::float8, COALESCE(SUM(i.gst_amount), 0)::float8
		FROM marg_ede_bills b
		LEFT JOIN marg_ede_bill_items i ON i.voucher = b.voucher AND NOT i.is_deleted
		WHERE `+invoiceWhere+`
		GROUP BY b.voucher
		ORDER BY b.bill_date DESC, b.bill_no DESC`, code)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var b MyBill
		if err := rows.Scan(&b.Voucher, &b.BillNo, &b.Date, &b.Total, &b.Items, &b.Amount, &b.GST); err != nil {
			return out, err
		}
		out.Bills = append(out.Bills, b)
		out.Total += b.Total
	}
	out.Count = len(out.Bills)
	return out, rows.Err()
}

// GetMyBill returns one invoice, or pgx.ErrNoRows when it isn't one of the
// partner's invoices.
func GetMyBill(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, voucher int64) (MyBillDetail, error) {
	var d MyBillDetail
	code, err := PartyCodeOfUser(ctx, db, userID)
	if errors.Is(err, ErrNotLinked) {
		return d, pgx.ErrNoRows
	}
	if err != nil {
		return d, err
	}
	if err := db.QueryRow(ctx, `
		SELECT b.voucher, b.bill_no, b.bill_date, b.total::float8
		FROM marg_ede_bills b
		WHERE b.voucher = $2 AND `+invoiceWhere, code, voucher).
		Scan(&d.Voucher, &d.BillNo, &d.Date, &d.Total); err != nil {
		return d, err
	}
	rows, err := db.Query(ctx, `
		SELECT i.line_kind, COALESCE(ep.name, mp.name), i.batch, i.expiry, i.qty::float8, i.free::float8,
		       i.mrp::float8, i.rate::float8, i.discount::float8, i.amount::float8, i.gst_percent::float8,
		       i.gst_amount::float8, (i.amount + i.gst_amount)::float8
		FROM marg_ede_bill_items i
		LEFT JOIN marg_ede_products ep ON ep.product_pid = i.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = i.product_pid::text
		WHERE i.voucher = $1 AND NOT i.is_deleted
		ORDER BY i.line_kind DESC, i.marg_line_id`, voucher)
	if err != nil {
		return d, err
	}
	defer rows.Close()
	d.Lines = []MyBillLine{}
	for rows.Next() {
		var l MyBillLine
		if err := rows.Scan(&l.Kind, &l.Product, &l.Batch, &l.Expiry, &l.Qty, &l.Free,
			&l.MRP, &l.Rate, &l.Discount, &l.Amount, &l.GSTPercent, &l.GSTAmount, &l.LineTotal); err != nil {
			return d, err
		}
		d.Lines = append(d.Lines, l)
		if l.Kind == "item" {
			d.Items++
		}
		d.Amount += l.Amount
		d.GST += l.GSTAmount
	}
	return d, rows.Err()
}
