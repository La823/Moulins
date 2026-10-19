package margede

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// SetCounts is what one table's sync did.
type SetCounts struct {
	Received int
	New      int
	Changed  int
	Deleted  int
}

// syncSet writes one blob into one table the way bills are written: only
// new or changed rows (by row hash), and on a full pull, rows stored but no
// longer sent are marked deleted — unless the pull looks truncated.
type syncSet[T any] struct {
	label  string // for messages
	table  string
	keyCol string
	rows   []T
	key    func(T) int64
	hash   func(T) string
	upsert func(context.Context, pgx.Tx, []T) error
}

func applySet[T any](ctx context.Context, tx pgx.Tx, s syncSet[T], full bool, res *Result) (SetCounts, error) {
	var c SetCounts

	// Dedupe by key, last occurrence wins.
	rows := make([]T, 0, len(s.rows))
	idx := map[int64]int{}
	for _, r := range s.rows {
		k := s.key(r)
		if i, ok := idx[k]; ok {
			rows[i] = r
			continue
		}
		idx[k] = len(rows)
		rows = append(rows, r)
	}
	c.Received = len(rows)

	stored, err := loadHashes(ctx, tx, fmt.Sprintf(`SELECT %s, row_hash, is_deleted FROM %s`, s.keyCol, s.table))
	if err != nil {
		return c, fmt.Errorf("read stored %s: %w", s.label, err)
	}
	changed := make([]T, 0)
	for _, r := range rows {
		if old, ok := stored[s.key(r)]; !ok {
			c.New++
			changed = append(changed, r)
		} else if old.hash != s.hash(r) || old.deleted {
			c.Changed++
			changed = append(changed, r)
		}
	}
	for start := 0; start < len(changed); start += writeChunkSize {
		if err := s.upsert(ctx, tx, changed[start:min(start+writeChunkSize, len(changed))]); err != nil {
			return c, fmt.Errorf("upsert %s: %w", s.label, err)
		}
	}

	if !full || len(rows) == 0 {
		return c, nil
	}
	live := 0
	for _, h := range stored {
		if !h.deleted {
			live++
		}
	}
	if live > 0 && float64(len(rows)) < minFullPullShare*float64(live) {
		res.Warning = joinWarnings(res.Warning,
			fmt.Sprintf("full pull had %d %s against %d stored — %s deletions were not applied", len(rows), s.label, live, s.label))
		return c, nil
	}
	keys := make([]int64, len(rows))
	for i, r := range rows {
		keys[i] = s.key(r)
	}
	tag, err := tx.Exec(ctx, fmt.Sprintf(`
		UPDATE %s SET is_deleted = TRUE, last_changed_at = NOW(), synced_at = NOW()
		WHERE NOT is_deleted AND NOT (%s = ANY($1::bigint[]))`, s.table, s.keyCol), keys)
	if err != nil {
		return c, fmt.Errorf("mark deleted %s: %w", s.label, err)
	}
	c.Deleted = int(tag.RowsAffected())
	return c, nil
}

// applyProductsAndStock writes the Product and Stock blobs.
func applyProductsAndStock(ctx context.Context, tx pgx.Tx, d Details, full bool, res *Result) error {
	lk := BuildLookups(d.SaleTypes)
	products := make([]Product, 0, len(d.Products))
	for _, r := range d.Products {
		if p := ToProduct(r, lk); p.Name != "" && p.PID != 0 {
			products = append(products, p)
		}
	}
	var err error
	res.Products, err = applySet(ctx, tx, syncSet[Product]{
		label: "products", table: "marg_ede_products", keyCol: "product_pid", rows: products,
		key: func(p Product) int64 { return p.PID }, hash: func(p Product) string { return p.Hash },
		upsert: upsertProducts,
	}, full, res)
	if err != nil {
		return err
	}

	stock := make([]StockBatch, 0, len(d.Stock))
	for _, r := range d.Stock {
		if s := ToStock(r); s.ProductPID != 0 {
			stock = append(stock, s)
		}
	}
	res.Stock, err = applySet(ctx, tx, syncSet[StockBatch]{
		label: "stock batches", table: "marg_ede_stock", keyCol: "marg_id", rows: stock,
		key: func(s StockBatch) int64 { return s.MargID }, hash: func(s StockBatch) string { return s.Hash },
		upsert: upsertStock,
	}, full, res)
	return err
}

