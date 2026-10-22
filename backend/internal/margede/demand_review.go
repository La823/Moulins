package margede

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Working through the demand list: purchase orders linked to a product,
// snoozes and remarks (tables in migration 166). A product that needs
// ordering is "on order" while one of its linked POs is open, "snoozed"
// until its snooze date, otherwise "to review". See demand.go.

// poClosed matches purchase_order_master statuses that are done with: the
// sheet-era data spells received many ways (RECEIVED, RECIVED, RECEVIED,
// received, "RECEIVED\").
const poClosed = `upper(COALESCE(%s, '')) ~ '^(REC[EI]*V[EI]*D|CANCEL|REVISED)'`

func poClosedExpr(col string) string { return strings.Replace(poClosed, "%s", col, 1) }

// DemandPO is a purchase order linked to a product, as its latest revision.
type DemandPO struct {
	LinkID      int64      `json:"link_id"`
	PONumber    string     `json:"po_number"`
	Found       bool       `json:"found"` // the PO still exists
	POID        *int64     `json:"po_id"`
	Date        *time.Time `json:"date"`
	Product     *string    `json:"product"` // as written on the PO
	Company     *string    `json:"company"`
	Qty         *float64   `json:"qty"`
	Received    *float64   `json:"received"`
	Status      *string    `json:"status"`
	Open        bool       `json:"open"`
	LinkedBy    *string    `json:"linked_by"`
	LinkedAt    time.Time  `json:"linked_at"`
	OutstandQty float64    `json:"outstanding_qty"` // ordered, not yet received (open POs)
}

// DemandSnooze is a snooze on a product.
type DemandSnooze struct {
	Until  time.Time `json:"until"`
	Reason *string   `json:"reason"`
	By     *string   `json:"by"`
	At     time.Time `json:"at"`
	// EndedEarly: the snooze was cut short because the product ran out.
	EndedEarly bool `json:"ended_early,omitempty"`
}

// DemandRemark is one remark.
type DemandRemark struct {
	ID   int64     `json:"id"`
	Body string    `json:"body"`
	By   *string   `json:"by"`
	ByID *string   `json:"by_id"`
	At   time.Time `json:"at"`
}

// snoozeReminderDays is how long a finished snooze is still pointed out.
const snoozeReminderDays = 14

