package margsync

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// stripBatchSuffixRE strips a trailing "[BATCH]" qualifier Marg appends to
// the name of every non-primary batch row, e.g. "PLANSCAR INJ 2 ML
// [PLX202326]" -> "PLANSCAR INJ 2 ML", so the deduped product gets a clean
// name.
var stripBatchSuffixRE = regexp.MustCompile(`\s*\[[^\]]*\]\s*$`)

func regexpStripBatchSuffix(name string) string {
	return stripBatchSuffixRE.ReplaceAllString(name, "")
}

// writeChunkSize is how many rows go into one bulk upsert. Every write in
// ApplySync is an unnest-of-arrays statement rather than one statement per
// row: the previous row-at-a-time version issued ~5,000 sequential round
// trips against a remote database, which took over 40 minutes for a full
// pull.
const writeChunkSize = 500

// Result summarizes one sync run, returned to the manual-trigger endpoint.
type Result struct {
	ProductsUpserted int `json:"products_upserted"`
	BatchesUpserted  int `json:"batches_upserted"`
	PartiesUpserted  int `json:"parties_upserted"`
	ProductsNew      int `json:"products_new"`
	RowsReceived     int `json:"rows_received"`
	RateUpdates      int `json:"rate_updates"`
	StockUpdates     int `json:"stock_updates"`
}

// Progress is a snapshot of a sync in flight, handed to a ProgressFunc so a
// long run can be watched live from the admin panel instead of the caller
// staring at a request that hasn't returned.
type Progress struct {
	Phase         string
	RowsReceived  int
	ProductsTotal int
	ProductsDone  int
	ProductsNew   int
	BatchesDone   int
	PartiesTotal  int
	PartiesDone   int
}

// ProgressFunc receives progress snapshots. It is called from the sync
// goroutine, may be called frequently, and must not block for long.
type ProgressFunc func(Progress)

func parseNumeric(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if _, err := strconv.ParseFloat(s, 64); err != nil {
		return nil
	}
	return &s
}

// numOrNil renders a JSON-number rate tier for the numeric columns. Zero is
// stored as NULL rather than 0: Marg sends 0 both for "no tier configured"
// and genuinely-zero, and every populated tier in the data is > 0, so NULL
// keeps "unset" distinguishable from a real price.
func numOrNil(f float64) *string {
	if f == 0 {
		return nil
	}
	v := strconv.FormatFloat(f, 'f', -1, 64)
	return &v
}

func isDeleted(s string) bool {
	return strings.TrimSpace(s) == "1"
}

// baseCode is the dedup key: Marg's raw code is either a bare base code
// (e.g. "1002126") or "base-BATCH" (e.g. "1002126-PLX202326") — every
// batch of the same physical product shares the part before the first "-".
func baseCode(code string) string {
	if i := strings.Index(code, "-"); i >= 0 {
		return code[:i]
	}
	return code
}

// groupedProduct accumulates every batch row for one base code so the
// dedup table can be built in one pass.
type groupedProduct struct {
	name       string
	company    string
	salt       string
	gcode      string
	gcode6     string
	mrp        *string
	rate       *string
	prate      *string
	rateB      *string
	rateC      *string
	rateD      *string
	rateF      *string
	deal       *string
	free       *string
	totalStock float64
	batches    []MargProductRow
	anyLive    bool
}

// commodityCodeMap resolves a product's Gcode6 to its actual HSN code, built
// from the "COMMCD" group of Marg's Stype sub-master lookup table (rows
// shaped {sgcode, scode, name} — scode is the short reference, name is the
// real value). Deleted rows are skipped so a removed/renamed commodity code
// doesn't resolve to stale data.
func commodityCodeMap(stype []MargStypeRow) map[string]string {
	m := map[string]string{}
	for _, s := range stype {
		if strings.TrimSpace(s.Sgcode) != "COMMCD" || isDeleted(s.IsDeleted) {
			continue
		}
		scode := strings.TrimSpace(s.Scode)
		name := strings.TrimSpace(s.Name)
		if scode == "" || name == "" {
			continue
		}
		// Marg pads some COMMCD entries by repeating the code with
		// whitespace in between (e.g. "84425010       84425010") instead of
		// storing it once — collapse that down to the single real value.
		if fields := strings.Fields(name); len(fields) == 2 && fields[0] == fields[1] {
			name = fields[0]
		}
		m[scode] = name
	}
	return m
}

