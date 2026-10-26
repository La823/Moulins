package margede

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Party names and groups come from marg_ede_ledger (this API's full
// ledger), falling back to margmaster_party. Product names come from
// marg_ede_products (this API's Product list, which includes the ###
// charge items), falling back to margmaster_products.

const BillsPageSize = 50

// BillFilter is the bills list query. Zero values mean "no filter".
type BillFilter struct {
	Type   string // S (sale invoices), CH (sale challans), P, R, B, D, T, u
	Sort   string // date | bill_no | party | total
	Dir    string // asc | desc (default desc)
	From   string // yyyy-mm-dd
	To     string // yyyy-mm-dd
	Search string // bill no, party code/name, or a product name/code on its lines
	Kind   string // party kind from the ledger: customer, supplier, ...
	Party  string // exact party code
	Status string // "" all | active | cancelled | incomplete
	Page   int
}

// BillSummary is one row of the bills list.
type BillSummary struct {
	Voucher       int64      `json:"voucher"`
	BillNo        string     `json:"bill_no"`
	BillType      string     `json:"bill_type"`
	BillTypeName  *string    `json:"bill_type_name"`
	BillDate      time.Time  `json:"bill_date"`
	PartyCode     *string    `json:"party_code"`
	PartyName     *string    `json:"party_name"`
	PartyGroup    *string    `json:"party_group"`
	PartyKind     *string    `json:"party_kind"`
	BillMode      *string    `json:"bill_mode"`
	Total         float64    `json:"total"`
	LinesCount    int        `json:"lines_count"`
	LinesTotal    float64    `json:"lines_total"`
	LinesComplete bool       `json:"lines_complete"`
	IsCancelled   bool       `json:"is_cancelled"`
	CancelledAt   *time.Time `json:"cancelled_at"`
	OrderRefs     *string    `json:"order_refs"`
	RefBillNo     *string    `json:"ref_bill_no"`
	Reason        *string    `json:"reason"`
	FirstSeenAt   time.Time  `json:"first_seen_at"`
	LastChangedAt time.Time  `json:"last_changed_at"`
}

// TypeCount is one voucher type with its bill count under the current
// filter (ignoring the type filter itself). Amount is the bills list's sum
// of totals, cancelled bills left out, so the page can net credit notes off
// sales.
type TypeCount struct {
	Code   string  `json:"code"`
	Name   *string `json:"name"`
	Count  int     `json:"count"`
	Amount float64 `json:"amount,omitempty"`
}

// BillList is the bills list response.
type BillList struct {
	Bills     []BillSummary `json:"bills"`
	Total     int           `json:"total"`
	Cancelled int           `json:"cancelled"` // of Total
	SumTotal  float64       `json:"sum_total"` // excludes cancelled bills
	Page      int           `json:"page"`
	PageSize  int           `json:"page_size"`
	Types     []TypeCount   `json:"types"`
}

// ChallanType is the list's pseudo voucher type for CA-numbered sale
// challans, kept apart from sale invoices: a challan not yet billed is not
// a sale yet, and once billed it disappears and its invoice counts instead.
const ChallanType = "CH"

// kindExpr / kindNameExpr split sales into invoices and challans.
const kindExpr = `CASE WHEN b.bill_type = 'S' AND b.bill_mode = 'challan' THEN 'CH' ELSE b.bill_type END`
const kindNameExpr = `CASE WHEN b.bill_type = 'S' AND b.bill_mode = 'challan' THEN 'Challan' ELSE b.bill_type_name END`

// orderBy maps a sort key to an ORDER BY. Bill numbers within a series run
// in date order, so date then bill number is the real billing sequence
// (Marg's voucher ids are not).
func (f BillFilter) orderBy() string {
	dir := "DESC"
	if strings.EqualFold(f.Dir, "asc") {
		dir = "ASC"
	}
	switch f.Sort {
	case "bill_no":
		return "b.bill_no " + dir + ", b.bill_date " + dir + ", b.voucher " + dir
	case "party":
		return partyNameExpr + " " + dir + " NULLS LAST, b.party_code " + dir + ", b.bill_date DESC, b.bill_no DESC"
	case "total":
		return "b.total " + dir + ", b.bill_date DESC, b.bill_no DESC"
	default:
		return "b.bill_date " + dir + ", b.bill_no " + dir + ", b.voucher " + dir
	}
}

const partyNameJoin = `
	LEFT JOIN LATERAL (
		SELECT l.name, l.group_name, l.kind FROM marg_ede_ledger l
		WHERE l.party_code = b.party_code AND NOT l.is_deleted
		ORDER BY l.marg_id
		LIMIT 1
	) lg ON TRUE
	LEFT JOIN LATERAL (
		SELECT p.name FROM margmaster_party p
		WHERE TRIM(p.code) = b.party_code
		ORDER BY p.is_deleted, p.synced_at DESC
		LIMIT 1
	) mpn ON TRUE`

const partyNameExpr = `COALESCE(lg.name, mpn.name)`

// where builds the WHERE clause; withType=false leaves the type filter out
// (for the per-type counts).
func (f BillFilter) where(withType bool) (string, []any) {
	conds := []string{"NOT b.is_deleted"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	switch {
	case !withType || f.Type == "":
	case f.Type == ChallanType:
		conds = append(conds, "b.bill_type = 'S'", "b.bill_mode = 'challan'")
	case f.Type == "S":
		conds = append(conds, "b.bill_type = 'S'", "b.bill_mode IS DISTINCT FROM 'challan'")
	default:
		add("b.bill_type = ?", f.Type)
	}
	if f.From != "" {
		add("b.bill_date >= ?::date", f.From)
	}
	if f.To != "" {
		add("b.bill_date <= ?::date", f.To)
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		// Also matches bills with a line whose product name or code matches
		// ("insurance", "coxcalm", "###10").
		add(`(b.bill_no ILIKE ? OR b.party_code ILIKE ? OR `+partyNameExpr+` ILIKE ?
			OR EXISTS (
				SELECT 1 FROM marg_ede_bill_items si
				LEFT JOIN marg_ede_products sp ON sp.product_pid = si.product_pid
				LEFT JOIN margmaster_products sm ON sm.base_code = si.product_pid::text
				WHERE si.voucher = b.voucher AND NOT si.is_deleted
				  AND (sp.name ILIKE ? OR sp.code ILIKE ? OR sm.name ILIKE ?)))`, "%"+s+"%")
	}
	if f.Kind != "" {
		add("lg.kind = ?", f.Kind)
	}
	if f.Party != "" {
		add("b.party_code = ?", f.Party)
	}
	// Cancelled bills are listed by default (so bill numbers have no gaps)
	// but never counted in SumTotal.
	switch f.Status {
	case "active":
		conds = append(conds, "NOT b.is_cancelled")
	case "cancelled":
		conds = append(conds, "b.is_cancelled")
	case "incomplete":
		conds = append(conds, "NOT b.lines_complete", "NOT b.is_cancelled")
	}
	return "WHERE " + strings.Join(conds, " AND "), args
}

// ListBills returns one page of bills, newest first.
func ListBills(ctx context.Context, db *pgxpool.Pool, f BillFilter) (BillList, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	out := BillList{Bills: []BillSummary{}, Types: []TypeCount{}, Page: f.Page, PageSize: BillsPageSize}

	where, args := f.where(true)
	if err := db.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE b.is_cancelled),
		       COALESCE(SUM(b.total) FILTER (WHERE NOT b.is_cancelled), 0)::float8
		FROM marg_ede_bills b`+partyNameJoin+` `+where, args...).
		Scan(&out.Total, &out.Cancelled, &out.SumTotal); err != nil {
		return out, err
	}

	rows, err := db.Query(ctx, `
		SELECT b.voucher, b.bill_no, `+kindExpr+`, `+kindNameExpr+`, b.bill_date, b.party_code, `+partyNameExpr+`, lg.group_name, lg.kind,
		       b.bill_mode, b.total::float8, b.lines_count, b.lines_total::float8, b.lines_complete,
		       b.is_cancelled, b.cancelled_at, b.order_refs, b.ref_bill_no, b.reason,
		       b.first_seen_at, b.last_changed_at
		FROM marg_ede_bills b`+partyNameJoin+` `+where+fmt.Sprintf(`
		ORDER BY %s
		LIMIT %d OFFSET %d`, f.orderBy(), BillsPageSize, (f.Page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var b BillSummary
		if err := rows.Scan(&b.Voucher, &b.BillNo, &b.BillType, &b.BillTypeName, &b.BillDate, &b.PartyCode, &b.PartyName, &b.PartyGroup, &b.PartyKind,
			&b.BillMode, &b.Total, &b.LinesCount, &b.LinesTotal, &b.LinesComplete,
			&b.IsCancelled, &b.CancelledAt, &b.OrderRefs, &b.RefBillNo, &b.Reason,
			&b.FirstSeenAt, &b.LastChangedAt); err != nil {
			return out, err
		}
		out.Bills = append(out.Bills, b)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	where, args = f.where(false)
	trows, err := db.Query(ctx, `
		SELECT `+kindExpr+`, MAX(`+kindNameExpr+`), COUNT(*),
		       COALESCE(SUM(b.total) FILTER (WHERE NOT b.is_cancelled), 0)::float8
		FROM marg_ede_bills b`+partyNameJoin+` `+where+`
		GROUP BY 1 ORDER BY COUNT(*) DESC`, args...)
	if err != nil {
		return out, err
	}
	defer trows.Close()
	for trows.Next() {
		var t TypeCount
		if err := trows.Scan(&t.Code, &t.Name, &t.Count, &t.Amount); err != nil {
			return out, err
		}
		out.Types = append(out.Types, t)
	}
	return out, trows.Err()
}

// BillItem is one line of a bill, with the product name where known.
type BillItem struct {
	MargLineID      int64      `json:"marg_line_id"`
	LineType        *string    `json:"line_type"`
	LineKind        string     `json:"line_kind"`
	LineBillNo      *string    `json:"line_bill_no"`
	ProductPID      int64      `json:"product_pid"`
	ProductName     *string    `json:"product_name"`
	ItemCompanyCode *string    `json:"item_company_code"`
	Batch           *string    `json:"batch"`
	Expiry          *time.Time `json:"expiry"`
	Qty             float64    `json:"qty"`
	Free            float64    `json:"free"`
	MRP             *float64   `json:"mrp"`
	Rate            *float64   `json:"rate"`
	Discount        float64    `json:"discount"`
	Amount          float64    `json:"amount"`
	GSTPercent      *float64   `json:"gst_percent"`
	GSTAmount       float64    `json:"gst_amount"`
	LineTotal       float64    `json:"line_total"`
	Salesman        *string    `json:"salesman"`
	ChallanNo       *string    `json:"challan_no"`
	ChallanDate     *time.Time `json:"challan_date"`
}

// BillDetail is one bill with its lines.
type BillDetail struct {
	BillSummary
	SalePurchaseType *string    `json:"sale_purchase_type"`
	Salesman         *string    `json:"salesman"`
	Area             *string    `json:"area"`
	OrderDate        *time.Time `json:"order_date"`
	ExtraAmount      *float64   `json:"extra_amount"`
	RefBillDate      *time.Time `json:"ref_bill_date"`
	RefAmount        *float64   `json:"ref_amount"`
	AdjustedAgainst  *string    `json:"adjusted_against"`
	AdjustedAmount   *float64   `json:"adjusted_amount"`
	AddField         *string    `json:"add_field"`
	FromChallans     []string   `json:"from_challans"` // challans this invoice was made from
	Items            []BillItem `json:"items"`
}

// GetBill returns one bill and its live lines.
func GetBill(ctx context.Context, db *pgxpool.Pool, voucher int64) (BillDetail, error) {
	var d BillDetail
	b := &d.BillSummary
	err := db.QueryRow(ctx, `
		SELECT b.voucher, b.bill_no, `+kindExpr+`, `+kindNameExpr+`, b.bill_date, b.party_code, `+partyNameExpr+`, lg.group_name, lg.kind,
		       b.bill_mode, b.total::float8, b.lines_count, b.lines_total::float8, b.lines_complete,
		       b.is_cancelled, b.cancelled_at, b.order_refs, b.ref_bill_no, b.reason,
		       b.first_seen_at, b.last_changed_at,
		       b.sale_purchase_type, b.salesman, b.area, b.order_date, b.extra_amount::float8,
		       b.ref_bill_date, b.ref_amount::float8, b.adjusted_against, b.adjusted_amount::float8, b.add_field
		FROM marg_ede_bills b`+partyNameJoin+`
		WHERE b.voucher = $1`, voucher).
		Scan(&b.Voucher, &b.BillNo, &b.BillType, &b.BillTypeName, &b.BillDate, &b.PartyCode, &b.PartyName, &b.PartyGroup, &b.PartyKind,
			&b.BillMode, &b.Total, &b.LinesCount, &b.LinesTotal, &b.LinesComplete,
			&b.IsCancelled, &b.CancelledAt, &b.OrderRefs, &b.RefBillNo, &b.Reason,
			&b.FirstSeenAt, &b.LastChangedAt,
			&d.SalePurchaseType, &d.Salesman, &d.Area, &d.OrderDate, &d.ExtraAmount,
			&d.RefBillDate, &d.RefAmount, &d.AdjustedAgainst, &d.AdjustedAmount, &d.AddField)
	if err != nil {
		return d, err
	}

	rows, err := db.Query(ctx, `
		SELECT i.marg_line_id, i.line_type, i.line_kind, i.line_bill_no, i.product_pid, COALESCE(ep.name, mp.name),
		       i.item_company_code, i.batch, i.expiry, i.qty::float8, i.free::float8, i.mrp::float8,
		       i.rate::float8, i.discount::float8, i.amount::float8, i.gst_percent::float8,
		       i.gst_amount::float8, (i.amount + i.gst_amount)::float8, i.salesman, i.challan_no, i.challan_date
		FROM marg_ede_bill_items i
		LEFT JOIN marg_ede_products ep ON ep.product_pid = i.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = i.product_pid::text
		WHERE i.voucher = $1 AND NOT i.is_deleted
		ORDER BY i.line_kind DESC, i.marg_line_id`, voucher)
	if err != nil {
		return d, err
	}
	defer rows.Close()
	d.Items = []BillItem{}
	for rows.Next() {
		var it BillItem
		if err := rows.Scan(&it.MargLineID, &it.LineType, &it.LineKind, &it.LineBillNo, &it.ProductPID, &it.ProductName,
			&it.ItemCompanyCode, &it.Batch, &it.Expiry, &it.Qty, &it.Free, &it.MRP,
			&it.Rate, &it.Discount, &it.Amount, &it.GSTPercent,
			&it.GSTAmount, &it.LineTotal, &it.Salesman, &it.ChallanNo, &it.ChallanDate); err != nil {
			return d, err
		}
		d.Items = append(d.Items, it)
	}
	if err := rows.Err(); err != nil {
		return d, err
	}

	d.FromChallans = []string{}
	seen := map[string]bool{}
	for _, it := range d.Items {
		if it.ChallanNo != nil && *it.ChallanNo != d.BillNo && !seen[*it.ChallanNo] {
			seen[*it.ChallanNo] = true
			d.FromChallans = append(d.FromChallans, *it.ChallanNo)
		}
	}
	return d, nil
}

// SyncOverview is what the bills page header shows.
type SyncOverview struct {
	ScheduleEnabled bool       `json:"schedule_enabled"`
	IntervalMinutes int        `json:"interval_minutes"`
	NextRunAt       *time.Time `json:"next_run_at"`
	LastSuccess     *Run       `json:"last_success"`
	ActiveRun       *Run       `json:"active_run"`
	RecentRuns      []Run      `json:"recent_runs"`
	Bills           int        `json:"bills"`
	Items           int        `json:"items"`
	LatestBillDate  *time.Time `json:"latest_bill_date"`
}

// Overview gathers sync state and data counts.
func Overview(ctx context.Context, db *pgxpool.Pool) (SyncOverview, error) {
	_ = reapStaleRuns(ctx, db)
	o := SyncOverview{ScheduleEnabled: ScheduleEnabled(), IntervalMinutes: int(Interval.Minutes())}
	if o.ScheduleEnabled {
		next := NextSlot(time.Now())
		o.NextRunAt = &next
	}
	runs, err := ListRuns(ctx, db, 10)
	if err != nil {
		return o, err
	}
	o.RecentRuns = runs
	if r, err := scanRun(db.QueryRow(ctx, `SELECT `+runColumns+` FROM marg_ede_sync_runs
		WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`).Scan); err == nil {
		o.LastSuccess = &r
	}
	if r, err := scanRun(db.QueryRow(ctx, `SELECT `+runColumns+` FROM marg_ede_sync_runs
		WHERE status = 'running' LIMIT 1`).Scan); err == nil {
		o.ActiveRun = &r
	}
	err = db.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM marg_ede_bills WHERE NOT is_deleted),
		       (SELECT COUNT(*) FROM marg_ede_bill_items WHERE NOT is_deleted),
		       (SELECT MAX(bill_date) FROM marg_ede_bills WHERE NOT is_deleted)`).
		Scan(&o.Bills, &o.Items, &o.LatestBillDate)
	return o, err
}

