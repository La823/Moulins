package packing

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lavanyaarora/server/internal/aiusage"
	"github.com/lavanyaarora/server/internal/utils"
)

// Packing (migration 187): the dispatch team packs orders line by line.
// Order flow: pending -> confirmed -> packing ("sent to packing", set by an
// employee) -> packed -> shipped, or cancelled. The dispatch team sees and
// packs only orders sent to packing. Each line gets a photo of its batch
// print, read by Gemini and compared with the batch expected; a line can be
// ticked only after a match (or an admin's override), and when every line is
// ticked the order goes from packing to packed. Every step is logged with
// who did it.

// StatusToPack is the order status "sent to packing": the orders the
// dispatch team sees and packs.
const StatusToPack = "packing"

var (
	ErrNotFound    = errors.New("packing: not found")
	ErrNotPackable = errors.New("packing: only orders sent to packing can be packed")
	ErrNotChecked  = errors.New("packing: this product's batch has not been matched yet")
	ErrNotAllDone  = errors.New("packing: not every product is ticked")
)

// Item is one order line as the packer sees it.
type Item struct {
	OrderItemID   string `json:"order_item_id"`
	ProductID     string `json:"product_id"`
	ProductName   string `json:"product_name"`
	Quantity      int    `json:"quantity"`
	MargLinked    bool   `json:"marg_linked"`
	ExpectedBatch string `json:"expected_batch,omitempty"` // empty: none chosen on the order
	ExpectedExp   string `json:"expected_expiry,omitempty"`
	KnownBatches  int    `json:"known_batches"` // the product's live Marg batches

	PhotoURL       string     `json:"photo_url,omitempty"`
	ReadBatch      string     `json:"read_batch,omitempty"`
	ReadExpiry     string     `json:"read_expiry,omitempty"`
	ReadProduct    string     `json:"read_product,omitempty"`
	ReadSource     string     `json:"read_source,omitempty"` // ai or typed
	Result         string     `json:"result,omitempty"`      // match, mismatch, unreadable, unchecked; empty: not checked
	ResultNote     string     `json:"result_note,omitempty"`
	CheckedBy      string     `json:"checked_by,omitempty"`
	CheckedAt      *time.Time `json:"checked_at,omitempty"`
	OverrideBy     string     `json:"override_by,omitempty"`
	OverrideReason string     `json:"override_reason,omitempty"`
	OverrideAt     *time.Time `json:"override_at,omitempty"`
	Packed         bool       `json:"packed"`
	PackedBy       string     `json:"packed_by,omitempty"`
	PackedAt       *time.Time `json:"packed_at,omitempty"`
	// QtyChanged: ticked, but the line's quantity has changed since, so it
	// needs ticking again.
	QtyChanged bool `json:"qty_changed,omitempty"`
	// CanTick: the batch matched, or there was nothing to match against, or
	// an admin let it through.
	CanTick bool `json:"can_tick"`
	// The latest photo's read (ai_usage); nil for a typed batch or no photo.
	PhotoUsage *PhotoUsage `json:"photo_usage,omitempty"`
}

// PhotoUsage is a photo's size and what reading it used.
type PhotoUsage struct {
	ImageBytes     int     `json:"image_bytes"`
	ImageWidth     int     `json:"image_width"`
	ImageHeight    int     `json:"image_height"`
	PromptTokens   int     `json:"prompt_tokens"`
	ImageTokens    int     `json:"image_tokens"`
	OutputTokens   int     `json:"output_tokens"`
	ThinkingTokens int     `json:"thinking_tokens"`
	TotalTokens    int     `json:"total_tokens"`
	CostUSD        float64 `json:"cost_usd"`
	DurationMs     int     `json:"duration_ms"`
}

// LogEntry is one step in an order's packing.
type LogEntry struct {
	At       time.Time `json:"at"`
	User     string    `json:"user"`
	Action   string    `json:"action"`
	Product  string    `json:"product,omitempty"`
	Detail   string    `json:"detail,omitempty"`
	PhotoURL string    `json:"photo_url,omitempty"`
}