// attachReviews adds POs, snoozes and remarks to the demand rows and works
// out each row's review state. One query per kind for all products.
func attachReviews(ctx context.Context, db *pgxpool.Pool, out *DemandList) error {
	idx := map[int64]*DemandRow{}
	for i := range out.Rows {
		out.Rows[i].POs = []DemandPO{}
		idx[out.Rows[i].ProductPID] = &out.Rows[i]
	}

	rows, err := db.Query(ctx, `
		SELECT l.id, l.product_pid, l.po_number, l.created_at, u.username,
		       po.id::int8, po.po_date, po.product_name, po.company, po.quantity::float8,
		       po.qty_received::float8, po.status, COALESCE(NOT (`+poClosedExpr("po.status")+`), FALSE)
		FROM marg_demand_po_links l
		LEFT JOIN users u ON u.id = l.created_by
		LEFT JOIN LATERAL (
			SELECT m.* FROM purchase_order_master m WHERE m.po_number = l.po_number
			ORDER BY m.is_latest_revision DESC, m.revision_number DESC, m.id DESC LIMIT 1
		) po ON TRUE
		WHERE l.removed_at IS NULL
		ORDER BY l.created_at`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var pid int64
		var p DemandPO
		if err := rows.Scan(&p.LinkID, &pid, &p.PONumber, &p.LinkedAt, &p.LinkedBy,
			&p.POID, &p.Date, &p.Product, &p.Company, &p.Qty, &p.Received, &p.Status, &p.Open); err != nil {
			rows.Close()
			return err
		}
		p.Found = p.POID != nil
		if p.Open && p.Qty != nil {
			got := 0.0
			if p.Received != nil {
				got = *p.Received
			}
			p.OutstandQty = math.Max(*p.Qty-got, 0)
		}
		if r := idx[pid]; r != nil {
			r.POs = append(r.POs, p)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// The latest snooze or unsnooze of each product decides.
	rows, err = db.Query(ctx, `
		SELECT DISTINCT ON (g.product_pid) g.product_pid, g.kind, g.snooze_until, g.body, u.username, g.created_at
		FROM marg_demand_log g
		LEFT JOIN users u ON u.id = g.created_by
		WHERE g.kind IN ('snooze', 'unsnooze') AND g.deleted_at IS NULL
		ORDER BY g.product_pid, g.created_at DESC, g.id DESC`)
	if err != nil {
		return err
	}
	today := time.Now().In(istZone)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	for rows.Next() {
		var pid int64
		var kind string
		var s DemandSnooze
		var until *time.Time
		if err := rows.Scan(&pid, &kind, &until, &s.Reason, &s.By, &s.At); err != nil {
			rows.Close()
			return err
		}
		r := idx[pid]
		if r == nil || kind != "snooze" || until == nil {
			continue
		}
		s.Until = *until
		switch {
		case s.Until.After(today) && r.Stock <= 0:
			s.EndedEarly = true
			r.SnoozeEnded = &s
		case s.Until.After(today):
			r.Snooze = &s
		case !s.Until.Before(today.AddDate(0, 0, -snoozeReminderDays)):
			r.SnoozeEnded = &s
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = db.Query(ctx, `
		SELECT DISTINCT ON (g.product_pid) g.product_pid, g.id, g.body, u.username, g.created_by::text, g.created_at,
		       COUNT(*) OVER (PARTITION BY g.product_pid)
		FROM marg_demand_log g
		LEFT JOIN users u ON u.id = g.created_by
		WHERE g.kind = 'remark' AND g.deleted_at IS NULL
		ORDER BY g.product_pid, g.created_at DESC, g.id DESC`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var pid int64
		var m DemandRemark
		var n int
		if err := rows.Scan(&pid, &m.ID, &m.Body, &m.By, &m.ByID, &m.At, &n); err != nil {
			rows.Close()
			return err
		}
		if r := idx[pid]; r != nil {
			r.LastRemark = &m
			r.RemarksCount = n
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	out.ToReview, out.OnOrder, out.Snoozed = 0, 0, 0
	for i := range out.Rows {
		r := &out.Rows[i]
		for _, p := range r.POs {
			if p.Open {
				r.OpenPOQty += p.OutstandQty
				r.HasOpenPO = true
			}
		}
		r.StillToOrder = math.Max(r.SuggestedQty-r.OpenPOQty, 0)
		switch {
		case !r.NeedsOrder:
			r.Review = "ok"
		case r.HasOpenPO:
			r.Review = "on_order"
			out.OnOrder++
		case r.Snooze != nil:
			r.Review = "snoozed"
			out.Snoozed++
		default:
			r.Review = "to_review"
			out.ToReview++
		}
	}
	return nil
}

// ErrPONotFound: no purchase order has that number.
var ErrPONotFound = errors.New("no purchase order with that number")

// LinkPO links a purchase order (by number) to a product.
func LinkPO(ctx context.Context, db *pgxpool.Pool, pid int64, poNumber string, by uuid.UUID) error {
	poNumber = strings.TrimSpace(poNumber)
	var exists bool
	if err := db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM purchase_order_master WHERE po_number = $1)`, poNumber).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrPONotFound
	}
	_, err := db.Exec(ctx, `
		INSERT INTO marg_demand_po_links (product_pid, po_number, created_by) VALUES ($1, $2, $3)
		ON CONFLICT (product_pid, po_number) WHERE removed_at IS NULL DO NOTHING`, pid, poNumber, by)
	return err
}

// UnlinkPO removes a link (kept as history).
func UnlinkPO(ctx context.Context, db *pgxpool.Pool, pid, linkID int64, by uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		UPDATE marg_demand_po_links SET removed_at = now(), removed_by = $3
		WHERE id = $1 AND product_pid = $2 AND removed_at IS NULL`, linkID, pid, by)
	if err == nil && tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

// AddRemark adds a remark to a product.
func AddRemark(ctx context.Context, db *pgxpool.Pool, pid int64, body string, by uuid.UUID) error {
	_, err := db.Exec(ctx, `INSERT INTO marg_demand_log (product_pid, kind, body, created_by) VALUES ($1, 'remark', $2, $3)`,
		pid, strings.TrimSpace(body), by)
	return err
}

// DeleteRemark soft-deletes a remark; only its author can.
func DeleteRemark(ctx context.Context, db *pgxpool.Pool, pid, id int64, by uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		UPDATE marg_demand_log SET deleted_at = now()
		WHERE id = $1 AND product_pid = $2 AND kind = 'remark' AND created_by = $3 AND deleted_at IS NULL`, id, pid, by)
	if err == nil && tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

// Snooze hides a product from "To review" until the given day.
func Snooze(ctx context.Context, db *pgxpool.Pool, pid int64, until time.Time, reason string, by uuid.UUID) error {
	var body *string
	if r := strings.TrimSpace(reason); r != "" {
		body = &r
	}
	_, err := db.Exec(ctx, `INSERT INTO marg_demand_log (product_pid, kind, snooze_until, body, created_by) VALUES ($1, 'snooze', $2, $3, $4)`,
		pid, until, body, by)
	return err
}

// Unsnooze ends a product's snooze now.
func Unsnooze(ctx context.Context, db *pgxpool.Pool, pid int64, by uuid.UUID) error {
	_, err := db.Exec(ctx, `INSERT INTO marg_demand_log (product_pid, kind, created_by) VALUES ($1, 'unsnooze', $2)`, pid, by)
	return err
}

// DemandEvent is one entry of a product's history.
type DemandEvent struct {
	Kind     string     `json:"kind"` // remark | snooze | unsnooze | po_linked | po_unlinked
	ID       int64      `json:"id"`
	Body     *string    `json:"body"`
	Until    *time.Time `json:"until,omitempty"`
	PONumber *string    `json:"po_number,omitempty"`
	By       *string    `json:"by"`
	ByID     *string    `json:"by_id"`
	At       time.Time  `json:"at"`
}

// DemandHistory returns a product's remarks, snoozes and PO links, newest first.
func DemandHistory(ctx context.Context, db *pgxpool.Pool, pid int64) ([]DemandEvent, error) {
	rows, err := db.Query(ctx, `
		SELECT kind, id, body, until, po_number, by, by_id, at FROM (
			SELECT g.kind, g.id, g.body, g.snooze_until AS until, NULL::text AS po_number,
			       u.username AS by, g.created_by::text AS by_id, g.created_at AS at
			FROM marg_demand_log g LEFT JOIN users u ON u.id = g.created_by
			WHERE g.product_pid = $1 AND g.deleted_at IS NULL
			UNION ALL
			SELECT 'po_linked', l.id, NULL, NULL, l.po_number, u.username, l.created_by::text, l.created_at
			FROM marg_demand_po_links l LEFT JOIN users u ON u.id = l.created_by
			WHERE l.product_pid = $1
			UNION ALL
			SELECT 'po_unlinked', l.id, NULL, NULL, l.po_number, u.username, l.removed_by::text, l.removed_at
			FROM marg_demand_po_links l LEFT JOIN users u ON u.id = l.removed_by
			WHERE l.product_pid = $1 AND l.removed_at IS NOT NULL
		) e ORDER BY at DESC, id DESC`, pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DemandEvent{}
	for rows.Next() {
		var e DemandEvent
		if err := rows.Scan(&e.Kind, &e.ID, &e.Body, &e.Until, &e.PONumber, &e.By, &e.ByID, &e.At); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// POOption is a purchase order offered when linking.
type POOption struct {
	PONumber string     `json:"po_number"`
	Date     *time.Time `json:"date"`
	Product  *string    `json:"product"`
	Company  *string    `json:"company"`
	Qty      *float64   `json:"qty"`
	Status   *string    `json:"status"`
	Open     bool       `json:"open"`
}

// SearchPOs finds purchase orders by number or product name (latest
// revision of each number), open ones first, newest first.
func SearchPOs(ctx context.Context, db *pgxpool.Pool, q string) ([]POOption, error) {
	rows, err := db.Query(ctx, `
		SELECT po_number, po_date, product_name, company, quantity::float8, status, open FROM (
			SELECT DISTINCT ON (m.po_number) m.po_number, m.po_date, m.product_name, m.company, m.quantity, m.status,
			       NOT (`+poClosedExpr("m.status")+`) AS open
			FROM purchase_order_master m
			WHERE m.po_number IS NOT NULL AND TRIM(m.po_number) <> ''
			  AND ($1 = '' OR m.po_number ILIKE '%' || $1 || '%' OR m.product_name ILIKE '%' || $1 || '%')
			ORDER BY m.po_number, m.is_latest_revision DESC, m.revision_number DESC, m.id DESC
		) x
		ORDER BY open DESC, po_date DESC NULLS LAST, po_number DESC
		LIMIT 20`, strings.TrimSpace(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []POOption{}
	for rows.Next() {
		var o POOption
		if err := rows.Scan(&o.PONumber, &o.Date, &o.Product, &o.Company, &o.Qty, &o.Status, &o.Open); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
