// Package cheques keeps the cheque writer's bank layouts (migration 171) and
// finds payees in the Marg ledger. The page does the layout and printing;
// this only stores what it hands over.
package cheques

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

// Profile is one bank layout. Data is the page's own settings object.
type Profile struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	Data      json.RawMessage `json:"data"`
	SortOrder int             `json:"sort_order"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func ListProfiles(ctx context.Context, db *pgxpool.Pool) ([]Profile, error) {
	rows, err := db.Query(ctx, `SELECT id, name, data, sort_order, updated_at FROM cheque_profiles ORDER BY sort_order, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Profile{}
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Name, &p.Data, &p.SortOrder, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CreateProfiles adds layouts in one statement (the page seeds the bank
// layouts this way the first time it opens) and returns them.
func CreateProfiles(ctx context.Context, db *pgxpool.Pool, ps []Profile) ([]Profile, error) {
	names, datas, orders := make([]string, len(ps)), make([]string, len(ps)), make([]int32, len(ps))
	for i, p := range ps {
		names[i], datas[i], orders[i] = p.Name, string(p.Data), int32(p.SortOrder)
	}
	rows, err := db.Query(ctx, `
		INSERT INTO cheque_profiles (name, data, sort_order)
		SELECT t.name, t.data::jsonb, t.ord FROM unnest($1::text[], $2::text[], $3::int[]) WITH ORDINALITY AS t(name, data, ord, n)
		ORDER BY t.n
		RETURNING id, name, data, sort_order, updated_at`, names, datas, orders)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Profile{}
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Name, &p.Data, &p.SortOrder, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func UpdateProfile(ctx context.Context, db *pgxpool.Pool, p Profile) (Profile, error) {
	err := db.QueryRow(ctx, `
		UPDATE cheque_profiles SET name = $2, data = $3::jsonb, updated_at = NOW() WHERE id = $1
		RETURNING id, name, data, sort_order, updated_at`, p.ID, p.Name, string(p.Data)).
		Scan(&p.ID, &p.Name, &p.Data, &p.SortOrder, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func DeleteProfile(ctx context.Context, db *pgxpool.Pool, id int64) error {
	tag, err := db.Exec(ctx, `DELETE FROM cheque_profiles WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// Payee is a Marg ledger account a cheque can be written to.
type Payee struct {
	PartyCode string  `json:"party_code"`
	Name      string  `json:"name"`
	City      *string `json:"city"`
	Kind      string  `json:"kind"`
}

// Payees finds Marg ledger parties by name or code: suppliers, vendors,
// staff, customers — not tax, bank or sales/purchase/expense accounts.
func Payees(ctx context.Context, db *pgxpool.Pool, search string) ([]Payee, error) {
	rows, err := db.Query(ctx, `
		SELECT party_code, COALESCE(NULLIF(TRIM(short_name), ''), name), NULLIF(TRIM(city), ''), kind
		FROM marg_ede_ledger
		WHERE NOT marg_deleted AND party_code IS NOT NULL
		  AND kind NOT IN ('tax', 'bank_cash', 'sales_purchase_account', 'expense_account')
		  AND (name ILIKE '%' || $1 || '%' OR party_code ILIKE $1)
		ORDER BY (kind = 'customer'), name
		LIMIT 20`, strings.TrimSpace(search))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Payee{}
	for rows.Next() {
		var p Payee
		if err := rows.Scan(&p.PartyCode, &p.Name, &p.City, &p.Kind); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
