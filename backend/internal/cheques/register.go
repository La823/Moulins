package cheques

// The cheque register (migration 172): payments made to suppliers — cheques
// and transfers — split over the purchase orders they pay, with a history of
// status changes and remarks, and the POs still waiting to be paid.

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
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

// receivedSQL is true for a PO line marked received, however the sheet spelt
// it ("Received", "RECIVED", "RECEIVED\").
const receivedSQL = `regexp_replace(lower(COALESCE(po.status, '')), '[^a-z]', '', 'g') IN ('received', 'recived', 'recevied')`

// latestSQL keeps only the current revision of a revised PO.
const latestSQL = `po.is_latest_revision IS NOT FALSE`

// owedSQL is what a PO line owes: the bill amount once entered, otherwise
// received (or ordered) quantity × rate as a rough guide.
const owedSQL = `COALESCE(po.bill_amount, ROUND(COALESCE(NULLIF(po.qty_received, 0), po.quantity, 0) * COALESCE(po.rate, 0), 2))`

// paidSQL is how much of a PO line live payments cover (cancelled ones don't).
const paidSQL = `COALESCE((SELECT SUM(a.amount) FROM supplier_payment_allocations a
	JOIN supplier_payments sp ON sp.id = a.payment_id
	WHERE a.po_id = po.id AND sp.status <> 'cancelled'), 0)`

// mfrJoinSQL finds the supplier record a PO's company names.
const mfrJoinSQL = `LEFT JOIN manufacturers m ON lower(trim(m.name)) = lower(trim(po.company))`

type Allocation struct {
	POID       int      `json:"po_id"`
	PONumber   string   `json:"po_number"`
	Product    string   `json:"product"`
	Company    string   `json:"company"`
	Amount     float64  `json:"amount"`
	BillNumber *string  `json:"bill_number"`
	BillAmount *float64 `json:"bill_amount"`
	Owed       float64  `json:"owed"`
	PaidTotal  float64  `json:"paid_total"` // by every live payment, this one included
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
	ID               int64        `json:"id"`
	Method           string       `json:"method"`
	Bank             *string      `json:"bank"`
	ChequeNo         *string      `json:"cheque_no"`
	PaymentDate      *string      `json:"payment_date"`
	Payee            string       `json:"payee"`
	ManufacturerID   *uuid.UUID   `json:"manufacturer_id"`
	ManufacturerName *string      `json:"manufacturer_name"`
	Amount           float64      `json:"amount"`
	Status           string       `json:"status"`
	StatusChangedAt  time.Time    `json:"status_changed_at"`
	ChequeProfileID  *int64       `json:"cheque_profile_id"`
	Source           string       `json:"source"`
	CreatedAt        time.Time    `json:"created_at"`
	Allocated        float64      `json:"allocated"`
	PONumbers        []string     `json:"po_numbers"`
	LastRemark       *string      `json:"last_remark"`
	Allocations      []Allocation `json:"allocations,omitempty"`
	Events           []Event      `json:"events,omitempty"`
}

const paymentColumns = `
	p.id, p.method, p.bank, p.cheque_no, to_char(p.payment_date, 'YYYY-MM-DD'), p.payee, p.manufacturer_id, m.name,
	p.amount::float8, p.status, p.status_changed_at, p.cheque_profile_id, p.source, p.created_at,
	COALESCE(al.allocated, 0)::float8, COALESCE(al.pos, '{}'), rm.note`

const paymentFrom = `
	FROM supplier_payments p
	LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
	LEFT JOIN LATERAL (
		SELECT SUM(a.amount) AS allocated, array_agg(DISTINCT po.po_number ORDER BY po.po_number) AS pos
		FROM supplier_payment_allocations a JOIN purchase_order_master po ON po.id = a.po_id
		WHERE a.payment_id = p.id
	) al ON true
	LEFT JOIN LATERAL (
		SELECT e.note FROM supplier_payment_events e
		WHERE e.payment_id = p.id AND e.kind = 'remark' ORDER BY e.created_at DESC, e.id DESC LIMIT 1
	) rm ON true`

func scanPayment(row pgx.Row) (Payment, error) {
	var p Payment
	err := row.Scan(&p.ID, &p.Method, &p.Bank, &p.ChequeNo, &p.PaymentDate, &p.Payee, &p.ManufacturerID, &p.ManufacturerName,
		&p.Amount, &p.Status, &p.StatusChangedAt, &p.ChequeProfileID, &p.Source, &p.CreatedAt,
		&p.Allocated, &p.PONumbers, &p.LastRemark)
	return p, err
}

