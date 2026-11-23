package models

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Quotation is one price quoted for one product (migration 194).
type Quotation struct {
	ID           uuid.UUID  `json:"id"`
	CustomerKind string     `json:"customer_kind"` // existing | new | third_party
	CustomerID   *uuid.UUID `json:"customer_id"`
	CustomerName string     `json:"customer_name"`
	ProductID    *uuid.UUID `json:"product_id"`
	ProductName  string     `json:"product_name"`
	Rate         float64    `json:"rate"`
	Remarks      *string    `json:"remarks"`
	QuotedAt     time.Time  `json:"quoted_at"`
	GivenBy      *uuid.UUID `json:"given_by"`
	GivenByName  *string    `json:"given_by_name"`
	CreatedBy    *uuid.UUID `json:"created_by"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// QuotationInput is what the form sends.
type QuotationInput struct {
	CustomerKind string     `json:"customer_kind"`
	CustomerID   *uuid.UUID `json:"customer_id"`
	CustomerName string     `json:"customer_name"`
	ProductID    *uuid.UUID `json:"product_id"`
	Rate         *float64   `json:"rate"`
	Remarks      *string    `json:"remarks"`
	QuotedAt     *time.Time `json:"quoted_at"`
	GivenBy      *uuid.UUID `json:"given_by"`
}

// ErrQuotationInvalid wraps a message for the person filling the form.
type ErrQuotationInvalid struct{ Msg string }

func (e ErrQuotationInvalid) Error() string { return e.Msg }

// resolve checks the input and fills the names kept on the entry: an
// existing customer's and the product's, as they are now.
func (in *QuotationInput) resolve(ctx context.Context, db *pgxpool.Pool) (productName string, err error) {
	in.CustomerName = strings.TrimSpace(in.CustomerName)
	switch in.CustomerKind {
	case "existing":
		if in.CustomerID == nil {
			return "", ErrQuotationInvalid{"Pick the customer."}
		}
		var name *string
		var phone string
		if err := db.QueryRow(ctx, `SELECT username, phone_number FROM users WHERE id = $1 AND role = 'partner'`, *in.CustomerID).
			Scan(&name, &phone); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return "", ErrQuotationInvalid{"That customer wasn't found."}
			}
			return "", err
		}
		in.CustomerName = phone
		if name != nil && strings.TrimSpace(*name) != "" {
			in.CustomerName = strings.TrimSpace(*name)
		}
	case "new", "third_party":
		in.CustomerID = nil
		if in.CustomerName == "" {
			if in.CustomerKind == "new" {
				return "", ErrQuotationInvalid{"Enter the new customer's name."}
			}
			return "", ErrQuotationInvalid{"Enter the third party's name."}
		}
	default:
		return "", ErrQuotationInvalid{"Choose who the quotation is for: existing customer, new customer or third party."}
	}
	if in.ProductID == nil {
		return "", ErrQuotationInvalid{"Pick the product."}
	}
	if err := db.QueryRow(ctx, `SELECT name FROM products WHERE id = $1`, *in.ProductID).Scan(&productName); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrQuotationInvalid{"That product wasn't found."}
		}
		return "", err
	}
	if in.Rate == nil || *in.Rate < 0 {
		return "", ErrQuotationInvalid{"Enter the price quoted."}
	}
	if in.QuotedAt == nil || in.QuotedAt.IsZero() {
		now := time.Now()
		in.QuotedAt = &now
	}
	if in.Remarks != nil {
		r := strings.TrimSpace(*in.Remarks)
		if r == "" {
			in.Remarks = nil
		} else {
			in.Remarks = &r
		}
	}
	if in.GivenBy != nil {
		var ok bool
		if err := db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND role IN ('admin', 'employee'))`, *in.GivenBy).Scan(&ok); err != nil {
			return "", err
		}
		if !ok {
			return "", ErrQuotationInvalid{"Choose a staff account for who gave the quotation."}
		}
	}
	return productName, nil
}