// LedgerFilter is the ledger list query.
type LedgerFilter struct {
	Kind    string // customer, supplier, ...
	Matched string // "" all | yes (also in Marg Parties) | no
	Search  string // code, name, city, GSTIN
	Page    int
}

// LedgerAccount is one ledger row for the admin list.
type LedgerAccount struct {
	MargID          int64      `json:"marg_id"`
	PartyCode       *string    `json:"party_code"`
	Name            string     `json:"name"`
	ShortName       *string    `json:"short_name"`
	City            *string    `json:"city"`
	GroupCode       *string    `json:"group_code"`
	GroupName       *string    `json:"group_name"`
	Kind            string     `json:"kind"`
	Address         *string    `json:"address"`
	Pin             *string    `json:"pin"`
	GSTIN           *string    `json:"gstin"`
	DLNo            *string    `json:"dl_no"`
	Phones          []string   `json:"phones"`
	InMargParties   bool       `json:"in_marg_parties"`
	MargPartyName   *string    `json:"marg_party_name"`
	MargPartyStatus *string    `json:"marg_party_status"`
	MargPartyDLNo   *string    `json:"marg_party_dl_no"`
	Bills           int        `json:"bills"`
	BillsTotal      float64    `json:"bills_total"`
	LastBillDate    *time.Time `json:"last_bill_date"`
	FirstSeenAt     time.Time  `json:"first_seen_at"`
}

