package cheques

// The cheque register: payments made to suppliers — cheques and transfers —
// split over the Marg purchase invoices they pay (migration 175; 172 linked
// them to purchase-order lines), with a history of status changes and
// remarks, and the invoices still waiting to be paid.
//
// Debit notes (and purchase-return challans) are credits against the same
// supplier. A payment can take one off what it pays: the note is linked with
// a negative amount, so cheque = invoices − notes.

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	Methods  = []string{"cheque", "neft", "rtgs", "imps", "upi", "cash", "other"}
	Statuses = []string{"made", "in_office", "handed_over", "cleared", "cancelled"}
)

func Valid(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// usedSQL is how much of invoice or note i live payments have taken: an
// invoice's paid amount, or (links being negative) a note's used amount.
const usedSQL = `COALESCE((SELECT ABS(SUM(a.amount)) FROM supplier_payment_invoices a
	JOIN supplier_payments sp ON sp.id = a.payment_id
	WHERE a.invoice_key = i.invoice_key AND sp.status <> 'cancelled'), 0)`

// invSupplierSQL finds who an invoice is from: the manufacturer its Marg
// party is linked to, or else the party itself.
const invSupplierSQL = `
	LEFT JOIN manufacturer_marg_parties mp ON mp.party_code = i.party_code
	LEFT JOIN manufacturers m ON m.id = mp.manufacturer_id
	LEFT JOIN marg_ede_ledger l ON l.party_code = i.party_code`

const supplierNameSQL = `COALESCE(m.name, trim(COALESCE(NULLIF(l.short_name, ''), l.name)), i.party_code, '')`

// InvoiceLink is one invoice (or note) a payment pays, and how much of it.
type InvoiceLink struct {
	InvoiceKey     string   `json:"invoice_key"`
	Kind           *string  `json:"kind"` // invoice | debit_note; nil when gone from Marg
	MargNo         *string  `json:"marg_no"`
	SupplierBillNo *string  `json:"supplier_bill_no"`
	BillDate       *string  `json:"bill_date"`
	Total          *float64 `json:"total"`
	Supplier       string   `json:"supplier"`
	Amount         float64  `json:"amount"`     // negative for a note
	UsedTotal      float64  `json:"used_total"` // by every live payment, this one included
}

type Event struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	Status    *string   `json:"status"`
	Note      *string   `json:"note"`
	Actor     string    `json:"actor"`
	CreatedAt time.Time `json:"created_at"`
}

type Payment struct {
	ID               int64         `json:"id"`
	Method           string        `json:"method"`
	Bank             *string       `json:"bank"`
	ChequeNo         *string       `json:"cheque_no"`
	PaymentDate      *string       `json:"payment_date"`
	Payee            string        `json:"payee"`
	ManufacturerID   *uuid.UUID    `json:"manufacturer_id"`
	ManufacturerName *string       `json:"manufacturer_name"`
	ManufacturerCode *string       `json:"manufacturer_code"`
	Amount           float64       `json:"amount"`
	Status           string        `json:"status"`
	StatusChangedAt  time.Time     `json:"status_changed_at"`
	ChequeProfileID  *int64        `json:"cheque_profile_id"`
	Source           string        `json:"source"`
	CreatedAt        time.Time     `json:"created_at"`
	Allocated        float64       `json:"allocated"`
	InvoiceNos       []string      `json:"invoice_nos"`
	LastRemark       *string       `json:"last_remark"`
	Invoices         []InvoiceLink `json:"invoices,omitempty"`
	Events           []Event       `json:"events,omitempty"`
}

const paymentColumns = `
	p.id, p.method, p.bank, p.cheque_no, to_char(p.payment_date, 'YYYY-MM-DD'), p.payee, p.manufacturer_id, m.name, m.code,
	p.amount::float8, p.status, p.status_changed_at, p.cheque_profile_id, p.source, p.created_at,
	COALESCE(al.allocated, 0)::float8, COALESCE(al.invs, '{}'), rm.note`

