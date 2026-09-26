package models

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HsnCode is one row of the HSN/SAC reference master.
type HsnCode struct {
	Code        string `json:"code"`
	Description string `json:"description"`
	Level       int    `json:"level"` // 2=chapter, 4=heading, 6=subheading, 8=tariff item
}

// HsnLookup is what a code lookup returns: the exact row if there is one,
// plus its ancestors.
//
// The parent chain matters because a code that is perfectly valid may simply
// not be in the sheet — the master has 14,709 eight-digit codes but they do
// not cover every combination, so an exact miss is common and a bare 404
// would be unhelpful. Walking up 8 -> 6 -> 4 -> 2 always yields something
// meaningful, and it is the same single query either way.
type HsnLookup struct {
	Query   string    `json:"query"`
	Found   bool      `json:"found"`
	Code    *HsnCode  `json:"code,omitempty"`
	Parents []HsnCode `json:"parents"`
	Nearest *HsnCode  `json:"nearest,omitempty"` // exact match, else closest ancestor
}

// LookupHsnCode fetches a code and its ancestors in one round trip. Digits
// are the only meaningful characters, so anything else is stripped — callers
// paste codes with dots and spaces ("3004.90.99").
func LookupHsnCode(ctx context.Context, db *pgxpool.Pool, raw string) (HsnLookup, error) {
	var b strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	code := b.String()
	out := HsnLookup{Query: code, Parents: []HsnCode{}}
	if code == "" {
		return out, nil
	}

	// The code plus every prefix of it, longest first — one index scan.
	candidates := []string{code}
	for _, n := range []int{8, 6, 4, 2} {
		if n < len(code) {
			candidates = append(candidates, code[:n])
		}
	}

	rows, err := db.Query(ctx, `
		SELECT code, description, level
		FROM hsn_codes
		WHERE code = ANY($1)
		ORDER BY length(code) DESC`, candidates)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	for rows.Next() {
		var h HsnCode
		if err := rows.Scan(&h.Code, &h.Description, &h.Level); err != nil {
			return out, err
		}
		switch {
		case h.Code == code:
			c := h
			out.Found = true
			out.Code = &c
			out.Nearest = &c
		default:
			out.Parents = append(out.Parents, h)
			if out.Nearest == nil {
				c := h
				out.Nearest = &c // longest ancestor, since rows are ordered by length
			}
		}
	}
	return out, rows.Err()
}