// ValidatePull checks a parsed response for the failure modes that would
// otherwise be applied silently as if complete.
//
// This exists because a pull that omitted ten real products still reported
// Status "Sucess" and Datastatus "Completed". Trusting Status alone, then
// advancing the delta cursor past data we never received, makes those rows
// permanently invisible: every later delta asks "what changed since T" and
// they changed before T.
//
// isFull says whether this was a full pull (Datetime blank) or a windowed
// delta. haveBatches is the number of batch rows already mirrored; a FULL
// pull returning fewer rows than we already hold is truncated by definition.
// A delta legitimately returns fewer, so the floor only applies to full pulls.
func ValidatePull(details mst2017Details, isFull bool, haveBatches int) error {
	if ds := strings.TrimSpace(details.Datastatus); ds != "" && ds != "Completed" {
		return fmt.Errorf("Marg reported Datastatus %q (expected \"Completed\") — response may be partial", ds)
	}
	if isFull && haveBatches > 0 && details.RowCount() == 0 {
		return fmt.Errorf("full pull returned no product rows but the mirror holds %d — refusing to apply", haveBatches)
	}
	return nil
}

// RunSync pulls master data from Marg (delta since lastSyncedAt, or a full
// pull if blank) and upserts it. Returns the DateTime Marg echoed back, for
// the caller to persist as the next delta cursor.
//
// The cursor is only safe to advance when the returned error is nil AND the
// pull passed ValidatePull — RunSync enforces the latter itself, returning
// an error rather than a half-applied mirror plus a cursor that skips past
// the missing rows.
func RunSync(ctx context.Context, db *pgxpool.Pool, creds Credentials, lastSyncedAt string) (Result, string, error) {
	return RunSyncWindow(ctx, db, creds, lastSyncedAt, nil)
}