const paymentFrom = `
	FROM supplier_payments p
	LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
	LEFT JOIN LATERAL (
		SELECT SUM(a.amount) AS allocated,
		       array_agg(COALESCE(i.supplier_bill_no, i.marg_no, a.invoice_key) ORDER BY i.bill_date, a.id) AS invs
		FROM supplier_payment_invoices a LEFT JOIN v_purchase_invoices i ON i.invoice_key = a.invoice_key
		WHERE a.payment_id = p.id
	) al ON true
	LEFT JOIN LATERAL (
		SELECT e.note FROM supplier_payment_events e
		WHERE e.payment_id = p.id AND e.kind = 'remark' ORDER BY e.created_at DESC, e.id DESC LIMIT 1
	) rm ON true`

func scanPayment(row pgx.Row) (Payment, error) {
	var p Payment
	err := row.Scan(&p.ID, &p.Method, &p.Bank, &p.ChequeNo, &p.PaymentDate, &p.Payee, &p.ManufacturerID, &p.ManufacturerName, &p.ManufacturerCode,
		&p.Amount, &p.Status, &p.StatusChangedAt, &p.ChequeProfileID, &p.Source, &p.CreatedAt,
		&p.Allocated, &p.InvoiceNos, &p.LastRemark)
	return p, err
}

type Filter struct {
	Status    string // one of Statuses, or "" for all
	Method    string // "cheque", "transfer" (anything else) or ""
	Linked    string // "yes", "no" or ""
	PostDated bool   // cheque date still ahead, not cleared or cancelled
	Search    string
	Limit     int
	Offset    int
}

// postDatedSQL: a payment dated after today (India time) that is still live.
const postDatedSQL = `p.payment_date > (NOW() AT TIME ZONE 'Asia/Kolkata')::date AND p.status NOT IN ('cleared', 'cancelled')`

// ListPayments returns a page of payments, the total matching, and how many
// payments are in each status (ignoring the status filter) plus how many are
// post-dated. Newest first; post-dated ones soonest first.
func ListPayments(ctx context.Context, db *pgxpool.Pool, f Filter) ([]Payment, int, map[string]int, error) {
	where, args := []string{"true"}, []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "$?", "$"+strconv.Itoa(len(args))))
	}
	switch f.Method {
	case "cheque":
		where = append(where, "p.method = 'cheque'")
	case "transfer":
		where = append(where, "p.method <> 'cheque'")
	}
	switch f.Linked {
	case "yes":
		where = append(where, "al.allocated IS NOT NULL")
	case "no":
		where = append(where, "al.allocated IS NULL")
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		add(`(p.payee ILIKE '%' || $? || '%' OR p.cheque_no ILIKE $? || '%' OR m.name ILIKE '%' || $? || '%' OR m.code ILIKE $?
			OR EXISTS (SELECT 1 FROM supplier_payment_invoices a JOIN v_purchase_invoices i ON i.invoice_key = a.invoice_key
			           WHERE a.payment_id = p.id AND (i.supplier_bill_no ILIKE '%' || $? || '%' OR i.marg_no ILIKE $?)))`, s)
	}
	counts := map[string]int{}
	rows, err := db.Query(ctx, `SELECT p.status, COUNT(*), COUNT(*) FILTER (WHERE `+postDatedSQL+`) `+paymentFrom+`
		WHERE `+strings.Join(where, " AND ")+` GROUP BY 1`, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	for rows.Next() {
		var s string
		var n, pd int
		if err := rows.Scan(&s, &n, &pd); err != nil {
			rows.Close()
			return nil, 0, nil, err
		}
		counts[s] = n
		counts["post_dated"] += pd
	}
	rows.Close()

	if f.Status != "" {
		add("p.status = $?", f.Status)
	}
	order := "p.payment_date DESC NULLS LAST, p.id DESC"
	if f.PostDated {
		where = append(where, postDatedSQL)
		order = "p.payment_date, p.id"
	}
	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) `+paymentFrom+` WHERE `+strings.Join(where, " AND "), args...).Scan(&total); err != nil {
		return nil, 0, nil, err
	}
	args = append(args, f.Limit, f.Offset)
	rows, err = db.Query(ctx, `SELECT `+paymentColumns+paymentFrom+` WHERE `+strings.Join(where, " AND ")+`
		ORDER BY `+order+`
		LIMIT $`+strconv.Itoa(len(args)-1)+` OFFSET $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()
	out := []Payment{}
	for rows.Next() {
		p, err := scanPayment(rows)
		if err != nil {
			return nil, 0, nil, err
		}
		out = append(out, p)
	}
	return out, total, counts, rows.Err()
}