// Order is one order's packing.
type Order struct {
	ID            string     `json:"id"`
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
	Customer      string     `json:"customer"`
	Phone         string     `json:"phone,omitempty"`
	City          string     `json:"city,omitempty"`
	TransportMode string     `json:"transport_mode,omitempty"`
	TransportName string     `json:"transport_name,omitempty"`
	Notes         string     `json:"notes,omitempty"`
	MargOrderNo   string     `json:"marg_order_no,omitempty"`
	AssignedTo    string     `json:"assigned_to,omitempty"`
	AssignedToID  string     `json:"assigned_to_id,omitempty"`
	PackedAt      *time.Time `json:"packed_at,omitempty"`
	PackedBy      string     `json:"packed_by,omitempty"`
	Items         []Item     `json:"items"`
	Ticked        int        `json:"ticked"`
	CanFinish     bool       `json:"can_finish"`
	Log           []LogEntry `json:"log"`
}

// ListRow is one order in the packing lists.
type ListRow struct {
	ID        string     `json:"id"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	Customer  string     `json:"customer"`
	City      string     `json:"city,omitempty"`
	Items     int        `json:"items"`
	Ticked    int        `json:"ticked"`
	Started   bool       `json:"started"`
	PackedAt  *time.Time `json:"packed_at,omitempty"`
	PackedBy  string     `json:"packed_by,omitempty"`
	// who the rotation (or a person) gave it to; Mine: the viewer
	AssignedTo   string `json:"assigned_to,omitempty"`
	AssignedToID string `json:"assigned_to_id,omitempty"`
	Mine         bool   `json:"mine"`
}

func photoURL(key *string) string {
	if key == nil || *key == "" {
		return ""
	}
	return utils.GetPublicURL(*key)
}

func str(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// List returns the orders to pack (sent to packing; the viewer's own
// first, then oldest first) or, for view "packed", the last 100 packed
// orders, newest first.
func List(ctx context.Context, db *pgxpool.Pool, view string, viewer uuid.UUID) ([]ListRow, error) {
	where, order := `o.status = '`+StatusToPack+`'`, `(o.packing_assigned_to IS NOT DISTINCT FROM $1) DESC, o.created_at`
	if view == "packed" {
		where, order = `o.status = 'packed'`, `o.packed_at DESC NULLS LAST, o.updated_at DESC`
	}
	rows, err := db.Query(ctx, `
		SELECT o.id::text, o.status, o.created_at, COALESCE(NULLIF(u.username, ''), u.phone_number, ''), COALESCE(u.city, ''),
		       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int,
		       (SELECT COUNT(*) FROM order_items oi JOIN order_item_packing k ON k.order_item_id = oi.id
		        WHERE oi.order_id = o.id AND k.packed_at IS NOT NULL AND k.packed_qty = oi.quantity)::int,
		       EXISTS (SELECT 1 FROM order_packing_log l WHERE l.order_id = o.id),
		       o.packed_at, COALESCE(pu.username, ''),
		       COALESCE(NULLIF(au.username, ''), au.phone_number, ''), COALESCE(o.packing_assigned_to::text, ''),
		       o.packing_assigned_to IS NOT DISTINCT FROM $1
		FROM orders o
		LEFT JOIN users u ON u.id = o.user_id
		LEFT JOIN users pu ON pu.id = o.packed_by
		LEFT JOIN users au ON au.id = o.packing_assigned_to
		WHERE `+where+`
		ORDER BY `+order+`
		LIMIT 100`, viewer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ListRow{}
	for rows.Next() {
		var r ListRow
		if err := rows.Scan(&r.ID, &r.Status, &r.CreatedAt, &r.Customer, &r.City, &r.Items, &r.Ticked, &r.Started, &r.PackedAt, &r.PackedBy,
			&r.AssignedTo, &r.AssignedToID, &r.Mine); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// expectation is what a line's batch should be.
type expectation struct {
	linked bool
	batch  string   // printed batch chosen on the order; empty if none
	expiry string   // its expiry
	known  []string // the product's live batches
}

// expectations works out every line's expected batch in one query: the
// batch chosen on the order (selected_batch_code is a Marg batch code; the
// pack shows its curbatch) and the product's live batches. Batch codes
// repeat across products, so they are matched within the product's own
// base code.
func expectations(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) (map[string]*expectation, error) {
	rows, err := db.Query(ctx, `
		SELECT oi.id::text, oi.selected_batch_code, b.code, COALESCE(b.curbatch, ''), COALESCE(b.exp, ''), b.is_deleted
		FROM order_items oi
		JOIN products pr ON pr.id = oi.product_id AND COALESCE(pr.marg_code, '') <> ''
		JOIN margmaster_products mp ON mp.base_code = pr.marg_code
		LEFT JOIN margmaster_product_batches b ON b.margmaster_product_id = mp.id
		WHERE oi.order_id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*expectation{}
	for rows.Next() {
		var id, cur, exp string
		var selected, code *string
		var deleted *bool
		if err := rows.Scan(&id, &selected, &code, &cur, &exp, &deleted); err != nil {
			return nil, err
		}
		e := out[id]
		if e == nil {
			e = &expectation{linked: true}
			out[id] = e
		}
		if code == nil {
			continue
		}
		if selected != nil && *selected != "" && *code == *selected && e.batch == "" {
			e.batch, e.expiry = cur, exp
		}
		if deleted != nil && !*deleted && cur != "" {
			e.known = append(e.known, cur)
		}
	}
	return out, rows.Err()
}