type Filter struct {
	Status string // one of Statuses, or "" for all
	Method string // "cheque", "transfer" (anything else) or ""
	Linked string // "yes", "no" or ""
	Search string
	Limit  int
	Offset int
}

// ListPayments returns a page of payments, newest first, the total matching,
// and how many payments are in each status (ignoring the status filter).
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
		add(`(p.payee ILIKE '%' || $? || '%' OR p.cheque_no ILIKE $? || '%' OR m.name ILIKE '%' || $? || '%'
			OR EXISTS (SELECT 1 FROM supplier_payment_allocations a JOIN purchase_order_master po ON po.id = a.po_id
			           WHERE a.payment_id = p.id AND (po.po_number ILIKE '%' || $? || '%' OR po.bill_number ILIKE '%' || $? || '%')))`, s)
	}
	counts := map[string]int{}
	rows, err := db.Query(ctx, `SELECT p.status, COUNT(*) `+paymentFrom+` WHERE `+strings.Join(where, " AND ")+` GROUP BY 1`, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	for rows.Next() {
		var s string
		var n int
		if err := rows.Scan(&s, &n); err != nil {
			rows.Close()
			return nil, 0, nil, err
		}
		counts[s] = n
	}
	rows.Close()

	if f.Status != "" {
		add("p.status = $?", f.Status)
	}
	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) `+paymentFrom+` WHERE `+strings.Join(where, " AND "), args...).Scan(&total); err != nil {
		return nil, 0, nil, err
	}
	args = append(args, f.Limit, f.Offset)
	rows, err = db.Query(ctx, `SELECT `+paymentColumns+paymentFrom+` WHERE `+strings.Join(where, " AND ")+`
		ORDER BY p.payment_date DESC NULLS LAST, p.id DESC
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

