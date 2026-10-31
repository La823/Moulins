package productrag

import (
	"cmp"
	"context"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5/pgxpool"
)

// candidate is a product stage 1 thinks the question may be about.
type candidate struct {
	ID      string
	Score   float64 // fused rank score — only meaningful relative to other candidates
	NameSim float64 // 0–1: how closely the product's name or brand appears in the question
}

const (
	listDepth = 40 // how far down each ranked list counts
	rrfK      = 60 // the usual Reciprocal Rank Fusion constant
)

// lexicalQuery ranks public products two ways straight from the products
// table (read-only; 556 rows need no index):
//
//	sim — the product's name (or brand) appears in the question, allowing
//	      for typos: pg_trgm's word_similarity finds the best-matching
//	      stretch of the question. Names carry their pack ("PLANSCAR GEL
//	      20 GM", "OMSTOC-20 CAP 10*15"), which nobody types, so the name is
//	      compared without it — cut at the first later word with a digit.
//	      Its first word ("planscar") also counts, a little lower, so a
//	      question naming only the product line finds every product in it
//	      while "planscar gel" still prefers the gel. Names of three
//	      letters or fewer ("TOM 80 PLUS" → "tom") are left to meaning
//	      search.
//	kw  — exact words: full-text match on the product's descriptive
//	      fields, where any word of the question counts
const lexicalQuery = `
WITH q AS (
	SELECT NULLIF(replace(plainto_tsquery('english', $1)::text, '&', '|'), '')::tsquery AS tq,
		lower($1) AS raw
)
SELECT id::text, sim::float8, kw::float8 FROM (
	SELECT p.id,
		GREATEST(
			-- a name of three letters or fewer shares a trigram with too many
			-- ordinary words ("tom" with "top") to count; meaning search
			-- still finds such products
			CASE WHEN length(n.base) >= 4 THEN word_similarity(n.base, q.raw) ELSE 0 END,
			CASE WHEN length(n.stem) >= 4 THEN 0.8 * word_similarity(n.stem, q.raw) ELSE 0 END,
			CASE WHEN COALESCE(p.brand_name, '') <> ''
				THEN 0.8 * word_similarity(lower(p.brand_name), q.raw) ELSE 0 END
		) AS sim,
		CASE WHEN q.tq IS NULL THEN 0 ELSE ts_rank_cd(to_tsvector('english', concat_ws(' ',
			p.name, p.brand_name, p.product_form, p.description, p.key_ingredients,
			p.key_benefits, p.direction_for_use, p.safety_information, p.edetailing)), q.tq) END AS kw
	FROM products p, q,
		LATERAL (SELECT regexp_replace(lower(trim(p.name)), '\s+\S*\d.*$', '') AS base) b,
		LATERAL (SELECT b.base, split_part(b.base, ' ', 1) AS stem) n
	WHERE ` + publicFilter + `
) s
WHERE sim >= 0.5 OR kw > 0`

type lexicalHit struct {
	id      string
	sim, kw float64
}

// findCandidates is stage 1: the products the question may be about, best
// first, and the question's embedding (stage 2 reuses it to pick PDF
// passages). It ranks products three ways — meaning (Qdrant), name and
// exact words (Postgres) — and fuses the rankings with Reciprocal Rank
// Fusion: each product scores sum(1 / (60 + rank)) over the lists it is in.
// RRF needs no tuning between the three scales (cosine similarity,
// trigram similarity and ts_rank are not comparable), and a product that
// shows up in several lists rises above one that tops only one.
func findCandidates(ctx context.Context, db *pgxpool.Pool, question string) ([]candidate, []float32, error) {
	// the Postgres query does not need the embedding, so it runs while
	// Voyage and Qdrant work
	type lexResult struct {
		hits []lexicalHit
		err  error
	}
	lexCh := make(chan lexResult, 1)
	go func() {
		hits, err := lexicalSearch(ctx, db, question)
		lexCh <- lexResult{hits, err}
	}()

	vecs, err := embed(ctx, []string{question}, inputQuery)
	if err != nil {
		return nil, nil, err
	}
	qvec := vecs[0]
	points, err := searchPoints(ctx, qvec, listDepth, nil)
	if err != nil {
		return nil, nil, err
	}
	lex := <-lexCh
	if lex.err != nil {
		return nil, nil, lex.err
	}

	byID := map[string]*candidate{}
	get := func(id string) *candidate {
		if byID[id] == nil {
			byID[id] = &candidate{ID: id}
		}
		return byID[id]
	}
	fuse := func(ids []string) {
		for rank, id := range ids {
			get(id).Score += 1.0 / float64(rrfK+rank+1)
		}
	}

	// meaning: a product with many chunks counts once, at its best rank
	var vecRanked []string
	seen := map[string]bool{}
	for _, p := range points {
		if id := payloadString(p.Payload, "product_id"); id != "" && !seen[id] {
			seen[id] = true
			vecRanked = append(vecRanked, id)
		}
	}
	fuse(vecRanked)

	byName := slices.Clone(lex.hits)
	slices.SortFunc(byName, func(a, b lexicalHit) int { return cmp.Compare(b.sim, a.sim) })
	var nameRanked []string
	for _, h := range byName {
		if h.sim >= 0.5 && len(nameRanked) < listDepth {
			nameRanked = append(nameRanked, h.id)
			get(h.id).NameSim = h.sim
		}
	}
	fuse(nameRanked)

	byWords := slices.Clone(lex.hits)
	slices.SortFunc(byWords, func(a, b lexicalHit) int { return cmp.Compare(b.kw, a.kw) })
	var kwRanked []string
	for _, h := range byWords {
		if h.kw > 0 && len(kwRanked) < listDepth {
			kwRanked = append(kwRanked, h.id)
		}
	}
	fuse(kwRanked)

	out := make([]candidate, 0, len(byID))
	for _, c := range byID {
		out = append(out, *c)
	}
	slices.SortFunc(out, func(a, b candidate) int { return cmp.Compare(b.Score, a.Score) })
	return out[:min(10, len(out))], qvec, nil
}

func lexicalSearch(ctx context.Context, db *pgxpool.Pool, question string) ([]lexicalHit, error) {
	rows, err := db.Query(ctx, lexicalQuery, question)
	if err != nil {
		return nil, fmt.Errorf("productrag: name/keyword search: %w", err)
	}
	defer rows.Close()
	var out []lexicalHit
	for rows.Next() {
		var h lexicalHit
		if err := rows.Scan(&h.id, &h.sim, &h.kw); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// Thresholds for choosing among candidates, on word_similarity's 0–1 scale.
const (
	namedSim    = 0.6  // at or above: the question names this product
	namedSpread = 0.15 // other products this close to the best name match are named too
	maxProducts = 4
	fuzzyPicks  = 3 // products shown when no name matches — "something for joint pain"
)

// pickProducts narrows candidates to the products the answer will cover.
// When the question names a product, only products named about as clearly
// are kept — "Planscar" keeps both Planscar gel and Planscar injection and
// lets the model describe both or ask which. Otherwise the best few by
// fused score are kept and the model judges which, if any, fit.
func pickProducts(cands []candidate) []candidate {
	best := 0.0
	for _, c := range cands {
		best = max(best, c.NameSim)
	}
	var out []candidate
	if best >= namedSim {
		for _, c := range cands {
			if c.NameSim >= best-namedSpread && len(out) < maxProducts {
				out = append(out, c)
			}
		}
		return out
	}
	return cands[:min(fuzzyPicks, len(cands))]
}