// GetPayment returns one payment with the invoices it pays and its history.
func GetPayment(ctx context.Context, db *pgxpool.Pool, id int64) (Payment, error) {
	p, err := scanPayment(db.QueryRow(ctx, `SELECT `+paymentColumns+paymentFrom+` WHERE p.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	if err != nil {
		return p, err
	}
	rows, err := db.Query(ctx, `
		SELECT a.invoice_key, i.kind, i.marg_no, i.supplier_bill_no, to_char(i.bill_date, 'YYYY-MM-DD'), i.total::float8,
		       `+supplierNameSQL+`, a.amount::float8,
		       COALESCE((SELECT ABS(SUM(a2.amount)) FROM supplier_payment_invoices a2 JOIN supplier_payments sp ON sp.id = a2.payment_id
		                 WHERE a2.invoice_key = a.invoice_key AND sp.status <> 'cancelled'), 0)::float8
		FROM supplier_payment_invoices a LEFT JOIN v_purchase_invoices i ON i.invoice_key = a.invoice_key `+invSupplierSQL+`
		WHERE a.payment_id = $1 ORDER BY i.bill_date, a.id`, id)
	if err != nil {
		return p, err
	}
	p.Invoices = []InvoiceLink{}
	for rows.Next() {
		var a InvoiceLink
		if err := rows.Scan(&a.InvoiceKey, &a.Kind, &a.MargNo, &a.SupplierBillNo, &a.BillDate, &a.Total, &a.Supplier, &a.Amount, &a.UsedTotal); err != nil {
			rows.Close()
			return p, err
		}
		p.Invoices = append(p.Invoices, a)
	}
	rows.Close()
	rows, err = db.Query(ctx, `
		SELECT e.id, e.kind, e.status, e.note, COALESCE(NULLIF(u.username, ''), e.actor_name, ''), e.created_at
		FROM supplier_payment_events e LEFT JOIN users u ON u.id = e.actor_id
		WHERE e.payment_id = $1 ORDER BY e.created_at, e.id`, id)
	if err != nil {
		return p, err
	}
	defer rows.Close()
	p.Events = []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Kind, &e.Status, &e.Note, &e.Actor, &e.CreatedAt); err != nil {
			return p, err
		}
		p.Events = append(p.Events, e)
	}
	return p, rows.Err()
}

// PaymentInput is a payment as the page sends it, with the invoices it pays.
type PaymentInput struct {
	Method          string        `json:"method"`
	Bank            *string       `json:"bank"`
	ChequeNo        *string       `json:"cheque_no"`
	PaymentDate     *string       `json:"payment_date"`
	Payee           string        `json:"payee"`
	ManufacturerID  *uuid.UUID    `json:"manufacturer_id"`
	Amount          float64       `json:"amount"`
	Status          string        `json:"status"`
	ChequeProfileID *int64        `json:"cheque_profile_id"`
	Source          string        `json:"source"`
	Remark          string        `json:"remark"`
	OtherPayee      bool          `json:"other_payee"` // paid to someone who isn't a manufacturer (rent, salary, …)
	Invoices        []InvoiceLink `json:"invoices"`    // invoice_key and amount (negative for a note)
}

func blank(s *string) *string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil
	}
	t := strings.TrimSpace(*s)
	return &t
}

// margPartySQL is the Marg party of the manufacturer in $6.
const margPartySQL = `(SELECT party_code FROM manufacturer_marg_parties WHERE manufacturer_id = $6::uuid ORDER BY party_code LIMIT 1)`

// ErrUnknownInvoice: a link names an invoice Marg doesn't have.
var ErrUnknownInvoice = errors.New("unknown invoice")

// SavePayment adds a payment (id 0) or updates one, replacing the invoices
// it pays, in one transaction, and records it in the payment's history.
func SavePayment(ctx context.Context, db *pgxpool.Pool, id int64, in PaymentInput, actor *uuid.UUID) (int64, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	in.Bank, in.ChequeNo, in.PaymentDate = blank(in.Bank), blank(in.ChequeNo), blank(in.PaymentDate)
	if id == 0 {
		err = tx.QueryRow(ctx, `
			INSERT INTO supplier_payments (method, bank, cheque_no, payment_date, payee, manufacturer_id, amount, status, cheque_profile_id, source, created_by, marg_party_code)
			VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, `+margPartySQL+`) RETURNING id`,
			in.Method, in.Bank, in.ChequeNo, in.PaymentDate, strings.TrimSpace(in.Payee), in.ManufacturerID, in.Amount, in.Status,
			in.ChequeProfileID, in.Source, actor).Scan(&id)
		if err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO supplier_payment_events (payment_id, kind, status, actor_id) VALUES ($1, 'created', $2, $3)`, id, in.Status, actor); err != nil {
			return 0, err
		}
	} else {
		// status changes go through SetStatus so each one is recorded
		tag, err := tx.Exec(ctx, `
			UPDATE supplier_payments SET method = $2, bank = $3, cheque_no = $4, payment_date = $5::date, payee = $6,
			       manufacturer_id = $7, amount = $8, updated_at = NOW(),
			       marg_party_code = CASE WHEN $7::uuid IS NULL THEN marg_party_code
			                              WHEN manufacturer_id IS NOT DISTINCT FROM $7::uuid AND marg_party_code IS NOT NULL THEN marg_party_code
			                              ELSE (SELECT party_code FROM manufacturer_marg_parties WHERE manufacturer_id = $7::uuid ORDER BY party_code LIMIT 1) END
			WHERE id = $1`,
			id, in.Method, in.Bank, in.ChequeNo, in.PaymentDate, strings.TrimSpace(in.Payee), in.ManufacturerID, in.Amount)
		if err != nil {
			return 0, err
		}
		if tag.RowsAffected() == 0 {
			return 0, ErrNotFound
		}
		if _, err := tx.Exec(ctx, `INSERT INTO supplier_payment_events (payment_id, kind, actor_id) VALUES ($1, 'edited', $2)`, id, actor); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM supplier_payment_invoices WHERE payment_id = $1`, id); err != nil {
			return 0, err
		}
	}
	if len(in.Invoices) > 0 {
		keys, amts := make([]string, len(in.Invoices)), make([]float64, len(in.Invoices))
		for i, a := range in.Invoices {
			keys[i], amts[i] = a.InvoiceKey, a.Amount
		}
		// a note always takes money off: store it negative whatever was sent
		tag, err := tx.Exec(ctx, `
			INSERT INTO supplier_payment_invoices (payment_id, invoice_key, amount)
			SELECT $1, t.k, CASE WHEN i.kind = 'debit_note' THEN -ABS(t.amt) ELSE t.amt END
			FROM unnest($2::text[], $3::numeric[]) AS t(k, amt) JOIN v_purchase_invoices i ON i.invoice_key = t.k`, id, keys, amts)
		if err != nil {
			return 0, err
		}
		if int(tag.RowsAffected()) != len(keys) {
			return 0, ErrUnknownInvoice
		}
	}
	if r := strings.TrimSpace(in.Remark); r != "" {
		if _, err := tx.Exec(ctx, `INSERT INTO supplier_payment_events (payment_id, kind, note, actor_id) VALUES ($1, 'remark', $2, $3)`, id, r, actor); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit(ctx)
}

// SetStatus moves a payment to a new status and records it, with an
// optional note.
func SetStatus(ctx context.Context, db *pgxpool.Pool, id int64, status, note string, actor *uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		WITH u AS (
			UPDATE supplier_payments SET status = $2, status_changed_at = NOW(), updated_at = NOW()
			WHERE id = $1 AND status <> $2 RETURNING id
		)
		INSERT INTO supplier_payment_events (payment_id, kind, status, note, actor_id)
		SELECT id, 'status', $2, NULLIF($3, ''), $4 FROM u`, id, status, strings.TrimSpace(note), actor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err := db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM supplier_payments WHERE id = $1)`, id).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
	}
	return nil
}

func AddRemark(ctx context.Context, db *pgxpool.Pool, id int64, note string, actor *uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		INSERT INTO supplier_payment_events (payment_id, kind, note, actor_id)
		SELECT id, 'remark', $2, $3 FROM supplier_payments WHERE id = $1`, id, strings.TrimSpace(note), actor)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// Invoice is a Marg purchase invoice or debit note: what it was for, what