// GetPayment returns one payment with the POs it pays and its history.
func GetPayment(ctx context.Context, db *pgxpool.Pool, id int64) (Payment, error) {
	p, err := scanPayment(db.QueryRow(ctx, `SELECT `+paymentColumns+paymentFrom+` WHERE p.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	if err != nil {
		return p, err
	}
	rows, err := db.Query(ctx, `
		SELECT po.id, COALESCE(po.po_number, ''), COALESCE(po.product_name, ''), COALESCE(po.company, ''), a.amount::float8,
		       po.bill_number, po.bill_amount::float8, `+owedSQL+`::float8, `+paidSQL+`::float8
		FROM supplier_payment_allocations a JOIN purchase_order_master po ON po.id = a.po_id
		WHERE a.payment_id = $1 ORDER BY po.po_number, po.id`, id)
	if err != nil {
		return p, err
	}
	p.Allocations = []Allocation{}
	for rows.Next() {
		var a Allocation
		if err := rows.Scan(&a.POID, &a.PONumber, &a.Product, &a.Company, &a.Amount, &a.BillNumber, &a.BillAmount, &a.Owed, &a.PaidTotal); err != nil {
			rows.Close()
			return p, err
		}
		p.Allocations = append(p.Allocations, a)
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

// PaymentInput is a payment as the page sends it, with the POs it pays.
type PaymentInput struct {
	Method          string       `json:"method"`
	Bank            *string      `json:"bank"`
	ChequeNo        *string      `json:"cheque_no"`
	PaymentDate     *string      `json:"payment_date"`
	Payee           string       `json:"payee"`
	ManufacturerID  *uuid.UUID   `json:"manufacturer_id"`
	Amount          float64      `json:"amount"`
	Status          string       `json:"status"`
	ChequeProfileID *int64       `json:"cheque_profile_id"`
	Source          string       `json:"source"`
	Remark          string       `json:"remark"`
	Allocations     []Allocation `json:"allocations"` // po_id and amount
}

func blank(s *string) *string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil
	}
	t := strings.TrimSpace(*s)
	return &t
}

// SavePayment adds a payment (id 0) or updates one, replacing the POs it
// pays, in one transaction, and records it in the payment's history.
func SavePayment(ctx context.Context, db *pgxpool.Pool, id int64, in PaymentInput, actor *uuid.UUID) (int64, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	in.Bank, in.ChequeNo, in.PaymentDate = blank(in.Bank), blank(in.ChequeNo), blank(in.PaymentDate)
	if id == 0 {
		err = tx.QueryRow(ctx, `
			INSERT INTO supplier_payments (method, bank, cheque_no, payment_date, payee, manufacturer_id, amount, status, cheque_profile_id, source, created_by)
			VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
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
			       manufacturer_id = $7, amount = $8, updated_at = NOW()
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
		if _, err := tx.Exec(ctx, `DELETE FROM supplier_payment_allocations WHERE payment_id = $1`, id); err != nil {
			return 0, err
		}
	}
	if len(in.Allocations) > 0 {
		pos, amts := make([]int32, len(in.Allocations)), make([]float64, len(in.Allocations))
		for i, a := range in.Allocations {
			pos[i], amts[i] = int32(a.POID), a.Amount
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO supplier_payment_allocations (payment_id, po_id, amount)
			SELECT $1, t.po, t.amt FROM unnest($2::int[], $3::numeric[]) AS t(po, amt)`, id, pos, amts); err != nil {
			return 0, err
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

// Due is a PO line: what it owes, what is paid, and when it falls due.
type Due struct {
	POID           int        `json:"po_id"`
	PONumber       string     `json:"po_number"`
	PODate         *string    `json:"po_date"`
	Product        string     `json:"product"`
	Company        string     `json:"company"`
	ManufacturerID *uuid.UUID `json:"manufacturer_id"`
	Status         string     `json:"status"`
	Quantity       *float64   `json:"quantity"`
	QtyReceived    *float64   `json:"qty_received"`
	Rate           *float64   `json:"rate"`
	ReceivedOn     *string    `json:"received_on"`
	BillNumber     *string    `json:"bill_number"`
	BillDate       *string    `json:"bill_date"`
	BillAmount     *float64   `json:"bill_amount"`
	Owed           float64    `json:"owed"`
	OwedIsEstimate bool       `json:"owed_is_estimate"`
	Paid           float64    `json:"paid"`
	CreditDays     *int       `json:"credit_days"`
	DueOn          *string    `json:"due_on"`
}

const dueColumns = `
	po.id, COALESCE(po.po_number, ''), to_char(po.po_date, 'YYYY-MM-DD'), COALESCE(po.product_name, ''), COALESCE(po.company, ''), m.id,
	COALESCE(po.status, ''), po.quantity::float8, po.qty_received::float8, po.rate::float8,
	to_char(po.received_on, 'YYYY-MM-DD'), po.bill_number, to_char(po.bill_date, 'YYYY-MM-DD'), po.bill_amount::float8,
	` + owedSQL + `::float8, po.bill_amount IS NULL, ` + paidSQL + `::float8, m.credit_days,
	to_char(po.received_on + m.credit_days, 'YYYY-MM-DD')`

func scanDues(rows pgx.Rows) ([]Due, error) {
	defer rows.Close()
	out := []Due{}
	for rows.Next() {
		var d Due
		if err := rows.Scan(&d.POID, &d.PONumber, &d.PODate, &d.Product, &d.Company, &d.ManufacturerID,
			&d.Status, &d.Quantity, &d.QtyReceived, &d.Rate,
			&d.ReceivedOn, &d.BillNumber, &d.BillDate, &d.BillAmount,
			&d.Owed, &d.OwedIsEstimate, &d.Paid, &d.CreditDays, &d.DueOn); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Dues lists received PO lines not yet fully paid, soonest due first.
// Lines received before `from` count as settled unless older is set.
func Dues(ctx context.Context, db *pgxpool.Pool, from string, older bool, search string) ([]Due, error) {
	rows, err := db.Query(ctx, `
		SELECT `+dueColumns+`
		FROM purchase_order_master po `+mfrJoinSQL+`
		WHERE `+latestSQL+` AND `+receivedSQL+`
		  AND ($2 OR po.received_on >= $1::date)
		  AND `+owedSQL+` - `+paidSQL+` > 0.5
		  AND ($3 = '' OR po.po_number ILIKE '%' || $3 || '%' OR po.company ILIKE '%' || $3 || '%'
		       OR po.product_name ILIKE '%' || $3 || '%' OR po.bill_number ILIKE '%' || $3 || '%')
		ORDER BY (po.received_on + m.credit_days) NULLS LAST, po.received_on, po.company, po.po_number
		LIMIT 1000`, from, older, strings.TrimSpace(search))
	if err != nil {
		return nil, err
	}
	return scanDues(rows)
}

// FindPOs searches every current PO line, received or not and paid or not,
// for linking to a payment or marking goods received.
func FindPOs(ctx context.Context, db *pgxpool.Pool, search string, openOnly bool) ([]Due, error) {
	rows, err := db.Query(ctx, `
		SELECT `+dueColumns+`
		FROM purchase_order_master po `+mfrJoinSQL+`
		WHERE `+latestSQL+` AND lower(COALESCE(po.status, '')) NOT LIKE 'cancel%'
		  AND (NOT $2 OR NOT `+receivedSQL+`)
		  AND (po.po_number ILIKE '%' || $1 || '%' OR po.company ILIKE '%' || $1 || '%'
		       OR po.product_name ILIKE '%' || $1 || '%' OR po.bill_number ILIKE '%' || $1 || '%')
		ORDER BY po.po_date DESC NULLS LAST, po.id DESC
		LIMIT 40`, strings.TrimSpace(search), openOnly)
	if err != nil {
		return nil, err
	}
	return scanDues(rows)
}

// Receipt is the goods arriving for a PO line, with the supplier's bill.
type Receipt struct {
	ReceivedOn  string   `json:"received_on"`
	QtyReceived *float64 `json:"qty_received"`
	BillNumber  *string  `json:"bill_number"`
	BillDate    *string  `json:"bill_date"`
	BillAmount  *float64 `json:"bill_amount"`
}

// Receive marks a PO line received (status Received, from that day) and
// stores the bill, logging each change in the PO's own history.
func Receive(ctx context.Context, db *pgxpool.Pool, poID int, rc Receipt, actor *uuid.UUID) error {
	var poNumber, oldStatus, oldBill, oldReceived, oldBillDate, oldAmount, oldQty *string
	err := db.QueryRow(ctx, `
		SELECT po_number, status, bill_number, to_char(received_on, 'YYYY-MM-DD'), to_char(bill_date, 'YYYY-MM-DD'), bill_amount::text, qty_received::text
		FROM purchase_order_master WHERE id = $1`, poID).
		Scan(&poNumber, &oldStatus, &oldBill, &oldReceived, &oldBillDate, &oldAmount, &oldQty)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	rc.BillNumber, rc.BillDate = blank(rc.BillNumber), blank(rc.BillDate)
	var newAmount, newQty *string
	if _, err := db.Exec(ctx, `
		UPDATE purchase_order_master
		SET status = 'Received', received_on = $2::date, qty_received = COALESCE($3, qty_received),
		    bill_number = $4, bill_date = $5::date, bill_amount = $6
		WHERE id = $1`, poID, rc.ReceivedOn, rc.QtyReceived, rc.BillNumber, rc.BillDate, rc.BillAmount); err != nil {
		return err
	}
	if err := db.QueryRow(ctx, `SELECT bill_amount::text, qty_received::text FROM purchase_order_master WHERE id = $1`, poID).Scan(&newAmount, &newQty); err != nil {
		return err
	}
	id, received := strconv.Itoa(poID), "Received"
	log := func(field string, old, new *string) {
		if (old == nil) != (new == nil) || (old != nil && *old != *new) {
			models.LogPOFieldChange(ctx, db, models.POSourceMaster, id, poNumber, field, old, new, actor)
		}
	}
	log("status", oldStatus, &received)
	log("received_on", oldReceived, &rc.ReceivedOn)
	log("qty_received", oldQty, newQty)
	log("bill_number", oldBill, rc.BillNumber)
	log("bill_date", oldBillDate, rc.BillDate)
	log("bill_amount", oldAmount, newAmount)
	return nil
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

// Supplier is a manufacturer with its credit period.
type Supplier struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	CreditDays *int      `json:"credit_days"`
}

func Suppliers(ctx context.Context, db *pgxpool.Pool) ([]Supplier, error) {
	rows, err := db.Query(ctx, `SELECT id, name, credit_days FROM manufacturers ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Supplier{}
	for rows.Next() {
		var s Supplier
		if err := rows.Scan(&s.ID, &s.Name, &s.CreditDays); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func SetCreditDays(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, days *int) error {
	tag, err := db.Exec(ctx, `UPDATE manufacturers SET credit_days = $2, updated_at = NOW() WHERE id = $1`, id, days)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
