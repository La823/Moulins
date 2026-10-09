package models

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Who can see a product (migration 149):
//
//   - a normal product is in everyone's catalogue, except partners with a
//     'hidden' row for it;
//   - an exclusive product is in nobody's catalogue — logged-out visitors
//     included — except partners with an 'allowed' row for it;
//   - staff see everything.
//
// A team member sees what their partner sees.

// ProductViewer is whoever is looking at the catalogue.
type ProductViewer struct {
	// PartnerID is the partner whose rules apply (a team member's owner);
	// nil for someone who isn't logged in.
	PartnerID *uuid.UUID
	// SeesAll is staff: no product is hidden from them.
	SeesAll bool
}

// EveryProduct is a viewer nothing is hidden from — for staff screens and
// internal jobs that work on the whole catalogue.
var EveryProduct = ProductViewer{SeesAll: true}

// ResolveProductViewer works out whose rules apply to a logged-in user.
func ResolveProductViewer(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, role string) ProductViewer {
	switch role {
	case "admin", "employee":
		return EveryProduct
	case "team_member":
		var owner *uuid.UUID
		if err := db.QueryRow(ctx, `SELECT team_owner_id FROM users WHERE id = $1`, userID).Scan(&owner); err == nil && owner != nil {
			return ProductViewer{PartnerID: owner}
		}
	}
	id := userID
	return ProductViewer{PartnerID: &id}
}

// visibleSQL is a condition on the products row named by table that is true
// when v may see it. Any argument it needs takes placeholder $argIdx; it
// returns the arguments to append and the next free placeholder.
func (v ProductViewer) visibleSQL(table string, argIdx int) (string, []any, int) {
	if v.SeesAll {
		return "", nil, argIdx
	}
	if v.PartnerID == nil {
		return fmt.Sprintf("NOT %s.exclusive", table), nil, argIdx
	}
	cond := fmt.Sprintf(`(CASE WHEN %[1]s.exclusive
		THEN EXISTS (SELECT 1 FROM product_partner_access ppa
		             WHERE ppa.product_id = %[1]s.id AND ppa.partner_id = $%[2]d AND ppa.access = 'allowed')
		ELSE NOT EXISTS (SELECT 1 FROM product_partner_access ppa
		                 WHERE ppa.product_id = %[1]s.id AND ppa.partner_id = $%[2]d AND ppa.access = 'hidden')
		END)`, table, argIdx)
	return cond, []any{*v.PartnerID}, argIdx + 1
}

// andVisible appends v's condition to a query that already has a WHERE
// clause and args, for the one-off queries outside the catalogue filter.
func (v ProductViewer) andVisible(query, table string, args []any) (string, []any) {
	cond, extra, _ := v.visibleSQL(table, len(args)+1)
	if cond == "" {
		return query, args
	}
	return query + " AND " + cond, append(args, extra...)
}

// CanSeeProduct reports whether v may see the product. A product that
// doesn't exist is reported as not visible, not as an error.
func CanSeeProduct(ctx context.Context, db *pgxpool.Pool, v ProductViewer, productID uuid.UUID) (bool, error) {
	if v.SeesAll {
		return true, nil
	}
	q, args := v.andVisible(`SELECT EXISTS (SELECT 1 FROM products WHERE products.id = $1`, "products", []any{productID})
	var ok bool
	err := db.QueryRow(ctx, q+")", args...).Scan(&ok)
	return ok, err
}