// CreateQuotation saves a new entry; given_by defaults to the person entering it.
func CreateQuotation(ctx context.Context, db *pgxpool.Pool, in QuotationInput, by uuid.UUID) (uuid.UUID, error) {
	productName, err := in.resolve(ctx, db)
	if err != nil {
		return uuid.Nil, err
	}
	if in.GivenBy == nil {
		in.GivenBy = &by
	}
	var id uuid.UUID
	err = db.QueryRow(ctx, `
		INSERT INTO quotations (customer_kind, customer_id, customer_name, product_id, product_name, rate, remarks, quoted_at, given_by, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
		in.CustomerKind, in.CustomerID, in.CustomerName, in.ProductID, productName, *in.Rate, in.Remarks, *in.QuotedAt, in.GivenBy, by).Scan(&id)
	return id, err
}

// UpdateQuotation changes an entry; found is false when it doesn't exist.
func UpdateQuotation(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, in QuotationInput, by uuid.UUID) (found bool, err error) {
	productName, err := in.resolve(ctx, db)
	if err != nil {
		return false, err
	}
	if in.GivenBy == nil {
		in.GivenBy = &by
	}
	tag, err := db.Exec(ctx, `
		UPDATE quotations SET customer_kind = $2, customer_id = $3, customer_name = $4, product_id = $5, product_name = $6,
			rate = $7, remarks = $8, quoted_at = $9, given_by = $10, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL`,
		id, in.CustomerKind, in.CustomerID, in.CustomerName, in.ProductID, productName, *in.Rate, in.Remarks, *in.QuotedAt, in.GivenBy)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// DeleteQuotation marks an entry removed; it stays in the table.
func DeleteQuotation(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (bool, error) {
	tag, err := db.Exec(ctx, `UPDATE quotations SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// QuotationFilter narrows the list.
type QuotationFilter struct {
	Search    string // customer, product or remarks
	Kind      string // existing | new | third_party
	ProductID *uuid.UUID
	From, To  *time.Time // quoted_at, To exclusive
	Page      int
}

// QuotationPageSize is how many entries one page of the list holds.
const QuotationPageSize = 50

// ListQuotations returns one page of entries, newest quote first, and the total.
func ListQuotations(ctx context.Context, db *pgxpool.Pool, f QuotationFilter) ([]Quotation, int, error) {
	conds := []string{"q.deleted_at IS NULL"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		add("(q.customer_name ILIKE ? OR q.product_name ILIKE ? OR q.remarks ILIKE ?)", "%"+s+"%")
	}
	if f.Kind != "" {
		add("q.customer_kind = ?", f.Kind)
	}
	if f.ProductID != nil {
		add("q.product_id = ?", *f.ProductID)
	}
	if f.From != nil {
		add("q.quoted_at >= ?", *f.From)
	}
	if f.To != nil {
		add("q.quoted_at < ?", *f.To)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM quotations q WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if f.Page < 1 {
		f.Page = 1
	}
	args = append(args, QuotationPageSize, (f.Page-1)*QuotationPageSize)
	rows, err := db.Query(ctx, fmt.Sprintf(`
		SELECT q.id, q.customer_kind, q.customer_id, q.customer_name, q.product_id, q.product_name, q.rate::float8,
		       q.remarks, q.quoted_at, q.given_by, NULLIF(COALESCE(NULLIF(g.username, ''), g.phone_number), ''),
		       q.created_by, q.created_at, q.updated_at
		FROM quotations q
		LEFT JOIN users g ON g.id = q.given_by
		WHERE %s
		ORDER BY q.quoted_at DESC, q.created_at DESC
		LIMIT $%d OFFSET $%d`, where, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Quotation{}
	for rows.Next() {
		var q Quotation
		if err := rows.Scan(&q.ID, &q.CustomerKind, &q.CustomerID, &q.CustomerName, &q.ProductID, &q.ProductName, &q.Rate,
			&q.Remarks, &q.QuotedAt, &q.GivenBy, &q.GivenByName, &q.CreatedBy, &q.CreatedAt, &q.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, q)
	}
	return out, total, rows.Err()
}

// QuotationOption is a name to pick in the form (a staff account or a product).
type QuotationOption struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Sub  string    `json:"sub,omitempty"`
}

// QuotationStaff lists the staff accounts that can be "given by".
func QuotationStaff(ctx context.Context, db *pgxpool.Pool) ([]QuotationOption, error) {
	rows, err := db.Query(ctx, `
		SELECT id, COALESCE(NULLIF(username, ''), phone_number), role
		FROM users WHERE role IN ('admin', 'employee') AND deleted_at IS NULL
		ORDER BY lower(COALESCE(NULLIF(username, ''), phone_number))`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []QuotationOption{}
	for rows.Next() {
		var o QuotationOption
		if err := rows.Scan(&o.ID, &o.Name, &o.Sub); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// QuotationProducts finds products by name or composition for the form.
func QuotationProducts(ctx context.Context, db *pgxpool.Pool, q string) ([]QuotationOption, error) {
	rows, err := db.Query(ctx, `
		SELECT id, name, COALESCE(key_ingredients, '')
		FROM products
		WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR key_ingredients ILIKE '%' || $1 || '%'
		ORDER BY (name ILIKE '%' || $1 || '%') DESC, is_active DESC, name
		LIMIT 30`, strings.TrimSpace(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []QuotationOption{}
	for rows.Next() {
		var o QuotationOption
		if err := rows.Scan(&o.ID, &o.Name, &o.Sub); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// QuotationCustomers finds partners by name or phone for the form.
func QuotationCustomers(ctx context.Context, db *pgxpool.Pool, q string) ([]QuotationOption, error) {
	rows, err := db.Query(ctx, `
		SELECT id, COALESCE(NULLIF(username, ''), phone_number), phone_number
		FROM users
		WHERE role = 'partner' AND deleted_at IS NULL
		  AND ($1 = '' OR username ILIKE '%' || $1 || '%' OR phone_number ILIKE '%' || $1 || '%')
		ORDER BY lower(COALESCE(NULLIF(username, ''), phone_number))
		LIMIT 30`, strings.TrimSpace(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []QuotationOption{}
	for rows.Next() {
		var o QuotationOption
		if err := rows.Scan(&o.ID, &o.Name, &o.Sub); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
