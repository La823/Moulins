package margsync

import (
	"context"
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

// Result summarizes one sync run, returned to the manual-trigger endpoint.
type Result struct {
	ProductsUpserted int `json:"products_upserted"`
	BatchesUpserted  int `json:"batches_upserted"`
	PartiesUpserted  int `json:"parties_upserted"`
}

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
	mrp        *string
	rate       *string
	prate      *string
	deal       *string
	free       *string
	totalStock float64
	batches    []MargProductRow
	anyLive    bool
}

// RunSync pulls master data from Marg (delta since lastSyncedAt, or a full
// pull if blank) and upserts it into margmaster_products /
// margmaster_product_batches / margmaster_party. Returns the DateTime Marg
// echoed back, for the caller to persist as the next delta cursor.
func RunSync(ctx context.Context, db *pgxpool.Pool, creds Credentials, lastSyncedAt string) (Result, string, error) {
	details, err := FetchMST2017(creds, lastSyncedAt)
	if err != nil {
		return Result{}, "", err
	}
	result, err := ApplySync(ctx, db, details)
	return result, details.DateTime, err
}

// ApplySync upserts an already-fetched/parsed MST2017 payload — the shared
// core of RunSync, also used to seed from a previously captured full pull
// (see ParseMST2017JSON) when Marg's full-sync rate limit is in effect.
func ApplySync(ctx context.Context, db *pgxpool.Pool, details mst2017Details) (Result, error) {
	var result Result

	// pro_N is always returned; pro_U only on delta pulls. Same row shape,
	// so just process them as one combined batch list.
	rows := append(append([]MargProductRow{}, details.ProN...), details.ProU...)

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
			g.mrp = parseNumeric(row.MRP)
			g.rate = parseNumeric(row.Rate)
			g.prate = parseNumeric(row.PRate)
			g.deal = parseNumeric(row.Deal)
			g.free = parseNumeric(row.Free)
			if stock, err := strconv.ParseFloat(strings.TrimSpace(row.Stock), 64); err == nil {
				g.totalStock += stock
			}
		}
	}

	for _, base := range order {
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

		var productID string
		err := db.QueryRow(ctx, `
			INSERT INTO margmaster_products
				(base_code, name, company, salt, gcode, mrp, rate, prate, deal, free,
				 total_stock, batch_count, current_batch, exp, is_deleted, synced_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
			ON CONFLICT (base_code) DO UPDATE SET
				name = $2, company = $3, salt = $4, gcode = $5, mrp = $6, rate = $7,
				prate = $8, deal = $9, free = $10, total_stock = $11, batch_count = $12,
				current_batch = $13, exp = $14, is_deleted = $15, synced_at = NOW()
			RETURNING id`,
			base, g.name, g.company, g.salt, g.gcode, g.mrp, g.rate, g.prate, g.deal, g.free,
			g.totalStock, len(g.batches), latestBatch, latestExp, !g.anyLive,
		).Scan(&productID)
		if err != nil {
			return result, err
		}
		result.ProductsUpserted++

		for _, b := range g.batches {
			stock, _ := strconv.ParseFloat(strings.TrimSpace(b.Stock), 64)
			_, err := db.Exec(ctx, `
				INSERT INTO margmaster_product_batches
					(margmaster_product_id, code, rid, curbatch, exp, stock, mrp, rate, prate, is_deleted, synced_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
				ON CONFLICT (code) DO UPDATE SET
					margmaster_product_id = $1, rid = $3, curbatch = $4, exp = $5, stock = $6,
					mrp = $7, rate = $8, prate = $9, is_deleted = $10, synced_at = NOW()`,
				productID, b.Code, b.Rid, b.CurBatch, b.Exp, stock,
				parseNumeric(b.MRP), parseNumeric(b.Rate), parseNumeric(b.PRate), isDeleted(b.IsDeleted),
			)
			if err != nil {
				return result, err
			}
			result.BatchesUpserted++
		}
	}

	for _, p := range details.Party {
		balance := parseNumeric(p.Balance)
		pdc := parseNumeric(p.Pdc)
		opening := parseNumeric(p.Opening)
		_, err := db.Exec(ctx, `
			INSERT INTO margmaster_party
				(rid, code, name, area, address, balance, pdc, gcode, opening, is_deleted,
				 phone1, phone2, phone3, phone4, email1, email2, email3, bank, branch,
				 margcode, gstin, dlno, ledgercode, synced_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())
			ON CONFLICT (rid) DO UPDATE SET
				code = $2, name = $3, area = $4, address = $5, balance = $6, pdc = $7,
				gcode = $8, opening = $9, is_deleted = $10, phone1 = $11, phone2 = $12,
				phone3 = $13, phone4 = $14, email1 = $15, email2 = $16, email3 = $17,
				bank = $18, branch = $19, margcode = $20, gstin = $21, dlno = $22,
				ledgercode = $23, synced_at = NOW()`,
			p.Rid, p.Code, p.Name, p.Area, p.Address, balance, pdc, p.Gcode, opening, isDeleted(p.IsDeleted),
			p.Phone1, p.Phone2, p.Phone3, p.Phone4, p.Email1, p.Email2, p.Email3,
			p.Bank, p.Branch, p.MargCode, p.GSTIN, p.DlNo, p.LedgerCode,
		)
		if err != nil {
			return result, err
		}
		result.PartiesUpserted++
	}

	return result, nil
}

// GetLastSyncedAt / SetLastSyncedAt manage the single-row delta cursor.
func GetLastSyncedAt(ctx context.Context, db *pgxpool.Pool) (string, error) {
	var lastSyncedAt *string
	err := db.QueryRow(ctx, `SELECT last_synced_at::text FROM margmaster_sync_state WHERE id = TRUE`).Scan(&lastSyncedAt)
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
