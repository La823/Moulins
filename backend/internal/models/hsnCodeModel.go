package models

import (
	"context"
	"fmt"
	"sort"
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
// HsnGstRate is one GST schedule entry for a code. There can be several per
// code — the rate depends on which entry the goods fall under — so these are
// returned as candidates, not resolved to a single number.
type HsnGstRate struct {
	Code        string   `json:"code"`
	Schedule    *string  `json:"schedule,omitempty"`
	Description string   `json:"description"`
	CGST        *float64 `json:"cgst,omitempty"`
	SGST        *float64 `json:"sgst,omitempty"`
	IGST        *float64 `json:"igst,omitempty"`
	Cess        *string  `json:"cess,omitempty"`
}

type HsnLookup struct {
	Query   string    `json:"query"`
	Found   bool      `json:"found"`
	Code    *HsnCode  `json:"code,omitempty"`
	Parents []HsnCode `json:"parents"`
	Nearest *HsnCode  `json:"nearest,omitempty"` // exact match, else closest ancestor

	// GST entries for the code, or for the closest ancestor that has any.
	// GstVia says which code they were found under, since rates are published
	// at heading level and an 8-digit code usually inherits them.
	Gst    []HsnGstRate `json:"gst"`
	GstVia string       `json:"gst_via,omitempty"`
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
	if err := rows.Err(); err != nil {
		return out, err
	}

	// Rates: try the code itself, then walk up. Published at heading level,
	// so an 8-digit code almost always resolves via its 4-digit parent.
	//
	// Only when the code resolved to something real. Otherwise a nonsense
	// query like 99999999 would climb to chapter 99 and return a page of
	// unrelated rates, which reads as though the code were valid.
	out.Gst = []HsnGstRate{}
	if out.Nearest == nil {
		return out, nil
	}
	// Take rates from the MOST SPECIFIC level that has any, and no broader.
	//
	// Collecting from every level over-reports badly. Chapter 30 carries one
	// 18% entry (synthetic menthol) against ~600 medicament entries at 5%;
	// gathering all levels leaked that 18% onto every code in the chapter, so
	// 30049099 offered "5% or 18%" when 3004 answers it exactly: 5%.
	//
	// An earlier version did collect every level, because the rates then in the
	// table were the pre-2025 ones where 3004 read 12% and the 5% entries sat
	// at chapter level -- so the climb was the only way to find the real rate.
	// That was working around stale data, and with the correct schedule loaded
	// it does damage instead.
	//
	// A broader entry is not a competing candidate: it is what applies when
	// nothing more specific does. Asking about chapter 30 itself still returns
	// both, which is right -- the question was about the whole chapter.
	levels := make([]string, 0, len(candidates))
	for _, cand := range candidates {
		if len(cand) <= len(out.Nearest.Code) {
			levels = append(levels, cand)
		}
	}
	// effective_from must be set: rows without it predate the 22 September 2025
	// rationalisation and carry the abolished 12% slab, so serving them would
	// put last year's rate on a medicine.
	grows, err := db.Query(ctx, `
		SELECT code, schedule, description, cgst, sgst, igst, cess
		FROM hsn_gst_rates
		WHERE code = ANY($1) AND effective_from IS NOT NULL
		  AND length(code) = (SELECT max(length(code)) FROM hsn_gst_rates
		                      WHERE code = ANY($1) AND effective_from IS NOT NULL)
		ORDER BY igst NULLS LAST, description`, levels)
	if err != nil {
		return out, err
	}
	defer grows.Close()
	seen := map[string]bool{}
	for grows.Next() {
		var g HsnGstRate
		if err := grows.Scan(&g.Code, &g.Schedule, &g.Description, &g.CGST, &g.SGST, &g.IGST, &g.Cess); err != nil {
			return out, err
		}
		// The same entry can be listed against several codes in a group.
		key := g.Description
		if g.IGST != nil {
			key = fmt.Sprintf("%s|%g", key, *g.IGST)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		if out.GstVia == "" {
			out.GstVia = g.Code
		}
		out.Gst = append(out.Gst, g)
	}
	return out, grows.Err()
}

// HsnBrowseRow is one row of the browse table: a code plus the distinct GST
// rates that apply to it, resolved through its ancestors the same way the
// single lookup does — rates are published at chapter/heading level, so most
// 8-digit codes have none of their own and would otherwise show blank.
type HsnBrowseRow struct {
	Code        string    `json:"code"`
	Description string    `json:"description"`
	Level       int       `json:"level"`
	Rates       []float64 `json:"rates"`
	RateVia     *string   `json:"rate_via,omitempty"`
	EntryCount  int       `json:"entry_count"`
}

type HsnBrowseFilters struct {
	Query  string // matches code prefix or description
	Level  int    // 0 = any
	Rate   *float64
	HasGST string // "", "yes", "no"
	Page   int
	Limit  int
}

// BrowseHsnCodes lists codes with their resolved rates, paginated.
func BrowseHsnCodes(ctx context.Context, db *pgxpool.Pool, f HsnBrowseFilters) ([]HsnBrowseRow, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.Limit < 1 || f.Limit > 200 {
		f.Limit = 50
	}

	// The candidate set for a code is itself plus each shorter prefix; this
	// is the same walk LookupHsnCode does, expressed for the whole page.
	const ancestors = `(h.code, left(h.code,6), left(h.code,4), left(h.code,2))`
	// Only the current regime: see the note in LookupHsnCode.
	const current = ` AND r.effective_from IS NOT NULL`
	// The most specific ancestor carrying any rate; the rate is read from that
	// one level only. See LookupHsnCode for why broader levels are excluded.
	viaAgg := `(SELECT r.code FROM hsn_gst_rates r WHERE r.code IN ` + ancestors + current + `
	            ORDER BY length(r.code) DESC LIMIT 1)`
	rateAgg := `(SELECT array_agg(DISTINCT r.igst) FROM hsn_gst_rates r
	             WHERE r.code = ` + viaAgg + ` AND r.igst IS NOT NULL` + current + `)`
	cntAgg := `(SELECT count(*) FROM hsn_gst_rates r WHERE r.code = ` + viaAgg + current + `)`

	conds := []string{}
	args := []any{}
	n := 1
	if q := strings.TrimSpace(f.Query); q != "" {
		conds = append(conds, fmt.Sprintf("(h.code LIKE $%d OR h.description ILIKE $%d)", n, n+1))
		args = append(args, q+"%", "%"+q+"%")
		n += 2
	}
	if f.Level > 0 {
		conds = append(conds, fmt.Sprintf("h.level = $%d", n))
		args = append(args, f.Level)
		n++
	}
	if f.Rate != nil {
		// Match the rate the row actually resolves to, not one it merely
		// inherits from a broader level it never reports.
		conds = append(conds, fmt.Sprintf(
			`EXISTS (SELECT 1 FROM hsn_gst_rates r WHERE r.code = %s AND r.igst = $%d%s)`,
			viaAgg, n, current))
		args = append(args, *f.Rate)
		n++
	}
	switch f.HasGST {
	case "yes":
		conds = append(conds, cntAgg+" > 0")
	case "no":
		conds = append(conds, cntAgg+" = 0")
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM hsn_codes h`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, f.Limit, (f.Page-1)*f.Limit)
	rows, err := db.Query(ctx, fmt.Sprintf(`
		SELECT h.code, h.description, h.level, %s, %s, %s
		FROM hsn_codes h%s
		ORDER BY h.code
		LIMIT $%d OFFSET $%d`, rateAgg, viaAgg, cntAgg, where, n, n+1), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []HsnBrowseRow{}
	for rows.Next() {
		var r HsnBrowseRow
		var rates []float64
		if err := rows.Scan(&r.Code, &r.Description, &r.Level, &rates, &r.RateVia, &r.EntryCount); err != nil {
			return nil, 0, err
		}
		if rates == nil {
			rates = []float64{}
		}
		sort.Float64s(rates)
		r.Rates = rates
		out = append(out, r)
	}
	return out, total, rows.Err()
}

// DistinctGstRates powers the rate filter dropdown.
func DistinctGstRates(ctx context.Context, db *pgxpool.Pool) ([]float64, error) {
	rows, err := db.Query(ctx, `SELECT DISTINCT igst FROM hsn_gst_rates
		WHERE igst IS NOT NULL AND effective_from IS NOT NULL ORDER BY igst`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []float64{}
	for rows.Next() {
		var v float64
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