// HiddenAmong returns which of productIDs v may not see — the ones to refuse
// when an order or cart names them.
func HiddenAmong(ctx context.Context, db *pgxpool.Pool, v ProductViewer, productIDs []uuid.UUID) ([]uuid.UUID, error) {
	if v.SeesAll || len(productIDs) == 0 {
		return nil, nil
	}
	ids := make([]string, len(productIDs))
	for i, id := range productIDs {
		ids[i] = id.String()
	}
	// pgx has no encode plan for []uuid.UUID; pass strings and let Postgres cast
	visible, args := v.andVisible(`SELECT products.id FROM products WHERE products.id = ANY($1::uuid[])`, "products", []any{ids})
	rows, err := db.Query(ctx, visible, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := map[uuid.UUID]bool{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		seen[id] = true
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var hidden []uuid.UUID
	for _, id := range productIDs {
		if !seen[id] {
			hidden = append(hidden, id)
		}
	}
	return hidden, nil
}

// PartnerHasAccessRules reports whether any product is hidden from or
// allowed for the partner. One who has none sees exactly what a logged-out
// visitor sees, so can share the public catalogue cache.
func PartnerHasAccessRules(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID) (bool, error) {
	var has bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM product_partner_access WHERE partner_id = $1)`, partnerID).Scan(&has)
	return has, err
}

// ---------------------------------------------------------------- editing

type ProductAccessPartner struct {
	PartnerID uuid.UUID `json:"partner_id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone_number"`
	Access    string    `json:"access"` // "hidden" | "allowed"
	CreatedAt time.Time `json:"created_at"`
}

// ProductAccess is a product's visibility settings, for the admin editor.
type ProductAccess struct {
	ProductID uuid.UUID              `json:"product_id"`
	Exclusive bool                   `json:"exclusive"`
	Partners  []ProductAccessPartner `json:"partners"`
}

func GetProductAccess(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) (*ProductAccess, error) {
	pa := &ProductAccess{ProductID: productID, Partners: []ProductAccessPartner{}}
	if err := db.QueryRow(ctx, `SELECT exclusive FROM products WHERE id = $1`, productID).Scan(&pa.Exclusive); err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, `
		SELECT a.partner_id, COALESCE(NULLIF(TRIM(u.username), ''), u.phone_number), u.phone_number, a.access, a.created_at
		FROM product_partner_access a
		JOIN users u ON u.id = a.partner_id
		WHERE a.product_id = $1
		ORDER BY a.access, 2`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p ProductAccessPartner
		if err := rows.Scan(&p.PartnerID, &p.Name, &p.Phone, &p.Access, &p.CreatedAt); err != nil {
			return nil, err
		}
		pa.Partners = append(pa.Partners, p)
	}
	return pa, rows.Err()
}

type SetProductAccessRequest struct {
	Exclusive  bool        `json:"exclusive"`
	HiddenFor  []uuid.UUID `json:"hidden_for"`
	AllowedFor []uuid.UUID `json:"allowed_for"`
}

// ErrNotPartners is returned when a request names users who aren't partners.
type ErrNotPartners struct{ IDs []uuid.UUID }

func (e ErrNotPartners) Error() string {
	return fmt.Sprintf("%d of the chosen users are not partners", len(e.IDs))
}

// SetProductAccess replaces a product's visibility settings in one
// transaction. Both lists are kept whichever way exclusive is set, so
// switching it back and forth doesn't lose either. A partner can only be in
// one list; if named in both, allowed wins.
func SetProductAccess(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, req SetProductAccessRequest, actor *uuid.UUID) error {
	access := map[uuid.UUID]string{}
	for _, id := range req.HiddenFor {
		access[id] = "hidden"
	}
	for _, id := range req.AllowedFor {
		access[id] = "allowed"
	}
	ids := make([]string, 0, len(access))
	kinds := make([]string, 0, len(access))
	for id, kind := range access {
		ids = append(ids, id.String())
		kinds = append(kinds, kind)
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if len(ids) > 0 {
		rows, err := tx.Query(ctx, `
			SELECT x.id FROM unnest($1::uuid[]) AS x(id)
			LEFT JOIN users u ON u.id = x.id AND u.role = 'partner'
			WHERE u.id IS NULL`, ids)
		if err != nil {
			return err
		}
		var bad []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			bad = append(bad, id)
		}
		rows.Close()
		if len(bad) > 0 {
			return ErrNotPartners{IDs: bad}
		}
	}

	tag, err := tx.Exec(ctx, `UPDATE products SET exclusive = $2, updated_at = NOW() WHERE id = $1`, productID, req.Exclusive)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	if _, err := tx.Exec(ctx, `DELETE FROM product_partner_access WHERE product_id = $1`, productID); err != nil {
		return err
	}
	if len(ids) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_partner_access (product_id, partner_id, access, created_by)
			SELECT $1, x.id, x.access, $4
			FROM unnest($2::uuid[], $3::text[]) AS x(id, access)`,
			productID, ids, kinds, actor); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// PartnerProductAccess is one product with a rule for a given partner, for
// their detail page.
type PartnerProductAccess struct {
	ProductID uuid.UUID `json:"product_id"`
	Name      string    `json:"name"`
	Exclusive bool      `json:"exclusive"`
	Access    string    `json:"access"`
	// Visible is whether the partner actually sees it: a 'hidden' row on an
	// exclusive product, or an 'allowed' row on a normal one, changes nothing.
	Visible bool `json:"visible"`
}

// GetPartnerProductAccess lists every product with a rule for the partner,
// matched by the partner's id.
func GetPartnerProductAccess(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID) ([]PartnerProductAccess, error) {
	rows, err := db.Query(ctx, `
		SELECT p.id, p.name, p.exclusive, a.access
		FROM product_partner_access a
		JOIN products p ON p.id = a.product_id
		WHERE a.partner_id = $1
		ORDER BY a.access, p.name`, partnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PartnerProductAccess{}
	for rows.Next() {
		var r PartnerProductAccess
		if err := rows.Scan(&r.ProductID, &r.Name, &r.Exclusive, &r.Access); err != nil {
			return nil, err
		}
		r.Visible = (r.Exclusive && r.Access == "allowed") || (!r.Exclusive && r.Access != "hidden")
		out = append(out, r)
	}
	return out, rows.Err()
}

// ------------------------------------------------- per-partner editing

// PartnerAccessSummary is one partner's rule counts, for the visibility
// screen's partner list.
type PartnerAccessSummary struct {
	PartnerID    uuid.UUID `json:"partner_id"`
	Name         string    `json:"name"`
	Phone        string    `json:"phone_number"`
	HiddenCount  int       `json:"hidden_count"`
	AllowedCount int       `json:"allowed_count"`
}

// ListPartnerAccessSummaries returns every partner, with how many normal
// products are hidden from them and how many exclusive products they're
// allowed — only rules that actually change what they see are counted.
func ListPartnerAccessSummaries(ctx context.Context, db *pgxpool.Pool) ([]PartnerAccessSummary, error) {
	rows, err := db.Query(ctx, `
		SELECT u.id, COALESCE(NULLIF(TRIM(u.username), ''), u.phone_number), u.phone_number,
		       COUNT(*) FILTER (WHERE a.access = 'hidden'  AND NOT p.exclusive),
		       COUNT(*) FILTER (WHERE a.access = 'allowed' AND p.exclusive)
		FROM users u
		LEFT JOIN product_partner_access a ON a.partner_id = u.id
		LEFT JOIN products p ON p.id = a.product_id
		WHERE u.role = 'partner'
		GROUP BY u.id, u.username, u.phone_number
		ORDER BY 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PartnerAccessSummary{}
	for rows.Next() {
		var s PartnerAccessSummary
		if err := rows.Scan(&s.PartnerID, &s.Name, &s.Phone, &s.HiddenCount, &s.AllowedCount); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SetPartnerProductAccess gives one partner one rule for one product,
// replacing any rule they already had for it. access is "hidden" or
// "allowed". Returns ErrNotPartners when partnerID isn't a partner, and
// pgx.ErrNoRows when the product doesn't exist.
func SetPartnerProductAccess(ctx context.Context, db *pgxpool.Pool, partnerID, productID uuid.UUID, access string, actor *uuid.UUID) error {
	if access != "hidden" && access != "allowed" {
		return fmt.Errorf("access must be hidden or allowed")
	}
	var isPartner, productExists bool
	if err := db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND role = 'partner'),
		       EXISTS (SELECT 1 FROM products WHERE id = $2)`, partnerID, productID).Scan(&isPartner, &productExists); err != nil {
		return err
	}
	if !isPartner {
		return ErrNotPartners{IDs: []uuid.UUID{partnerID}}
	}
	if !productExists {
		return pgx.ErrNoRows
	}
	_, err := db.Exec(ctx, `
		INSERT INTO product_partner_access (product_id, partner_id, access, created_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (product_id, partner_id)
		DO UPDATE SET access = EXCLUDED.access, created_by = EXCLUDED.created_by, created_at = NOW()`,
		productID, partnerID, access, actor)
	return err
}

// RemovePartnerProductAccess deletes the partner's rule for the product, if
// any: a normal product becomes visible to them again, an exclusive one
// hidden again.
func RemovePartnerProductAccess(ctx context.Context, db *pgxpool.Pool, partnerID, productID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM product_partner_access WHERE partner_id = $1 AND product_id = $2`, partnerID, productID)
	return err
}
