package margede

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PartyTypeTotal is one voucher type's totals for a party (cancelled bills
// left out; sale challans counted apart from sale invoices).
type PartyTypeTotal struct {
	Code      string     `json:"code"`
	Name      *string    `json:"name"`
	Bills     int        `json:"bills"`
	Total     float64    `json:"total"`
	FirstDate *time.Time `json:"first_date"`
	LastDate  *time.Time `json:"last_date"`
}

// PartyProduct is one product's totals on a party's bills.
type PartyProduct struct {
	ProductPID int64   `json:"product_pid"`
	Name       *string `json:"name"`
	Qty        float64 `json:"qty"`
	Free       float64 `json:"free"`
	Amount     float64 `json:"amount"`
	Bills      int     `json:"bills"`
}

// PartyDetail is one party: its ledger account (nil if the code is only
// seen on bills), totals per bill type and the products on its bills.
type PartyDetail struct {
	PartyCode   string           `json:"party_code"`
	Account     *LedgerAccount   `json:"account"`
	Totals      []PartyTypeTotal `json:"totals"`
	TopProducts []PartyProduct   `json:"top_products"`
	Cancelled   int              `json:"cancelled"`
	Monthly     []MonthPoint     `json:"monthly"`
}

// ErrPartyNotFound: no ledger account and no bills for that code.
var ErrPartyNotFound = errors.New("party not found")

// GetParty returns one party by its Marg party code.
func GetParty(ctx context.Context, db *pgxpool.Pool, code string) (PartyDetail, error) {
	d := PartyDetail{PartyCode: code, Totals: []PartyTypeTotal{}, TopProducts: []PartyProduct{}}

	var a LedgerAccount
	err := db.QueryRow(ctx, `
		SELECT v.marg_id, v.party_code, v.name, v.short_name, v.city, v.group_code, v.group_name, v.kind,
		       NULLIF(CONCAT_WS(', ', v.address1, v.address2, v.address3), ''), v.pin, v.gstin, v.dl_no,
		       ARRAY_REMOVE(ARRAY[v.phone1, v.phone2, v.phone3, v.phone4], NULL),
		       v.in_marg_parties, v.marg_party_name, v.marg_party_status, v.marg_party_dl_no,
		       0, 0::float8, NULL::date, v.first_seen_at
		FROM v_marg_ede_ledger v
		WHERE v.party_code = $1
		ORDER BY v.marg_id
		LIMIT 1`, code).
		Scan(&a.MargID, &a.PartyCode, &a.Name, &a.ShortName, &a.City, &a.GroupCode, &a.GroupName, &a.Kind,
			&a.Address, &a.Pin, &a.GSTIN, &a.DLNo, &a.Phones,
			&a.InMargParties, &a.MargPartyName, &a.MargPartyStatus, &a.MargPartyDLNo,
			&a.Bills, &a.BillsTotal, &a.LastBillDate, &a.FirstSeenAt)
	switch {
	case err == nil:
		d.Account = &a
	case !errors.Is(err, pgx.ErrNoRows):
		return d, err
	}

	rows, err := db.Query(ctx, `
		SELECT `+kindExpr+`, MAX(`+kindNameExpr+`), COUNT(*)::int, COALESCE(SUM(b.total), 0)::float8,
		       MIN(b.bill_date), MAX(b.bill_date)
		FROM marg_ede_bills b
		WHERE b.party_code = $1 AND NOT b.is_deleted AND NOT b.is_cancelled
		GROUP BY 1 ORDER BY COUNT(*) DESC`, code)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var t PartyTypeTotal
		if err := rows.Scan(&t.Code, &t.Name, &t.Bills, &t.Total, &t.FirstDate, &t.LastDate); err != nil {
			rows.Close()
			return d, err
		}
		d.Totals = append(d.Totals, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return d, err
	}

	if err := db.QueryRow(ctx, `SELECT COUNT(*)::int FROM marg_ede_bills
		WHERE party_code = $1 AND NOT is_deleted AND is_cancelled`, code).Scan(&d.Cancelled); err != nil {
		return d, err
	}

	prows, err := db.Query(ctx, `
		SELECT i.product_pid, COALESCE(MAX(ep.name), MAX(mp.name)),
		       SUM(i.qty)::float8, SUM(i.free)::float8, SUM(i.amount)::float8, COUNT(DISTINCT i.voucher)::int
		FROM marg_ede_bill_items i
		JOIN marg_ede_bills b ON b.voucher = i.voucher
		LEFT JOIN marg_ede_products ep ON ep.product_pid = i.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = i.product_pid::text
		WHERE b.party_code = $1 AND NOT b.is_deleted AND NOT b.is_cancelled
		  AND NOT i.is_deleted AND i.line_kind <> 'charge'
		GROUP BY i.product_pid
		ORDER BY SUM(i.amount) DESC
		LIMIT 15`, code)
	if err != nil {
		return d, err
	}
	defer prows.Close()
	for prows.Next() {
		var p PartyProduct
		if err := prows.Scan(&p.ProductPID, &p.Name, &p.Qty, &p.Free, &p.Amount, &p.Bills); err != nil {
			return d, err
		}
		d.TopProducts = append(d.TopProducts, p)
	}
	if err := prows.Err(); err != nil {
		return d, err
	}

	if d.Account == nil && len(d.Totals) == 0 && d.Cancelled == 0 {
		return d, ErrPartyNotFound
	}
	d.Monthly, err = monthlyFor(ctx, db, code)
	return d, err
}