// payments have taken of it, and (an invoice) when it falls due.
type Invoice struct {
	InvoiceKey       string     `json:"invoice_key"`
	Kind             string     `json:"kind"` // invoice | debit_note
	Source           string     `json:"source"`
	PartyCode        *string    `json:"party_code"`
	MargNo           *string    `json:"marg_no"`
	SupplierBillNo   *string    `json:"supplier_bill_no"`
	BillDate         string     `json:"bill_date"`
	Total            float64    `json:"total"`
	Used             float64    `json:"used"`      // paid (invoice) or taken off cheques (note)
	Remaining        float64    `json:"remaining"` // total − used
	ManufacturerID   *uuid.UUID `json:"manufacturer_id"`
	ManufacturerCode *string    `json:"manufacturer_code"`
	Supplier         string     `json:"supplier"`
	CreditDays       *int       `json:"credit_days"`
	DueOn            *string    `json:"due_on"`
}

const invoiceColumns = `
	i.invoice_key, i.kind, i.source, i.party_code, i.marg_no, i.supplier_bill_no, to_char(i.bill_date, 'YYYY-MM-DD'),
	i.total::float8, ` + usedSQL + `::float8, m.id, m.code, ` + supplierNameSQL + `, m.credit_days,
	CASE WHEN i.kind = 'invoice' THEN to_char(i.bill_date + m.credit_days, 'YYYY-MM-DD') END`