// RunSyncWindow is RunSync with an optional progress callback. datetime
// blank = full pull; anything else = a delta since that timestamp.
func RunSyncWindow(ctx context.Context, db *pgxpool.Pool, creds Credentials, datetime string, progress ProgressFunc) (Result, string, error) {
	report := func(p Progress) {
		if progress != nil {
			progress(p)
		}
	}
	report(Progress{Phase: "fetching"})

	details, err := FetchMST2017(creds, datetime)
	if err != nil {
		return Result{}, "", err
	}

	report(Progress{Phase: "validating", RowsReceived: details.RowCount()})

	var haveBatches int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM margmaster_product_batches`).Scan(&haveBatches)
	if err := ValidatePull(details, strings.TrimSpace(datetime) == "", haveBatches); err != nil {
		return Result{}, "", err
	}

	result, err := ApplySyncProgress(ctx, db, details, progress)
	if err != nil {
		// Deliberately return "" as the cursor: a failed apply must not let
		// the caller move the delta cursor forward.
		return result, "", err
	}
	return result, details.DateTime, nil
}

// ApplySync upserts an already-fetched/parsed MST2017 payload — the shared
// core of RunSync, also used to seed from a previously captured full pull
// (see ParseMST2017JSON) when Marg's full-sync rate limit is in effect.
func ApplySync(ctx context.Context, db *pgxpool.Pool, details mst2017Details) (Result, error) {
	return ApplySyncProgress(ctx, db, details, nil)
}

// ApplySyncProgress is ApplySync with progress reporting.
func ApplySyncProgress(ctx context.Context, db *pgxpool.Pool, details mst2017Details, progress ProgressFunc) (Result, error) {
	var result Result
	report := func(p Progress) {
		if progress != nil {
			progress(p)
		}
	}

	commcd := commodityCodeMap(details.Stype)

	// pro_N is always returned; pro_U only on delta pulls. Same row shape,
	// so just process them as one combined batch list.
	//
	// The two lists are NOT disjoint: on a delta pull the same batch row
	// routinely appears in both. Dedupe by code before grouping — last
	// occurrence wins, so pro_U's newer values override pro_N's — because
	// the per-product totals below (totalStock, batch_count) accumulate
	// once per row and would otherwise count the same batch twice.
	combined := append(append([]MargProductRow{}, details.ProN...), details.ProU...)
	rows := make([]MargProductRow, 0, len(combined))
	rowIndex := make(map[string]int, len(combined))
	for _, row := range combined {
		if i, seen := rowIndex[row.Code]; seen {
			rows[i] = row
			continue
		}
		rowIndex[row.Code] = len(rows)
		rows = append(rows, row)
	}
	result.RowsReceived = len(rows)

	groups := map[string]*groupedProduct{}
	order := []string{}
	for _, row := range rows {
		base := baseCode(row.Code)
		g, ok := groups[base]
		if !ok {
			g = &groupedProduct{}
			groups[base] = g
			order = append(order, base)
		}
		g.batches = append(g.batches, row)
		if !isDeleted(row.IsDeleted) {
			g.anyLive = true
			// A live batch row's own fields are the most representative
			// values for the deduped product (the bare-base-code row is
			// usually a deleted placeholder with a bracket-stripped name).
			g.name = strings.TrimSuffix(strings.TrimSpace(row.Name), "[]")
			g.name = strings.TrimSpace(regexpStripBatchSuffix(g.name))
			g.company = row.Company
			g.salt = row.Salt
			g.gcode = row.GCode
			g.gcode6 = row.Gcode6
			g.mrp = parseNumeric(row.MRP)
			g.rate = parseNumeric(row.Rate)
			g.prate = parseNumeric(row.PRate)
			g.rateB = numOrNil(row.RateB)
			g.rateC = numOrNil(row.RateC)
			g.rateD = numOrNil(row.RateD)
			g.rateF = numOrNil(row.RateF)
			g.deal = parseNumeric(row.Deal)
			g.free = parseNumeric(row.Free)
			if stock, err := strconv.ParseFloat(strings.TrimSpace(row.Stock), 64); err == nil {
				g.totalStock += stock
			}
		}
	}

	// Which base codes are genuinely new? Worth reporting separately: "added
	// 10 products" is the number staff actually care about, as opposed to
	// the upsert count, which is just "every row we touched".
	existing := map[string]bool{}
	if erows, err := db.Query(ctx, `SELECT base_code FROM margmaster_products`); err == nil {
		for erows.Next() {
			var c string
			if erows.Scan(&c) == nil {
				existing[c] = true
			}
		}
		erows.Close()
	}
	for _, base := range order {
		if !existing[base] {
			result.ProductsNew++
		}
	}

	report(Progress{
		Phase: "products", RowsReceived: len(rows),
		ProductsTotal: len(order), ProductsNew: result.ProductsNew,
		PartiesTotal: len(details.Party),
	})

	// ---- products -------------------------------------------------------
	productIDs := make(map[string]string, len(order))
	resolvedHSN := make(map[string]string, len(order))

	for start := 0; start < len(order); start += writeChunkSize {
		end := start + writeChunkSize
		if end > len(order) {
			end = len(order)
		}
		chunk := order[start:end]
		n := len(chunk)

		bases := make([]string, n)
		names := make([]string, n)
		companies := make([]string, n)
		salts := make([]string, n)
		gcodes := make([]string, n)
		gcode6s := make([]string, n)
		hsns := make([]*string, n)
		mrps := make([]*string, n)
		rates := make([]*string, n)
		prates := make([]*string, n)
		rbs := make([]*string, n)
		rcs := make([]*string, n)
		rds := make([]*string, n)
		rfs := make([]*string, n)
		deals := make([]*string, n)
		frees := make([]*string, n)
		stocks := make([]string, n)
		counts := make([]string, n)
		curBatches := make([]string, n)
		exps := make([]string, n)
		dels := make([]bool, n)

		for i, base := range chunk {
			g := groups[base]
			if g.name == "" && len(g.batches) > 0 {
				g.name = g.batches[0].Name
			}
			var latestBatch, latestExp string
			for _, b := range g.batches {
				if !isDeleted(b.IsDeleted) && b.Exp > latestExp {
					latestExp = b.Exp
					latestBatch = b.CurBatch
				}
			}
			// Resolve HSN from the commodity-code lookup. A blank/unmatched
			// Gcode6 (nil) leaves the column untouched via COALESCE, rather
			// than nulling out a previously-resolved value — Stype is a small
			// table that may be omitted entirely on delta pulls.
			if v, ok := commcd[strings.TrimSpace(g.gcode6)]; ok && v != "" {
				vv := v
				hsns[i] = &vv
			}
			bases[i], names[i], companies[i] = base, g.name, g.company
			salts[i], gcodes[i], gcode6s[i] = g.salt, g.gcode, g.gcode6
			mrps[i], rates[i], prates[i] = g.mrp, g.rate, g.prate
			rbs[i], rcs[i], rds[i], rfs[i] = g.rateB, g.rateC, g.rateD, g.rateF
			deals[i], frees[i] = g.deal, g.free
			stocks[i] = strconv.FormatFloat(g.totalStock, 'f', -1, 64)
			counts[i] = strconv.Itoa(len(g.batches))
			curBatches[i], exps[i], dels[i] = latestBatch, latestExp, !g.anyLive
		}

		qrows, err := db.Query(ctx, `
			INSERT INTO margmaster_products
				(base_code, name, company, salt, gcode, gcode6, hsn_code, mrp, rate, prate,
				 deal, free, total_stock, batch_count, current_batch, exp, is_deleted,
				 rate_b, rate_c, rate_d, rate_f, synced_at)
			SELECT t.base_code, t.name, t.company, t.salt, t.gcode, t.gcode6, t.hsn,
			       t.mrp::numeric, t.rate::numeric, t.prate::numeric, t.deal::numeric, t.free::numeric,
			       t.total_stock::numeric, t.batch_count::int, t.current_batch, t.exp, t.is_deleted,
			       t.rate_b::numeric, t.rate_c::numeric, t.rate_d::numeric, t.rate_f::numeric, NOW()
			FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
			            $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],
			            $14::text[],$15::text[],$16::text[],$17::bool[],
			            $18::text[],$19::text[],$20::text[],$21::text[])
			     AS t(base_code,name,company,salt,gcode,gcode6,hsn,mrp,rate,prate,deal,free,
			          total_stock,batch_count,current_batch,exp,is_deleted,rate_b,rate_c,rate_d,rate_f)
			ON CONFLICT (base_code) DO UPDATE SET
				name = EXCLUDED.name, company = EXCLUDED.company, salt = EXCLUDED.salt,
				gcode = EXCLUDED.gcode, gcode6 = EXCLUDED.gcode6,
				hsn_code = COALESCE(EXCLUDED.hsn_code, margmaster_products.hsn_code),
				mrp = EXCLUDED.mrp, rate = EXCLUDED.rate, prate = EXCLUDED.prate,
				deal = EXCLUDED.deal, free = EXCLUDED.free,
				total_stock = EXCLUDED.total_stock, batch_count = EXCLUDED.batch_count,
				current_batch = EXCLUDED.current_batch, exp = EXCLUDED.exp,
				is_deleted = EXCLUDED.is_deleted,
				rate_b = EXCLUDED.rate_b, rate_c = EXCLUDED.rate_c,
				rate_d = EXCLUDED.rate_d, rate_f = EXCLUDED.rate_f, synced_at = NOW()
			RETURNING id, base_code, hsn_code`,
			bases, names, companies, salts, gcodes, gcode6s, hsns,
			mrps, rates, prates, deals, frees, stocks, counts, curBatches, exps, dels,
			rbs, rcs, rds, rfs)
		if err != nil {
			return result, fmt.Errorf("upsert products: %w", err)
		}
		for qrows.Next() {
			var id, base string
			var hsn *string
			if err := qrows.Scan(&id, &base, &hsn); err != nil {
				qrows.Close()
				return result, err
			}
			productIDs[base] = id
			if hsn != nil && *hsn != "" {
				resolvedHSN[base] = *hsn
			}
		}
		qrows.Close()
		if err := qrows.Err(); err != nil {
			return result, fmt.Errorf("upsert products: %w", err)
		}

		result.ProductsUpserted += n
		report(Progress{
			Phase: "products", RowsReceived: len(rows),
			ProductsTotal: len(order), ProductsDone: result.ProductsUpserted,
			ProductsNew: result.ProductsNew, PartiesTotal: len(details.Party),
		})
	}

	// ---- push resolved HSN codes into the live catalog -------------------
	// Only products already linked to a Marg base code are touched, so a
	// manually entered code on an unlinked product is never overwritten.
	if len(resolvedHSN) > 0 {
		margCodes := make([]string, 0, len(resolvedHSN))
		hsnValues := make([]string, 0, len(resolvedHSN))
		for base, hsn := range resolvedHSN {
			margCodes = append(margCodes, base)
			hsnValues = append(hsnValues, hsn)
		}
		if _, err := db.Exec(ctx, `
			UPDATE products p SET hsn_code = t.hsn
			FROM unnest($1::text[], $2::text[]) AS t(marg_code, hsn)
			WHERE p.marg_code = t.marg_code AND p.hsn_code IS DISTINCT FROM t.hsn`,
			margCodes, hsnValues); err != nil {
			return result, fmt.Errorf("propagate hsn codes: %w", err)
		}
	}

	// ---- batches --------------------------------------------------------
	type batchRow struct {
		pid, code, rid, curbatch, exp, stock  string
		mrp, rate, prate                      *string
		rateB, rateC, rateD, rateF            *string
		deleted                               bool
	}
	all := make([]batchRow, 0, len(rows))
	for _, base := range order {
		pid, ok := productIDs[base]
		if !ok {
			continue
		}
		for _, b := range groups[base].batches {
			stock, _ := strconv.ParseFloat(strings.TrimSpace(b.Stock), 64)
			all = append(all, batchRow{
				pid: pid, code: b.Code, rid: b.Rid, curbatch: b.CurBatch, exp: b.Exp,
				stock: strconv.FormatFloat(stock, 'f', -1, 64),
				mrp:   parseNumeric(b.MRP), rate: parseNumeric(b.Rate), prate: parseNumeric(b.PRate),
				rateB: numOrNil(b.RateB), rateC: numOrNil(b.RateC),
				rateD: numOrNil(b.RateD), rateF: numOrNil(b.RateF),
				deleted: isDeleted(b.IsDeleted),
			})
		}
	}

	report(Progress{
		Phase: "batches", RowsReceived: len(rows),
		ProductsTotal: len(order), ProductsDone: result.ProductsUpserted,
		ProductsNew: result.ProductsNew, PartiesTotal: len(details.Party),
	})

	for start := 0; start < len(all); start += writeChunkSize {
		end := start + writeChunkSize
		if end > len(all) {
			end = len(all)
		}
		chunk := all[start:end]
		n := len(chunk)

		pids := make([]string, n)
		codes := make([]string, n)
		rids := make([]string, n)
		curbatches := make([]string, n)
		exps := make([]string, n)
		stocks := make([]string, n)
		mrps := make([]*string, n)
		brates := make([]*string, n)
		bprates := make([]*string, n)
		bbs := make([]*string, n)
		bcs := make([]*string, n)
		bds := make([]*string, n)
		bfs := make([]*string, n)
		bdels := make([]bool, n)
		for i, b := range chunk {
			pids[i], codes[i], rids[i] = b.pid, b.code, b.rid
			curbatches[i], exps[i], stocks[i] = b.curbatch, b.exp, b.stock
			mrps[i], brates[i], bprates[i] = b.mrp, b.rate, b.prate
			bbs[i], bcs[i], bds[i], bfs[i] = b.rateB, b.rateC, b.rateD, b.rateF
			bdels[i] = b.deleted
		}

		if _, err := db.Exec(ctx, `
			INSERT INTO margmaster_product_batches
				(margmaster_product_id, code, rid, curbatch, exp, stock, mrp, rate, prate,
				 rate_b, rate_c, rate_d, rate_f, is_deleted, synced_at)
			SELECT t.pid::uuid, t.code, t.rid, t.curbatch, t.exp, t.stock::numeric,
			       t.mrp::numeric, t.rate::numeric, t.prate::numeric,
			       t.rate_b::numeric, t.rate_c::numeric, t.rate_d::numeric, t.rate_f::numeric,
			       t.is_deleted, NOW()
			FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],
			            $7::text[],$8::text[],$9::text[],
			            $10::text[],$11::text[],$12::text[],$13::text[],$14::bool[])
			     AS t(pid,code,rid,curbatch,exp,stock,mrp,rate,prate,rate_b,rate_c,rate_d,rate_f,is_deleted)
			ON CONFLICT (code) DO UPDATE SET
				margmaster_product_id = EXCLUDED.margmaster_product_id,
				rid = EXCLUDED.rid, curbatch = EXCLUDED.curbatch, exp = EXCLUDED.exp,
				stock = EXCLUDED.stock, mrp = EXCLUDED.mrp, rate = EXCLUDED.rate,
				prate = EXCLUDED.prate,
				rate_b = EXCLUDED.rate_b, rate_c = EXCLUDED.rate_c,
				rate_d = EXCLUDED.rate_d, rate_f = EXCLUDED.rate_f,
				is_deleted = EXCLUDED.is_deleted, synced_at = NOW()`,
			pids, codes, rids, curbatches, exps, stocks, mrps, brates, bprates,
			bbs, bcs, bds, bfs, bdels); err != nil {
			return result, fmt.Errorf("upsert batches: %w", err)
		}

		result.BatchesUpserted += n
		report(Progress{
			Phase: "batches", RowsReceived: len(rows),
			ProductsTotal: len(order), ProductsDone: result.ProductsUpserted,
			ProductsNew: result.ProductsNew, BatchesDone: result.BatchesUpserted,
			PartiesTotal: len(details.Party),
		})
	}

	// ---- pro_R / pro_S : rate-only and stock-only updates ----------------
	// Delta pulls deliver a price or stock change for an existing batch
	// through these feeds rather than through pro_N/pro_U, and they were
	// previously parsed into nothing at all — so a rate change could arrive
	// and be discarded, leaving the mirror quietly wrong. They are keyed by
	// the same batch `code`, so an UPDATE joined on it is enough; rows for
	// codes we have never seen are ignored rather than inserted, since these
	// feeds carry no name/company to build a product from.
	if len(details.ProR) > 0 {
		for start := 0; start < len(details.ProR); start += writeChunkSize {
			end := start + writeChunkSize
			if end > len(details.ProR) {
				end = len(details.ProR)
			}
			chunk := details.ProR[start:end]
			n := len(chunk)
			codes := make([]string, n)
			stocks := make([]*string, n)
			mrps := make([]*string, n)
			rates := make([]*string, n)
			prates := make([]*string, n)
			rbs := make([]*string, n)
			rcs := make([]*string, n)
			rds := make([]*string, n)
			rfs := make([]*string, n)
			for i, r := range chunk {
				codes[i] = r.Code
				stocks[i] = parseNumeric(r.Stock)
				mrps[i], rates[i], prates[i] = parseNumeric(r.MRP), parseNumeric(r.Rate), parseNumeric(r.PRate)
				rbs[i], rcs[i], rds[i], rfs[i] = numOrNil(r.RateB), numOrNil(r.RateC), numOrNil(r.RateD), numOrNil(r.RateF)
			}
			if _, err := db.Exec(ctx, `
				UPDATE margmaster_product_batches b
				SET stock = COALESCE(t.stock::numeric, b.stock),
				    mrp   = COALESCE(t.mrp::numeric, b.mrp),
				    rate  = COALESCE(t.rate::numeric, b.rate),
				    prate = COALESCE(t.prate::numeric, b.prate),
				    rate_b = t.rate_b::numeric, rate_c = t.rate_c::numeric,
				    rate_d = t.rate_d::numeric, rate_f = t.rate_f::numeric,
				    synced_at = NOW()
				FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],
				            $6::text[],$7::text[],$8::text[],$9::text[])
				     AS t(code,stock,mrp,rate,prate,rate_b,rate_c,rate_d,rate_f)
				WHERE b.code = t.code`,
				codes, stocks, mrps, rates, prates, rbs, rcs, rds, rfs); err != nil {
				return result, fmt.Errorf("apply rate updates (pro_R): %w", err)
			}
			result.RateUpdates += n
		}
	}

	if len(details.ProS) > 0 {
		for start := 0; start < len(details.ProS); start += writeChunkSize {
			end := start + writeChunkSize
			if end > len(details.ProS) {
				end = len(details.ProS)
			}
			chunk := details.ProS[start:end]
			n := len(chunk)
			codes := make([]string, n)
			stocks := make([]*string, n)
			for i, r := range chunk {
				codes[i], stocks[i] = r.Code, parseNumeric(r.Stock)
			}
			if _, err := db.Exec(ctx, `
				UPDATE margmaster_product_batches b
				SET stock = COALESCE(t.stock::numeric, b.stock), synced_at = NOW()
				FROM unnest($1::text[],$2::text[]) AS t(code,stock)
				WHERE b.code = t.code`, codes, stocks); err != nil {
				return result, fmt.Errorf("apply stock updates (pro_S): %w", err)
			}
			result.StockUpdates += n
		}
	}

	// ---- reconcile the denormalised per-product totals -------------------
	// total_stock and batch_count must describe every batch the mirror holds
	// for a product, not just the ones this pull happened to contain. A
	// delta returns an arbitrary subset of a product's batches, so computing
	// these from the payload alone understates them (a product with four
	// batches in the mirror and one in the delta would report batch_count 1).
	// Recompute from margmaster_product_batches, which is the source of
	// truth, for exactly the products this run touched.
	// pro_R/pro_S change batch stock without going through pro_N/pro_U, so
	// their products need reconciling too or their totals go stale.
	extraBases := map[string]bool{}
	for _, r := range details.ProR {
		extraBases[baseCode(r.Code)] = true
	}
	for _, r := range details.ProS {
		extraBases[baseCode(r.Code)] = true
	}
	for base := range extraBases {
		if _, ok := productIDs[base]; ok {
			continue // already in productIDs from this pull
		}
		var id string
		if err := db.QueryRow(ctx,
			`SELECT id FROM margmaster_products WHERE base_code = $1`, base).Scan(&id); err == nil {
			productIDs[base] = id
		}
	}

	if len(productIDs) > 0 {
		touched := make([]string, 0, len(productIDs))
		for _, id := range productIDs {
			touched = append(touched, id)
		}
		if _, err := db.Exec(ctx, `
			UPDATE margmaster_products p
			SET total_stock = s.stock, batch_count = s.n
			FROM (
				SELECT margmaster_product_id AS id,
				       COALESCE(SUM(stock) FILTER (WHERE NOT is_deleted), 0) AS stock,
				       COUNT(*) AS n
				FROM margmaster_product_batches
				WHERE margmaster_product_id = ANY($1::uuid[])
				GROUP BY margmaster_product_id
			) s
			WHERE p.id = s.id
			  AND (p.total_stock IS DISTINCT FROM s.stock OR p.batch_count IS DISTINCT FROM s.n)`,
			touched); err != nil {
			return result, fmt.Errorf("reconcile product totals: %w", err)
		}
	}

	// ---- parties --------------------------------------------------------
	report(Progress{
		Phase: "parties", RowsReceived: len(rows),
		ProductsTotal: len(order), ProductsDone: result.ProductsUpserted,
		ProductsNew: result.ProductsNew, BatchesDone: result.BatchesUpserted,
		PartiesTotal: len(details.Party),
	})

	for start := 0; start < len(details.Party); start += writeChunkSize {
		end := start + writeChunkSize
		if end > len(details.Party) {
			end = len(details.Party)
		}
		chunk := details.Party[start:end]
		n := len(chunk)

		rids := make([]string, n)
		pcodes := make([]string, n)
		pnames := make([]string, n)
		areas := make([]string, n)
		addrs := make([]string, n)
		balances := make([]*string, n)
		pdcs := make([]*string, n)
		pgcodes := make([]string, n)
		openings := make([]*string, n)
		pdels := make([]bool, n)
		ph1 := make([]string, n)
		ph2 := make([]string, n)
		ph3 := make([]string, n)
		ph4 := make([]string, n)
		em1 := make([]string, n)
		em2 := make([]string, n)
		em3 := make([]string, n)
		banks := make([]string, n)
		branches := make([]string, n)
		margcodes := make([]string, n)
		gstins := make([]string, n)
		dlnos := make([]string, n)
		ledgers := make([]string, n)

		for i, p := range chunk {
			rids[i], pcodes[i], pnames[i] = p.Rid, p.Code, p.Name
			areas[i], addrs[i] = p.Area, p.Address
			balances[i], pdcs[i], openings[i] = parseNumeric(p.Balance), parseNumeric(p.Pdc), parseNumeric(p.Opening)
			pgcodes[i], pdels[i] = p.Gcode, isDeleted(p.IsDeleted)
			ph1[i], ph2[i], ph3[i], ph4[i] = p.Phone1, p.Phone2, p.Phone3, p.Phone4
			em1[i], em2[i], em3[i] = p.Email1, p.Email2, p.Email3
			banks[i], branches[i] = p.Bank, p.Branch
			margcodes[i], gstins[i], dlnos[i], ledgers[i] = p.MargCode, p.GSTIN, p.DlNo, p.LedgerCode
		}

		if _, err := db.Exec(ctx, `
			INSERT INTO margmaster_party
				(rid, code, name, area, address, balance, pdc, gcode, opening, is_deleted,
				 phone1, phone2, phone3, phone4, email1, email2, email3, bank, branch,
				 margcode, gstin, dlno, ledgercode, synced_at)
			SELECT t.rid, t.code, t.name, t.area, t.address, t.balance::numeric, t.pdc::numeric,
			       t.gcode, t.opening::numeric, t.is_deleted,
			       t.phone1, t.phone2, t.phone3, t.phone4, t.email1, t.email2, t.email3,
			       t.bank, t.branch, t.margcode, t.gstin, t.dlno, t.ledgercode, NOW()
			FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
			            $8::text[],$9::text[],$10::bool[],$11::text[],$12::text[],$13::text[],
			            $14::text[],$15::text[],$16::text[],$17::text[],$18::text[],$19::text[],
			            $20::text[],$21::text[],$22::text[],$23::text[])
			     AS t(rid,code,name,area,address,balance,pdc,gcode,opening,is_deleted,
			          phone1,phone2,phone3,phone4,email1,email2,email3,bank,branch,
			          margcode,gstin,dlno,ledgercode)
			ON CONFLICT (rid) DO UPDATE SET
				code = EXCLUDED.code, name = EXCLUDED.name, area = EXCLUDED.area,
				address = EXCLUDED.address, balance = EXCLUDED.balance, pdc = EXCLUDED.pdc,
				gcode = EXCLUDED.gcode, opening = EXCLUDED.opening, is_deleted = EXCLUDED.is_deleted,
				phone1 = EXCLUDED.phone1, phone2 = EXCLUDED.phone2, phone3 = EXCLUDED.phone3,
				phone4 = EXCLUDED.phone4, email1 = EXCLUDED.email1, email2 = EXCLUDED.email2,
				email3 = EXCLUDED.email3, bank = EXCLUDED.bank, branch = EXCLUDED.branch,
				margcode = EXCLUDED.margcode, gstin = EXCLUDED.gstin, dlno = EXCLUDED.dlno,
				ledgercode = EXCLUDED.ledgercode, synced_at = NOW()`,
			rids, pcodes, pnames, areas, addrs, balances, pdcs, pgcodes, openings, pdels,
			ph1, ph2, ph3, ph4, em1, em2, em3, banks, branches,
			margcodes, gstins, dlnos, ledgers); err != nil {
			return result, fmt.Errorf("upsert parties: %w", err)
		}

		result.PartiesUpserted += n
		report(Progress{
			Phase: "parties", RowsReceived: len(rows),
			ProductsTotal: len(order), ProductsDone: result.ProductsUpserted,
			ProductsNew: result.ProductsNew, BatchesDone: result.BatchesUpserted,
			PartiesTotal: len(details.Party), PartiesDone: result.PartiesUpserted,
		})
	}

	report(Progress{
		Phase: "done", RowsReceived: len(rows),
		ProductsTotal: len(order), ProductsDone: result.ProductsUpserted,
		ProductsNew: result.ProductsNew, BatchesDone: result.BatchesUpserted,
		PartiesTotal: len(details.Party), PartiesDone: result.PartiesUpserted,
	})
	return result, nil
}

// GetLastSyncedAt / SetLastSyncedAt manage the single-row delta cursor.
func GetLastSyncedAt(ctx context.Context, db *pgxpool.Pool) (string, error) {
	// Format without a timezone offset — Marg expects bare "YYYY-MM-DD HH:MM:SS"
	// and a naive ::text cast on a TIMESTAMPTZ appends a "+00" suffix it can't
	// parse, silently causing every delta pull to match nothing.
	var lastSyncedAt *string
	err := db.QueryRow(ctx, `SELECT to_char(last_synced_at, 'YYYY-MM-DD HH24:MI:SS') FROM margmaster_sync_state WHERE id = TRUE`).Scan(&lastSyncedAt)
	if err != nil {
		return "", nil // no row yet -> full pull
	}
	if lastSyncedAt == nil {
		return "", nil
	}
	return *lastSyncedAt, nil
}

func SetLastSyncedAt(ctx context.Context, db *pgxpool.Pool, dateTime string) error {
	if dateTime == "" {
		return nil
	}
	_, err := db.Exec(ctx, `
		INSERT INTO margmaster_sync_state (id, last_synced_at) VALUES (TRUE, $1)
		ON CONFLICT (id) DO UPDATE SET last_synced_at = $1`,
		dateTime,
	)
	return err
}