// LedgerList is the ledger list response.
type LedgerList struct {
	Accounts []LedgerAccount `json:"accounts"`
	Total    int             `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"page_size"`
	Kinds    []TypeCount     `json:"kinds"`   // under the current filter, ignoring kind
	Matched  int             `json:"matched"` // of Total, also in Marg Parties
}

func (f LedgerFilter) where(withKind bool) (string, []any) {
	conds := []string{"TRUE"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if withKind && f.Kind != "" {
		add("v.kind = ?", f.Kind)
	}
	switch f.Matched {
	case "yes":
		conds = append(conds, "v.in_marg_parties")
	case "no":
		conds = append(conds, "NOT v.in_marg_parties")
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		add("(v.party_code ILIKE ? OR v.name ILIKE ? OR v.gstin ILIKE ? OR v.city ILIKE ?)", "%"+s+"%")
	}
	return "WHERE " + strings.Join(conds, " AND "), args
}

// ListLedger returns one page of ledger accounts with their bill totals
// (cancelled bills excluded) and whether each is also in Marg Parties.
func ListLedger(ctx context.Context, db *pgxpool.Pool, f LedgerFilter) (LedgerList, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	out := LedgerList{Accounts: []LedgerAccount{}, Kinds: []TypeCount{}, Page: f.Page, PageSize: BillsPageSize}

	where, args := f.where(true)
	if err := db.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE v.in_marg_parties)
		FROM v_marg_ede_ledger v `+where, args...).Scan(&out.Total, &out.Matched); err != nil {
		return out, err
	}

	rows, err := db.Query(ctx, `
		SELECT v.marg_id, v.party_code, v.name, v.short_name, v.city, v.group_code, v.group_name, v.kind,
		       NULLIF(CONCAT_WS(', ', v.address1, v.address2, v.address3), ''), v.pin, v.gstin, v.dl_no,
		       ARRAY_REMOVE(ARRAY[v.phone1, v.phone2, v.phone3, v.phone4], NULL),
		       v.in_marg_parties, v.marg_party_name, v.marg_party_status, v.marg_party_dl_no,
		       COALESCE(bs.n, 0), COALESCE(bs.total, 0)::float8, bs.last_date, v.first_seen_at
		FROM v_marg_ede_ledger v
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS n, SUM(b.total) AS total, MAX(b.bill_date) AS last_date
			FROM marg_ede_bills b
			WHERE b.party_code = v.party_code AND NOT b.is_deleted AND NOT b.is_cancelled
		) bs ON v.party_code IS NOT NULL
		`+where+fmt.Sprintf(`
		ORDER BY COALESCE(bs.n, 0) DESC, v.name
		LIMIT %d OFFSET %d`, BillsPageSize, (f.Page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var a LedgerAccount
		if err := rows.Scan(&a.MargID, &a.PartyCode, &a.Name, &a.ShortName, &a.City, &a.GroupCode, &a.GroupName, &a.Kind,
			&a.Address, &a.Pin, &a.GSTIN, &a.DLNo, &a.Phones,
			&a.InMargParties, &a.MargPartyName, &a.MargPartyStatus, &a.MargPartyDLNo,
			&a.Bills, &a.BillsTotal, &a.LastBillDate, &a.FirstSeenAt); err != nil {
			return out, err
		}
		out.Accounts = append(out.Accounts, a)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	where, args = f.where(false)
	krows, err := db.Query(ctx, `SELECT v.kind, NULL::text, COUNT(*) FROM v_marg_ede_ledger v `+where+`
		GROUP BY v.kind ORDER BY COUNT(*) DESC`, args...)
	if err != nil {
		return out, err
	}
	defer krows.Close()
	for krows.Next() {
		var t TypeCount
		if err := krows.Scan(&t.Code, &t.Name, &t.Count); err != nil {
			return out, err
		}
		out.Kinds = append(out.Kinds, t)
	}
	return out, krows.Err()
}
