package margede

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Marg's Day Book for past financial years (migration 170), loaded once
// from Excel by data-files/exports/daybook-<fy>/load_daybook.py. Read-only
// here, and kept apart from the marg_ede_* tables until the two have been
// compared.

type DaybookFilter struct {
	Kind   string // sale | purchase | receipt | payment | contra | credit_note | debit_note | tds | journal, or "bills" for the four bill kinds
	From   string // YYYY-MM-DD
	To     string
	Party  string // party code
	Search string // ref no, narration or an account name on any line
	Dir    string // "desc" for newest first; Day Book order otherwise
	Page   int
}

type DaybookLine struct {
	LineNo      int     `json:"line_no"`
	Account     string  `json:"account"`
	PartyCode   *string `json:"party_code"`
	AccountKind *string `json:"account_kind"`
	Match       string  `json:"match"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
}

type DaybookVoucher struct {
	ID           int64         `json:"id"`
	FY           string        `json:"fy"`
	Seq          int           `json:"seq"`
	Date         time.Time     `json:"date"`
	Kind         string        `json:"kind"`
	RefNo        *string       `json:"ref_no"`
	RefDate      *time.Time    `json:"ref_date"`
	EntryNo      *string       `json:"entry_no"`
	AgainstBills []string      `json:"against_bills"`
	Narration    *string       `json:"narration"`
	PartyCode    *string       `json:"party_code"`
	PartyName    string        `json:"party_name"`
	Total        float64       `json:"total"`
	PartyAmount  float64       `json:"party_amount"` // the voucher's party's own lines: what the bill charged it, without round-off on the other side
	SourceRow    int           `json:"source_row"`
	Lines        []DaybookLine `json:"lines"`
}

type DaybookList struct {
	Vouchers []DaybookVoucher `json:"vouchers"`
	Total    int              `json:"total"`
	SumTotal float64          `json:"sum_total"`
	// the sum of PartyAmount over every voucher under the filter
	PartySum float64     `json:"party_sum"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
	Kinds    []TypeCount `json:"kinds"` // under the current filter, ignoring kind
	FYs      []string    `json:"fys"`
}