func scanInvoices(rows pgx.Rows) ([]Invoice, error) {
	defer rows.Close()
	out := []Invoice{}
	for rows.Next() {
		var v Invoice
		if err := rows.Scan(&v.InvoiceKey, &v.Kind, &v.Source, &v.PartyCode, &v.MargNo, &v.SupplierBillNo, &v.BillDate,
			&v.Total, &v.Used, &v.ManufacturerID, &v.ManufacturerCode, &v.Supplier, &v.CreditDays, &v.DueOn); err != nil {
			return nil, err
		}
		v.Remaining = v.Total - v.Used
		out = append(out, v)
	}
	return out, rows.Err()
}

// SupplierDues is one supplier's unpaid invoices and unused debit notes.
type SupplierDues struct {
	ManufacturerID   *uuid.UUID `json:"manufacturer_id"`
	ManufacturerCode *string    `json:"manufacturer_code"`
	Name             string     `json:"name"`
	CreditDays       *int       `json:"credit_days"`
	Invoices         []Invoice  `json:"invoices"`
	Notes            []Invoice  `json:"notes"`
	Outstanding      float64    `json:"outstanding"` // invoices still unpaid
	Credits          float64    `json:"credits"`     // notes not yet taken off a cheque
	Balance          float64    `json:"balance"`     // outstanding − credits
	NextDue          *string    `json:"next_due"`
	Overdue          float64    `json:"overdue"` // outstanding on invoices past their due date
}

// Dues lists, per supplier, the invoices not yet fully paid and the debit
// notes not yet used, dated on or after `from` (all of them with older).
// Suppliers whose next invoice falls due soonest come first.
func Dues(ctx context.Context, db *pgxpool.Pool, from string, older bool, search string) ([]SupplierDues, error) {
	rows, err := db.Query(ctx, `
		SELECT `+invoiceColumns+`
		FROM v_purchase_invoices i `+invSupplierSQL+`
		WHERE ($2 OR i.bill_date >= $1::date)
		  AND i.total - `+usedSQL+` > 0.5
		  AND ($3 = '' OR i.supplier_bill_no ILIKE '%' || $3 || '%' OR i.marg_no ILIKE $3 || '%'
		       OR `+supplierNameSQL+` ILIKE '%' || $3 || '%' OR m.code ILIKE $3)
		ORDER BY i.bill_date, i.invoice_key
		LIMIT 3000`, from, older, strings.TrimSpace(search))
	if err != nil {
		return nil, err
	}
	list, err := scanInvoices(rows)
	if err != nil {
		return nil, err
	}
	today := time.Now().In(time.FixedZone("IST", 5*3600+1800)).Format("2006-01-02")
	idx := map[string]int{}
	out := []SupplierDues{}
	for _, v := range list {
		key := "party:" + v.Supplier
		if v.ManufacturerID != nil {
			key = v.ManufacturerID.String()
		}
		n, ok := idx[key]
		if !ok {
			n = len(out)
			idx[key] = n
			out = append(out, SupplierDues{ManufacturerID: v.ManufacturerID, ManufacturerCode: v.ManufacturerCode, Name: v.Supplier,
				CreditDays: v.CreditDays, Invoices: []Invoice{}, Notes: []Invoice{}})
		}
		s := &out[n]
		if v.Kind == "debit_note" {
			s.Notes = append(s.Notes, v)
			s.Credits += v.Remaining
			continue
		}
		s.Invoices = append(s.Invoices, v)
		s.Outstanding += v.Remaining
		if v.DueOn != nil {
			if s.NextDue == nil || *v.DueOn < *s.NextDue {
				s.NextDue = v.DueOn
			}
			if *v.DueOn < today {
				s.Overdue += v.Remaining
			}
		}
	}
	for i := range out {
		out[i].Balance = out[i].Outstanding - out[i].Credits
	}
	// soonest due first; suppliers without a credit period (no due date) last
	sortDues(out)
	return out, nil
}