// Get returns an order's packing: its lines (alphabetical, as on the
// challan), each line's expected batch and latest check, and the log.
func Get(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) (*Order, error) {
	var (
		o        Order
		items    []Item
		log      []LogEntry
		exp      map[string]*expectation
		errs     [4]error
		wg       sync.WaitGroup
		notFound bool
	)
	wg.Add(4)
	go func() {
		defer wg.Done()
		var phone, city, mode, tname, notes, margNo, packedBy *string
		err := db.QueryRow(ctx, `
			SELECT o.id::text, o.status, o.created_at, COALESCE(NULLIF(u.username, ''), u.phone_number, ''), u.phone_number, u.city,
			       o.transport_mode, t.name, o.notes, o.marg_order_no, o.packed_at, pu.username,
			       COALESCE(NULLIF(au.username, ''), au.phone_number, ''), COALESCE(o.packing_assigned_to::text, '')
			FROM orders o
			LEFT JOIN users u ON u.id = o.user_id
			LEFT JOIN users pu ON pu.id = o.packed_by
			LEFT JOIN users au ON au.id = o.packing_assigned_to
			LEFT JOIN transports t ON t.id = o.transport_id
			WHERE o.id = $1`, orderID).Scan(&o.ID, &o.Status, &o.CreatedAt, &o.Customer, &phone, &city,
			&mode, &tname, &notes, &margNo, &o.PackedAt, &packedBy, &o.AssignedTo, &o.AssignedToID)
		if errors.Is(err, pgx.ErrNoRows) {
			notFound = true
			return
		}
		o.Phone, o.City, o.TransportMode, o.TransportName, o.Notes, o.MargOrderNo, o.PackedBy =
			str(phone), str(city), str(mode), str(tname), str(notes), str(margNo), str(packedBy)
		errs[0] = err
	}()
	go func() {
		defer wg.Done()
		items, errs[1] = loadItems(ctx, db, orderID)
	}()
	go func() {
		defer wg.Done()
		log, errs[2] = loadLog(ctx, db, orderID)
	}()
	go func() {
		defer wg.Done()
		exp, errs[3] = expectations(ctx, db, orderID)
	}()
	wg.Wait()
	if notFound {
		return nil, ErrNotFound
	}
	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}
	for i := range items {
		it := &items[i]
		if e := exp[it.OrderItemID]; e != nil {
			it.MargLinked = true
			it.ExpectedBatch, it.ExpectedExp, it.KnownBatches = e.batch, MargExpiryLabel(e.expiry), len(e.known)
		}
		if it.Packed {
			o.Ticked++
		}
	}
	o.Items, o.Log = items, log
	o.CanFinish = o.Status == StatusToPack && len(items) > 0 && o.Ticked == len(items)
	return &o, nil
}