func (f DaybookFilter) where(withKind bool) (string, []any) {
	conds := []string{"TRUE"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	switch {
	case !withKind || f.Kind == "":
	case f.Kind == "bills": // every kind of bill, without receipts, payments and journals
		conds = append(conds, "v.kind IN ('sale', 'purchase', 'credit_note', 'debit_note')")
	default:
		add("v.kind = ?", f.Kind)
	}
	if f.From != "" {
		add("v.voucher_date >= ?::date", f.From)
	}
	if f.To != "" {
		add("v.voucher_date <= ?::date", f.To)
	}
	if f.Party != "" {
		add("EXISTS (SELECT 1 FROM marg_daybook_entries pe WHERE pe.voucher_id = v.id AND pe.party_code = ?)", f.Party)
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		args = append(args, "%"+s+"%")
		conds = append(conds, fmt.Sprintf(`(v.ref_no ILIKE $%[1]d OR v.narration ILIKE $%[1]d OR EXISTS (
			SELECT 1 FROM marg_daybook_entries se WHERE se.voucher_id = v.id AND se.account_text ILIKE $%[1]d))`, len(args)))
	}
	return "WHERE " + strings.Join(conds, " AND "), args
}

// ListDaybook returns one page of vouchers, in Day Book order, each with its
// lines, plus the count and amount of each voucher kind under the filter.
func ListDaybook(ctx context.Context, db *pgxpool.Pool, f DaybookFilter) (DaybookList, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	out := DaybookList{Vouchers: []DaybookVoucher{}, Kinds: []TypeCount{}, FYs: []string{}, Page: f.Page, PageSize: BillsPageSize}

	order := "ASC"
	if f.Dir == "desc" {
		order = "DESC"
	}

	where, args := f.where(true)
	if err := db.QueryRow(ctx, `SELECT COUNT(*), COALESCE(SUM(v.total), 0)::float8
		FROM marg_daybook_vouchers v `+where, args...).Scan(&out.Total, &out.SumTotal); err != nil {
		return out, err
	}
	// what the bills charged their party (the filter's party, or each
	// voucher's own), without round-off on the other side
	var party *string
	if f.Party != "" {
		party = &f.Party
	}
	pargs := append(append([]any{}, args...), party)
	if err := db.QueryRow(ctx, fmt.Sprintf(`SELECT COALESCE(SUM(e.debit + e.credit), 0)::float8
		FROM marg_daybook_vouchers v
		JOIN marg_daybook_entries e ON e.voucher_id = v.id AND e.party_code = COALESCE($%d::text, v.party_code) `,
		len(pargs))+where, pargs...).Scan(&out.PartySum); err != nil {
		return out, err
	}

	rows, err := db.Query(ctx, `
		SELECT v.id, v.fy, v.seq, v.voucher_date, v.kind, v.ref_no, v.ref_date, v.entry_no,
		       COALESCE(v.against_bills, '{}'), v.narration, v.party_code,
		       COALESCE(l.name, first_line.account_text, ''), v.total::float8, v.source_row
		FROM marg_daybook_vouchers v
		LEFT JOIN LATERAL (
			SELECT name FROM marg_ede_ledger WHERE party_code = v.party_code AND NOT is_deleted LIMIT 1
		) l ON v.party_code IS NOT NULL
		LEFT JOIN LATERAL (
			SELECT account_text FROM marg_daybook_entries WHERE voucher_id = v.id ORDER BY line_no LIMIT 1
		) first_line ON TRUE
		`+where+fmt.Sprintf(`
		ORDER BY v.fy %[1]s, v.seq %[1]s
		LIMIT %[2]d OFFSET %[3]d`, order, BillsPageSize, (f.Page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	ids := []int64{}
	index := map[int64]int{}
	for rows.Next() {
		var v DaybookVoucher
		if err := rows.Scan(&v.ID, &v.FY, &v.Seq, &v.Date, &v.Kind, &v.RefNo, &v.RefDate, &v.EntryNo,
			&v.AgainstBills, &v.Narration, &v.PartyCode, &v.PartyName, &v.Total, &v.SourceRow); err != nil {
			return out, err
		}
		v.Lines = []DaybookLine{}
		index[v.ID] = len(out.Vouchers)
		ids = append(ids, v.ID)
		out.Vouchers = append(out.Vouchers, v)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	if len(ids) > 0 {
		lrows, err := db.Query(ctx, `
			SELECT voucher_id, line_no, account_text, party_code, account_kind, match_method, debit::float8, credit::float8
			FROM marg_daybook_entries WHERE voucher_id = ANY($1) ORDER BY voucher_id, line_no`, ids)
		if err != nil {
			return out, err
		}
		defer lrows.Close()
		for lrows.Next() {
			var vid int64
			var l DaybookLine
			if err := lrows.Scan(&vid, &l.LineNo, &l.Account, &l.PartyCode, &l.AccountKind, &l.Match, &l.Debit, &l.Credit); err != nil {
				return out, err
			}
			v := &out.Vouchers[index[vid]]
			v.Lines = append(v.Lines, l)
			if l.PartyCode != nil && v.PartyCode != nil && *l.PartyCode == *v.PartyCode {
				v.PartyAmount += l.Debit + l.Credit
			}
		}
		if err := lrows.Err(); err != nil {
			return out, err
		}
	}

	where, args = f.where(false)
	krows, err := db.Query(ctx, `SELECT v.kind, NULL::text, COUNT(*), SUM(v.total)::float8
		FROM marg_daybook_vouchers v `+where+` GROUP BY v.kind ORDER BY COUNT(*) DESC`, args...)
	if err != nil {
		return out, err
	}
	defer krows.Close()
	for krows.Next() {
		var t TypeCount
		if err := krows.Scan(&t.Code, &t.Name, &t.Count, &t.Amount); err != nil {
			return out, err
		}
		out.Kinds = append(out.Kinds, t)
	}
	if err := krows.Err(); err != nil {
		return out, err
	}

	frows, err := db.Query(ctx, `SELECT DISTINCT fy FROM marg_daybook_vouchers ORDER BY fy`)
	if err != nil {
		return out, err
	}
	defer frows.Close()
	for frows.Next() {
		var fy string
		if err := frows.Scan(&fy); err != nil {
			return out, err
		}
		out.FYs = append(out.FYs, fy)
	}
	return out, frows.Err()
}

type DaybookParty struct {
	PartyCode string  `json:"party_code"`
	Name      string  `json:"name"`
	Kind      *string `json:"kind"`
	Sales     float64 `json:"sales"`
	Received  float64 `json:"received"`  // receipts from the party
	Purchases float64 `json:"purchases"` // bought from the same account
	Paid      float64 `json:"paid"`      // payments to the party
	Notes     float64 `json:"notes"`     // credit notes less debit notes
	Closing   float64 `json:"closing"`   // debit minus credit, from zero
	Entries   int     `json:"entries"`
	LastDate  *string `json:"last_date"`
}

type DaybookPartyList struct {
	Parties  []DaybookParty `json:"parties"`
	Total    int            `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
}

// ListDaybookParties returns every party with entries in the Day Book and
// its totals by voucher kind, largest sales first.
func ListDaybookParties(ctx context.Context, db *pgxpool.Pool, kind, search string, page int) (DaybookPartyList, error) {
	if page < 1 {
		page = 1
	}
	out := DaybookPartyList{Parties: []DaybookParty{}, Page: page, PageSize: BillsPageSize}
	conds := []string{"e.party_code IS NOT NULL"}
	args := []any{}
	if kind != "" {
		args = append(args, kind)
		conds = append(conds, fmt.Sprintf("e.account_kind = $%d", len(args)))
	}
	if s := strings.TrimSpace(search); s != "" {
		args = append(args, "%"+s+"%")
		conds = append(conds, fmt.Sprintf("(e.party_code ILIKE $%[1]d OR e.account_text ILIKE $%[1]d)", len(args)))
	}
	where := "WHERE " + strings.Join(conds, " AND ")

	if err := db.QueryRow(ctx, `SELECT COUNT(DISTINCT e.party_code) FROM marg_daybook_entries e `+where, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := db.Query(ctx, `
		SELECT e.party_code, COALESCE(MAX(l.name), MIN(e.account_text)), MIN(e.account_kind),
		       COALESCE(SUM(e.debit) FILTER (WHERE v.kind = 'sale'), 0)::float8,
		       COALESCE(SUM(e.credit) FILTER (WHERE v.kind = 'receipt'), 0)::float8,
		       COALESCE(SUM(e.credit) FILTER (WHERE v.kind = 'purchase'), 0)::float8,
		       COALESCE(SUM(e.debit) FILTER (WHERE v.kind = 'payment'), 0)::float8,
		       COALESCE(SUM(e.credit - e.debit) FILTER (WHERE v.kind IN ('credit_note', 'debit_note')), 0)::float8,
		       SUM(e.debit - e.credit)::float8,
		       COUNT(*)::int, MAX(e.voucher_date)::text
		FROM marg_daybook_entries e
		JOIN marg_daybook_vouchers v ON v.id = e.voucher_id
		LEFT JOIN marg_ede_ledger l ON l.marg_id = e.ledger_marg_id
		`+where+fmt.Sprintf(`
		GROUP BY e.party_code
		ORDER BY 4 DESC, 2
		LIMIT %d OFFSET %d`, BillsPageSize, (page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p DaybookParty
		if err := rows.Scan(&p.PartyCode, &p.Name, &p.Kind, &p.Sales, &p.Received, &p.Purchases, &p.Paid,
			&p.Notes, &p.Closing, &p.Entries, &p.LastDate); err != nil {
			return out, err
		}
		out.Parties = append(out.Parties, p)
	}
	return out, rows.Err()
}

type DaybookLedgerRow struct {
	Date         time.Time `json:"date"`
	VoucherID    int64     `json:"voucher_id"`
	VoucherKind  string    `json:"voucher_kind"`
	RefNo        *string   `json:"ref_no"`
	AgainstBills []string  `json:"against_bills"`
	Narration    *string   `json:"narration"`
	Debit        float64   `json:"debit"`
	Credit       float64   `json:"credit"`
	Balance      float64   `json:"balance"`
}

type DaybookPartyLedger struct {
	PartyCode string             `json:"party_code"`
	Name      string             `json:"name"`
	Kind      *string            `json:"kind"`
	City      *string            `json:"city"`
	Rows      []DaybookLedgerRow `json:"rows"`
}

var ErrDaybookPartyNotFound = errors.New("party has no day book entries")

// GetDaybookPartyLedger returns one party's ledger, oldest first, with the
// running balance (debit minus credit; opening balance zero).
func GetDaybookPartyLedger(ctx context.Context, db *pgxpool.Pool, code string) (DaybookPartyLedger, error) {
	out := DaybookPartyLedger{PartyCode: code, Rows: []DaybookLedgerRow{}}
	rows, err := db.Query(ctx, `
		SELECT voucher_date, voucher_id, voucher_kind, ref_no, COALESCE(against_bills, '{}'), narration,
		       debit::float8, credit::float8, balance::float8, account_text
		FROM v_marg_daybook_ledger
		WHERE party_code = $1
		ORDER BY voucher_date, voucher_id, entry_id`, code)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r DaybookLedgerRow
		var account string
		if err := rows.Scan(&r.Date, &r.VoucherID, &r.VoucherKind, &r.RefNo, &r.AgainstBills, &r.Narration,
			&r.Debit, &r.Credit, &r.Balance, &account); err != nil {
			return out, err
		}
		if out.Name == "" {
			out.Name = account
		}
		out.Rows = append(out.Rows, r)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(out.Rows) == 0 {
		return out, ErrDaybookPartyNotFound
	}
	// the ledger's own name and city, when the account still exists
	_ = db.QueryRow(ctx, `SELECT name, kind, city FROM marg_ede_ledger WHERE party_code = $1 AND NOT is_deleted LIMIT 1`, code).
		Scan(&out.Name, &out.Kind, &out.City)
	return out, nil
}