func sortDues(out []SupplierDues) {
	due := func(s SupplierDues) string {
		if s.NextDue == nil {
			return "9999"
		}
		return *s.NextDue
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && (due(out[j]) < due(out[j-1]) || (due(out[j]) == due(out[j-1]) && out[j].Name < out[j-1].Name)); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
}

// FindInvoices searches invoices and notes for linking to a payment, by
// supplier bill no., Marg no. or supplier, newest first. With a
// manufacturer, only that manufacturer's (search may then be empty); with
// openOnly, only those not yet fully used.
func FindInvoices(ctx context.Context, db *pgxpool.Pool, search string, manufacturer *uuid.UUID, openOnly bool) ([]Invoice, error) {
	search = strings.TrimSpace(search)
	if search == "" && manufacturer == nil {
		return []Invoice{}, nil
	}
	rows, err := db.Query(ctx, `
		SELECT `+invoiceColumns+`
		FROM v_purchase_invoices i `+invSupplierSQL+`
		WHERE ($2::uuid IS NULL OR m.id = $2)
		  AND (NOT $3 OR i.total - `+usedSQL+` > 0.5)
		  AND ($1 = '' OR i.supplier_bill_no ILIKE '%' || $1 || '%' OR i.marg_no ILIKE $1 || '%'
		       OR `+supplierNameSQL+` ILIKE '%' || $1 || '%')
		ORDER BY i.bill_date DESC, i.invoice_key DESC
		LIMIT 60`, search, manufacturer, openOnly)
	if err != nil {
		return nil, err
	}
	return scanInvoices(rows)
}

// Setting reads one of the register's shared settings.
func Setting(ctx context.Context, db *pgxpool.Pool, key, fallback string) string {
	var v string
	if err := db.QueryRow(ctx, `SELECT value FROM supplier_payment_settings WHERE key = $1`, key).Scan(&v); err != nil {
		return fallback
	}
	return v
}

func SetSetting(ctx context.Context, db *pgxpool.Pool, key, value string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO supplier_payment_settings (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, key, value)
	return err
}

// Supplier is a manufacturer with its credit period, the Marg parties it
// is, and why it still needs linking by hand.
type Supplier struct {
	ID          uuid.UUID   `json:"id"`
	Code        *string     `json:"code"`
	Name        string      `json:"name"`
	CreditDays  *int        `json:"credit_days"`
	MargFlag    *string     `json:"marg_flag"`
	MargParties []MargParty `json:"marg_parties"`
	Invoices    int         `json:"invoices"` // Marg purchase invoices from its parties, both years
}

// MargParty is a supplier in Marg's ledger, and the manufacturer it is
// linked to, if any.
type MargParty struct {
	PartyCode        string  `json:"party_code"`
	Name             string  `json:"name"`
	City             *string `json:"city"`
	ManufacturerCode *string `json:"manufacturer_code,omitempty"`
	ManufacturerName *string `json:"manufacturer_name,omitempty"`
}

func Suppliers(ctx context.Context, db *pgxpool.Pool) ([]Supplier, error) {
	rows, err := db.Query(ctx, `
		SELECT m.id, m.code, m.name, m.credit_days, m.marg_flag,
		       COALESCE((SELECT json_agg(json_build_object('party_code', l.party_code,
		                    'name', trim(COALESCE(NULLIF(l.short_name, ''), l.name)), 'city', NULLIF(trim(l.city), '')) ORDER BY l.party_code)
		                 FROM manufacturer_marg_parties mp JOIN marg_ede_ledger l ON l.party_code = mp.party_code
		                 WHERE mp.manufacturer_id = m.id), '[]'),
		       (SELECT COUNT(*) FROM v_purchase_invoices i JOIN manufacturer_marg_parties mp ON mp.party_code = i.party_code
		        WHERE mp.manufacturer_id = m.id AND i.kind = 'invoice')
		FROM manufacturers m ORDER BY m.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Supplier{}
	for rows.Next() {
		var s Supplier
		if err := rows.Scan(&s.ID, &s.Code, &s.Name, &s.CreditDays, &s.MargFlag, &s.MargParties, &s.Invoices); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MargParties finds Marg ledger suppliers and manufacturers by name or code.
func MargParties(ctx context.Context, db *pgxpool.Pool, search string) ([]MargParty, error) {
	rows, err := db.Query(ctx, `
		SELECT l.party_code, trim(COALESCE(NULLIF(l.short_name, ''), l.name)), NULLIF(trim(l.city), ''), m.code, m.name
		FROM marg_ede_ledger l
		LEFT JOIN manufacturer_marg_parties mp ON mp.party_code = l.party_code
		LEFT JOIN manufacturers m ON m.id = mp.manufacturer_id
		WHERE NOT l.marg_deleted AND l.kind IN ('supplier', 'manufacturer', 'expense_vendor')
		  AND (l.name ILIKE '%' || $1 || '%' OR l.party_code ILIKE $1)
		ORDER BY l.name LIMIT 25`, strings.TrimSpace(search))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MargParty{}
	for rows.Next() {
		var p MargParty
		if err := rows.Scan(&p.PartyCode, &p.Name, &p.City, &p.ManufacturerCode, &p.ManufacturerName); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

var ErrNameTaken = errors.New("another manufacturer already has that name")

// LinkMargParties sets the Marg parties a manufacturer is (taking them from
// any other manufacturer), clears its flag, and links the payments made to
// those parties. With rename, the manufacturer takes the first party's Marg
// name (or newName when given, for names Marg cut short), and every PO with
// its old name follows, each change logged on the PO.
func LinkMargParties(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, parties []string, rename bool, newName string, actor *uuid.UUID) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var oldName string
	if err := tx.QueryRow(ctx, `SELECT name FROM manufacturers WHERE id = $1 FOR UPDATE`, id).Scan(&oldName); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM manufacturer_marg_parties WHERE manufacturer_id = $1 OR party_code = ANY($2)`, id, parties); err != nil {
		return err
	}
	if len(parties) > 0 {
		if _, err := tx.Exec(ctx, `INSERT INTO manufacturer_marg_parties (party_code, manufacturer_id) SELECT unnest($2::text[]), $1`, id, parties); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE manufacturers SET marg_flag = NULL, updated_at = NOW() WHERE id = $1`, id); err != nil {
		return err
	}
	// payments to these parties now belong to this manufacturer
	if _, err := tx.Exec(ctx, `UPDATE supplier_payments SET manufacturer_id = $1, updated_at = NOW() WHERE marg_party_code = ANY($2)`, id, parties); err != nil {
		return err
	}
	if rename && len(parties) > 0 {
		name := strings.TrimSpace(newName)
		if name == "" {
			if err := tx.QueryRow(ctx, `SELECT trim(COALESCE(NULLIF(short_name, ''), name)) FROM marg_ede_ledger WHERE party_code = $1`, parties[0]).Scan(&name); err != nil {
				return err
			}
		}
		var taken bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM manufacturers WHERE id <> $1 AND lower(trim(name)) = lower(trim($2)))`, id, name).Scan(&taken); err != nil {
			return err
		}
		if taken {
			return ErrNameTaken
		}
		if name != oldName {
			if _, err := tx.Exec(ctx, `UPDATE manufacturers SET name = $2 WHERE id = $1`, id, name); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				WITH ch AS (
					UPDATE purchase_order_master SET company = $2
					WHERE lower(trim(company)) = lower(trim($1)) AND company IS DISTINCT FROM $2
					RETURNING id, po_number
				)
				INSERT INTO purchase_order_logs (po_source, po_id, po_number, field_name, old_value, new_value, actor_id)
				SELECT 'purchase_order_master', id::text, po_number, 'company', $1, $2, $3 FROM ch`, oldName, name, actor); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

func SetCreditDays(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, days *int) error {
	tag, err := db.Exec(ctx, `UPDATE manufacturers SET credit_days = $2, updated_at = NOW() WHERE id = $1`, id, days)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