func loadItems(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) ([]Item, error) {
	rows, err := db.Query(ctx, `
		SELECT oi.id::text, oi.product_id::text,
		       CASE WHEN oi.product_name <> '' THEN oi.product_name ELSE COALESCE(p.name, '') END AS name,
		       oi.quantity,
		       k.photo_key, k.read_batch, k.read_expiry, k.read_product, k.read_source, k.result, k.result_note,
		       cu.username, k.checked_at, ou.username, k.override_reason, k.override_at,
		       k.packed_qty, pu.username, k.packed_at,
		       au.image_bytes, au.image_width, au.image_height, au.prompt_tokens, au.image_tokens, au.output_tokens,
		       au.thinking_tokens, au.total_tokens, au.cost_usd::float8, au.duration_ms
		FROM order_items oi
		LEFT JOIN products p ON p.id = oi.product_id
		LEFT JOIN order_item_packing k ON k.order_item_id = oi.id
		LEFT JOIN users cu ON cu.id = k.checked_by
		LEFT JOIN users ou ON ou.id = k.override_by
		LEFT JOIN users pu ON pu.id = k.packed_by
		LEFT JOIN LATERAL (
			SELECT * FROM ai_usage a WHERE k.photo_key IS NOT NULL AND a.photo_key = k.photo_key
			ORDER BY a.id DESC LIMIT 1
		) au ON TRUE
		WHERE oi.order_id = $1
		ORDER BY lower(CASE WHEN oi.product_name <> '' THEN oi.product_name ELSE COALESCE(p.name, '') END), oi.id`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		var photo, rb, re, rp, rs, res, note, cby, oby, oreason, pby *string
		var pqty *int
		var ub, uw, uh, upt, uit, uot, utt, utot, ums *int
		var ucost *float64
		if err := rows.Scan(&it.OrderItemID, &it.ProductID, &it.ProductName, &it.Quantity,
			&photo, &rb, &re, &rp, &rs, &res, &note, &cby, &it.CheckedAt, &oby, &oreason, &it.OverrideAt,
			&pqty, &pby, &it.PackedAt,
			&ub, &uw, &uh, &upt, &uit, &uot, &utt, &utot, &ucost, &ums); err != nil {
			return nil, err
		}
		if utot != nil {
			n := func(p *int) int {
				if p == nil {
					return 0
				}
				return *p
			}
			it.PhotoUsage = &PhotoUsage{ImageBytes: n(ub), ImageWidth: n(uw), ImageHeight: n(uh), PromptTokens: n(upt),
				ImageTokens: n(uit), OutputTokens: n(uot), ThinkingTokens: n(utt), TotalTokens: n(utot), DurationMs: n(ums)}
			if ucost != nil {
				it.PhotoUsage.CostUSD = *ucost
			}
		}
		it.PhotoURL, it.ReadBatch, it.ReadExpiry, it.ReadProduct, it.ReadSource = photoURL(photo), str(rb), str(re), str(rp), str(rs)
		it.Result, it.ResultNote, it.CheckedBy, it.OverrideBy, it.OverrideReason = str(res), str(note), str(cby), str(oby), str(oreason)
		it.PackedBy = str(pby)
		it.CanTick = it.Result == ResultMatch || it.Result == ResultUnchecked || it.OverrideAt != nil
		if it.PackedAt != nil {
			if pqty != nil && *pqty == it.Quantity {
				it.Packed = true
			} else {
				it.QtyChanged = true
			}
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func loadLog(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID) ([]LogEntry, error) {
	rows, err := db.Query(ctx, `
		SELECT l.created_at, COALESCE(NULLIF(u.username, ''), u.phone_number, ''), l.action,
		       COALESCE(l.product_name, ''), COALESCE(l.detail, ''), l.photo_key
		FROM order_packing_log l
		LEFT JOIN users u ON u.id = l.user_id
		WHERE l.order_id = $1
		ORDER BY l.created_at DESC, l.id DESC`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LogEntry{}
	for rows.Next() {
		var e LogEntry
		var key *string
		if err := rows.Scan(&e.At, &e.User, &e.Action, &e.Product, &e.Detail, &key); err != nil {
			return nil, err
		}
		e.PhotoURL = photoURL(key)
		out = append(out, e)
	}
	return out, rows.Err()
}

// line is what checking one line needs.
type line struct {
	status      string
	productName string
	quantity    int
	exp         expectation
}

func loadLine(ctx context.Context, db *pgxpool.Pool, orderID, itemID uuid.UUID) (*line, error) {
	var l line
	err := db.QueryRow(ctx, `
		SELECT o.status, CASE WHEN oi.product_name <> '' THEN oi.product_name ELSE COALESCE(p.name, '') END, oi.quantity
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		LEFT JOIN products p ON p.id = oi.product_id
		WHERE oi.id = $1 AND oi.order_id = $2`, itemID, orderID).Scan(&l.status, &l.productName, &l.quantity)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if l.status != StatusToPack {
		return &l, ErrNotPackable
	}
	exp, err := expectations(ctx, db, orderID)
	if err != nil {
		return nil, err
	}
	if e := exp[itemID.String()]; e != nil {
		l.exp = *e
	}
	return &l, nil
}

// CheckResult is what a photo (or a typed batch) came to.
type CheckResult struct {
	Result      string `json:"result"`
	Note        string `json:"note,omitempty"`
	ReadBatch   string `json:"read_batch,omitempty"`
	ReadExpiry  string `json:"read_expiry,omitempty"`
	ReadProduct string `json:"read_product,omitempty"`
	Expected    string `json:"expected_batch,omitempty"`
	PhotoURL    string `json:"photo_url,omitempty"`
	// the photo and what reading it used
	Usage *PhotoUsage `json:"usage,omitempty"`
}

// CheckPhoto stores a line's batch photo, has it read, compares the reading
// with the expected batch and records the result (replacing any earlier
// check, tick and override on the line).
func CheckPhoto(ctx context.Context, db *pgxpool.Pool, orderID, itemID, userID uuid.UUID, image []byte, mimeType string) (*CheckResult, error) {
	l, err := loadLine(ctx, db, orderID, itemID)
	if err != nil {
		return nil, err
	}
	ext := ".jpg"
	if mimeType == "image/png" {
		ext = ".png"
	}
	key := fmt.Sprintf("packing/%s/%s-%d%s", orderID, itemID, time.Now().UnixMilli(), ext)
	if err := utils.UploadToS3(key, image, mimeType); err != nil {
		return nil, fmt.Errorf("packing: store photo: %w", err)
	}
	readCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	started := time.Now()
	r, usage, readErr := readPack(readCtx, image, mimeType, l.productName)
	took := time.Since(started)
	w, h := imageSize(image)
	oid, iid := orderID, itemID
	if err := aiusage.Record(ctx, db, aiusage.Call{
		Feature: aiusage.FeaturePackingBatchRead, UserID: userID, OrderID: &oid, OrderItemID: &iid, PhotoKey: key,
		ImageBytes: len(image), ImageWidth: w, ImageHeight: h, MimeType: mimeType, Usage: usage, Duration: took, Err: readErr,
	}); err != nil {
		log.Printf("packing: record ai usage: %v", err) // never stops the packing
	}
	res := &CheckResult{PhotoURL: utils.GetPublicURL(key), Expected: l.exp.batch, Usage: &PhotoUsage{
		ImageBytes: len(image), ImageWidth: w, ImageHeight: h, PromptTokens: usage.PromptTokens, ImageTokens: usage.ImageTokens,
		OutputTokens: usage.OutputTokens, ThinkingTokens: usage.ThinkingTokens, TotalTokens: usage.TotalTokens,
		CostUSD: aiusage.Cost(usage), DurationMs: int(took.Milliseconds()),
	}}
	if readErr != nil {
		res.Result = ResultUnreadable
		res.Note = "The photo could not be read just now. Take it again, or type the batch number."
	} else {
		res.ReadBatch, res.ReadExpiry, res.ReadProduct = r.Batch, r.Expiry, r.ProductName
		res.Result, res.Note = verdict(r.Batch, l.exp.batch, l.exp.known, r.ProductMatches == "no", r.ProductName)
		res.Note = expiryNote(res.Note, res.Result, r.Expiry, l.exp.expiry)
	}
	detail := describe(res, "ai")
	if readErr != nil {
		detail += " (reader error: " + truncate(readErr.Error(), 160) + ")"
	}
	if err := saveCheck(ctx, db, orderID, itemID, userID, &key, l, res, "ai", "photo", detail); err != nil {
		return nil, err
	}
	return res, nil
}

// CheckTyped records a batch number the packer typed in (when the photo
// could not be read), compared the same way. The last photo stays.
func CheckTyped(ctx context.Context, db *pgxpool.Pool, orderID, itemID, userID uuid.UUID, batch, expiry string) (*CheckResult, error) {
	l, err := loadLine(ctx, db, orderID, itemID)
	if err != nil {
		return nil, err
	}
	batch, expiry = strings.TrimSpace(batch), strings.TrimSpace(expiry)
	res := &CheckResult{ReadBatch: batch, ReadExpiry: expiry, Expected: l.exp.batch}
	res.Result, res.Note = verdict(batch, l.exp.batch, l.exp.known, false, "")
	if err := saveCheck(ctx, db, orderID, itemID, userID, nil, l, res, "typed", "typed", describe(res, "typed")); err != nil {
		return nil, err
	}
	return res, nil
}

func expiryNote(note, result, read, expected string) string {
	if result != ResultMatch || read == "" || expected == "" {
		return note
	}
	pm, py, ok1 := packExpiry(read)
	mm, my, ok2 := margExpiry(expected)
	if !ok1 || !ok2 || (pm == mm && py == my) {
		return note
	}
	add := "Check the expiry: the pack says " + read + ", Marg has " + MargExpiryLabel(expected) + "."
	if note == "" {
		return add
	}
	return note + " " + add
}

func describe(r *CheckResult, source string) string {
	var b strings.Builder
	if source == "typed" {
		b.WriteString("Typed batch ")
	} else {
		b.WriteString("Read batch ")
	}
	if r.ReadBatch == "" {
		b.WriteString("(none)")
	} else {
		b.WriteString(r.ReadBatch)
	}
	if r.ReadExpiry != "" {
		b.WriteString(", exp " + r.ReadExpiry)
	}
	if r.Expected != "" {
		b.WriteString("; expected " + r.Expected)
	}
	b.WriteString(" → " + r.Result)
	if r.Note != "" {
		b.WriteString(". " + r.Note)
	}
	return b.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// saveCheck upserts the line's check (photoKey nil keeps the last photo)
// and logs it, plus a "started" entry if this is the order's first step —
// one round trip.
func saveCheck(ctx context.Context, db *pgxpool.Pool, orderID, itemID, userID uuid.UUID, photoKey *string, l *line, r *CheckResult, source, action, detail string) error {
	var expected, expExp *string
	if l.exp.batch != "" {
		expected, expExp = &l.exp.batch, &l.exp.expiry
	}
	_, err := db.Exec(ctx, `
		WITH first AS (
			INSERT INTO order_packing_log (order_id, user_id, action, detail)
			SELECT $1, $3, 'started', 'Started packing'
			WHERE NOT EXISTS (SELECT 1 FROM order_packing_log WHERE order_id = $1)
		), up AS (
			INSERT INTO order_item_packing (order_item_id, order_id, photo_key, expected_batch, expected_expiry,
			       read_batch, read_expiry, read_product, read_source, result, result_note, checked_by, checked_at)
			VALUES ($2, $1, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), $10, $11, NULLIF($12, ''), $3, now())
			ON CONFLICT (order_item_id) DO UPDATE SET
			       photo_key = COALESCE(EXCLUDED.photo_key, order_item_packing.photo_key),
			       expected_batch = EXCLUDED.expected_batch, expected_expiry = EXCLUDED.expected_expiry,
			       read_batch = EXCLUDED.read_batch, read_expiry = EXCLUDED.read_expiry, read_product = EXCLUDED.read_product,
			       read_source = EXCLUDED.read_source, result = EXCLUDED.result, result_note = EXCLUDED.result_note,
			       checked_by = EXCLUDED.checked_by, checked_at = EXCLUDED.checked_at,
			       override_by = NULL, override_reason = NULL, override_at = NULL,
			       packed_qty = NULL, packed_by = NULL, packed_at = NULL
		)
		INSERT INTO order_packing_log (order_id, order_item_id, product_name, user_id, action, detail, photo_key, created_at)
		VALUES ($1, $2, $13, $3, $14, $15, $4, now() + interval '1 millisecond')`,
		orderID, itemID, userID, photoKey, expected, expExp,
		r.ReadBatch, r.ReadExpiry, r.ReadProduct, source, r.Result, r.Note,
		l.productName, action, detail)
	return err
}

// SetPacked ticks (or unticks) a line. Ticking needs a matched batch, a
// line with nothing to match against, or an admin's override.
func SetPacked(ctx context.Context, db *pgxpool.Pool, orderID, itemID, userID uuid.UUID, packed bool) error {
	l, err := loadLine(ctx, db, orderID, itemID)
	if err != nil {
		return err
	}
	if packed {
		tag, err := db.Exec(ctx, `
			WITH up AS (
				UPDATE order_item_packing SET packed_qty = $4, packed_by = $3, packed_at = now()
				WHERE order_item_id = $2 AND order_id = $1
				  AND (result IN ('match', 'unchecked') OR override_at IS NOT NULL)
				RETURNING read_batch
			)
			INSERT INTO order_packing_log (order_id, order_item_id, product_name, user_id, action, detail)
			SELECT $1, $2, $5, $3, 'packed', 'Packed ' || $4 || ' × batch ' || COALESCE(read_batch, '?') FROM up`,
			orderID, itemID, userID, l.quantity, l.productName)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotChecked
		}
		return nil
	}
	_, err = db.Exec(ctx, `
		WITH up AS (
			UPDATE order_item_packing SET packed_qty = NULL, packed_by = NULL, packed_at = NULL
			WHERE order_item_id = $2 AND order_id = $1 AND packed_at IS NOT NULL
			RETURNING 1
		)
		INSERT INTO order_packing_log (order_id, order_item_id, product_name, user_id, action, detail)
		SELECT $1, $2, $4, $3, 'unpacked', 'Unticked' FROM up`,
		orderID, itemID, userID, l.productName)
	return err
}

// Override lets a line through that did not match (admins only; the
// handler checks), with the reason logged.
func Override(ctx context.Context, db *pgxpool.Pool, orderID, itemID, userID uuid.UUID, reason string) error {
	l, err := loadLine(ctx, db, orderID, itemID)
	if err != nil {
		return err
	}
	tag, err := db.Exec(ctx, `
		WITH up AS (
			UPDATE order_item_packing SET override_by = $3, override_reason = $4, override_at = now()
			WHERE order_item_id = $2 AND order_id = $1 AND result IS NOT NULL
			RETURNING read_batch
		)
		INSERT INTO order_packing_log (order_id, order_item_id, product_name, user_id, action, detail)
		SELECT $1, $2, $5, $3, 'override', 'Allowed batch ' || COALESCE(read_batch, '(none)') || ': ' || $4 FROM up`,
		orderID, itemID, userID, reason, l.productName)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotChecked
	}
	return nil
}

// Finish marks an order sent to packing as packed once every line is ticked
// at its current quantity, in one statement so a line changed meanwhile
// stops it.
func Finish(ctx context.Context, db *pgxpool.Pool, orderID, userID uuid.UUID) error {
	var status string
	if err := db.QueryRow(ctx, `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if status != StatusToPack {
		return ErrNotPackable
	}
	tag, err := db.Exec(ctx, `
		WITH up AS (
			UPDATE orders o SET status = 'packed', packed_at = now(), packed_by = $2, updated_at = now()
			WHERE o.id = $1 AND o.status = 'packing'
			  AND EXISTS (SELECT 1 FROM order_items WHERE order_id = $1)
			  AND NOT EXISTS (
				SELECT 1 FROM order_items oi LEFT JOIN order_item_packing k ON k.order_item_id = oi.id
				WHERE oi.order_id = $1 AND (k.packed_at IS NULL OR k.packed_qty IS DISTINCT FROM oi.quantity))
			RETURNING o.id
		), ev AS (
			INSERT INTO order_events (order_id, event_type, description, actor_id)
			SELECT id, 'status.packed', 'Order status changed from packing to packed', $2 FROM up
		)
		INSERT INTO order_packing_log (order_id, user_id, action, detail)
		SELECT id, $2, 'finished', 'All products packed; order marked Packed' FROM up`, orderID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotAllDone
	}
	return nil
}

// Reopen takes a packed order back to "sent to packing" (admins only), so it
// is back on the dispatch team's list, keeping its checks and ticks so only
// what changed needs doing again.
func Reopen(ctx context.Context, db *pgxpool.Pool, orderID, userID uuid.UUID, reason string) error {
	tag, err := db.Exec(ctx, `
		WITH up AS (
			UPDATE orders SET status = 'packing', packed_at = NULL, packed_by = NULL, updated_at = now()
			WHERE id = $1 AND status = 'packed'
			RETURNING id
		), ev AS (
			INSERT INTO order_events (order_id, event_type, description, actor_id)
			SELECT id, 'status.packing', 'Order status changed from packed to packing', $2 FROM up
		)
		INSERT INTO order_packing_log (order_id, user_id, action, detail)
		SELECT id, $2, 'reopened', 'Reopened for packing' || CASE WHEN $3 <> '' THEN ': ' || $3 ELSE '' END FROM up`,
		orderID, userID, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotPackable
	}
	return nil
}