func upsertProducts(ctx context.Context, tx pgx.Tx, rows []Product) error {
	n := len(rows)
	var (
		pid, margID                                 = make([]int64, n), make([]int64, n)
		name, kind, addField, hash                  = make([]string, n), make([]string, n), make([]string, n), make([]string, n)
		code, unit, cCode, cName, fCode, fName, hsn = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		pack                                        = make([]*float64, n)
		gst                                         = make([]float64, n)
	)
	for i, p := range rows {
		pid[i], margID[i], name[i], kind[i], addField[i], hash[i] = p.PID, p.MargID, p.Name, p.Kind, p.AddField, p.Hash
		code[i], unit[i], cCode[i], cName[i] = p.Code, p.Unit, p.CompanyCode, p.CompanyName
		fCode[i], fName[i], hsn[i], pack[i], gst[i] = p.FormCode, p.FormName, p.HSNCode, p.Pack, p.GSTPercent
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO marg_ede_products AS m
			(product_pid, marg_id, code, name, unit, pack, kind, company_code, company_name,
			 form_code, form_name, hsn_code, gst_percent, add_field, row_hash, is_deleted)
		SELECT t.pid, t.marg_id, t.code, t.name, t.unit, t.pack::numeric, t.kind, t.c_code, t.c_name,
		       t.f_code, t.f_name, t.hsn, t.gst::numeric, t.add_field, t.hash, FALSE
		FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::float8[], $7::text[],
		            $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::float8[], $14::text[], $15::text[])
		     AS t(pid, marg_id, code, name, unit, pack, kind, c_code, c_name, f_code, f_name, hsn, gst, add_field, hash)
		ON CONFLICT (product_pid) DO UPDATE SET
			marg_id = EXCLUDED.marg_id, code = EXCLUDED.code, name = EXCLUDED.name, unit = EXCLUDED.unit,
			pack = EXCLUDED.pack, kind = EXCLUDED.kind, company_code = EXCLUDED.company_code,
			company_name = EXCLUDED.company_name, form_code = EXCLUDED.form_code, form_name = EXCLUDED.form_name,
			hsn_code = EXCLUDED.hsn_code, gst_percent = EXCLUDED.gst_percent, add_field = EXCLUDED.add_field,
			last_changed_at = CASE WHEN m.row_hash IS DISTINCT FROM EXCLUDED.row_hash OR m.is_deleted
			                       THEN NOW() ELSE m.last_changed_at END,
			row_hash = EXCLUDED.row_hash, is_deleted = FALSE, synced_at = NOW()`,
		pid, margID, code, name, unit, pack, kind, cCode, cName, fCode, fName, hsn, gst, addField, hash)
	return err
}

func upsertStock(ctx context.Context, tx pgx.Tx, rows []StockBatch) error {
	n := len(rows)
	var (
		margID, pid                              = make([]int64, n), make([]int64, n)
		addField, hash                           = make([]string, n), make([]string, n)
		batch, company, batDate, expiry          = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		supInv, supDate, supCode                 = make([]*string, n), make([]*string, n), make([]*string, n)
		opening, stock, broken, cost, prate, mrp = make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n)
		rateA, rateB, rateC                      = make([]*float64, n), make([]*float64, n), make([]*float64, n)
	)
	for i, s := range rows {
		margID[i], pid[i], addField[i], hash[i] = s.MargID, s.ProductPID, s.AddField, s.Hash
		batch[i], company[i], batDate[i], expiry[i] = s.Batch, s.ItemCompanyCode, s.BatchDate, s.Expiry
		supInv[i], supDate[i], supCode[i] = s.SupplierInvoice, s.SupplierDate, s.SupplierCode
		opening[i], stock[i], broken[i], cost[i], prate[i], mrp[i] = s.Opening, s.Stock, s.BrokenStock, s.CostRate, s.PurchaseRate, s.MRP
		rateA[i], rateB[i], rateC[i] = s.RateA, s.RateB, s.RateC
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO marg_ede_stock AS m
			(marg_id, product_pid, batch, item_company_code, batch_date, expiry, supplier_invoice,
			 supplier_invoice_date, supplier_code, opening, stock, broken_stock, cost_rate, purchase_rate,
			 mrp, rate_a, rate_b, rate_c, add_field, row_hash, is_deleted)
		SELECT t.marg_id, t.pid, t.batch, t.company, t.bat_date::date, t.expiry::date, t.sup_inv,
		       t.sup_date::date, t.sup_code, t.opening::numeric, t.stock::numeric, t.broken::numeric,
		       t.cost::numeric, t.prate::numeric, t.mrp::numeric, t.rate_a::numeric, t.rate_b::numeric,
		       t.rate_c::numeric, t.add_field, t.hash, FALSE
		FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
		            $8::text[], $9::text[], $10::float8[], $11::float8[], $12::float8[], $13::float8[],
		            $14::float8[], $15::float8[], $16::float8[], $17::float8[], $18::float8[], $19::text[], $20::text[])
		     AS t(marg_id, pid, batch, company, bat_date, expiry, sup_inv, sup_date, sup_code, opening, stock,
		          broken, cost, prate, mrp, rate_a, rate_b, rate_c, add_field, hash)
		ON CONFLICT (marg_id) DO UPDATE SET
			product_pid = EXCLUDED.product_pid, batch = EXCLUDED.batch, item_company_code = EXCLUDED.item_company_code,
			batch_date = EXCLUDED.batch_date, expiry = EXCLUDED.expiry, supplier_invoice = EXCLUDED.supplier_invoice,
			supplier_invoice_date = EXCLUDED.supplier_invoice_date, supplier_code = EXCLUDED.supplier_code,
			opening = EXCLUDED.opening, stock = EXCLUDED.stock, broken_stock = EXCLUDED.broken_stock,
			cost_rate = EXCLUDED.cost_rate, purchase_rate = EXCLUDED.purchase_rate, mrp = EXCLUDED.mrp,
			rate_a = EXCLUDED.rate_a, rate_b = EXCLUDED.rate_b, rate_c = EXCLUDED.rate_c, add_field = EXCLUDED.add_field,
			last_changed_at = CASE WHEN m.row_hash IS DISTINCT FROM EXCLUDED.row_hash OR m.is_deleted
			                       THEN NOW() ELSE m.last_changed_at END,
			row_hash = EXCLUDED.row_hash, is_deleted = FALSE, synced_at = NOW()`,
		margID, pid, batch, company, batDate, expiry, supInv, supDate, supCode,
		opening, stock, broken, cost, prate, mrp, rateA, rateB, rateC, addField, hash)
	return err
}
