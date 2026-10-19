package margede

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// writeChunkSize rows per unnest statement. Supabase is ~430ms a round trip,
// so a full year (~23k lines) should be a dozen statements, not thousands.
const writeChunkSize = 2000

// minFullPullShare: a full pull carrying fewer bills than this share of the
// live bills we already hold is treated as suspect, and nothing is marked
// deleted from it. A truncated response must not wipe the table.
const minFullPullShare = 0.5

// Result counts what one Apply did.
type Result struct {
	BillsReceived  int
	ItemsReceived  int
	BillsNew       int
	BillsChanged   int
	ItemsNew       int
	ItemsChanged   int
	BillsDeleted   int
	ItemsDeleted   int
	ItemsSkipped   int // lines whose bill is neither in the pull nor stored
	LedgerReceived int
	LedgerNew      int
	LedgerChanged  int
	LedgerDeleted  int
	Products       SetCounts
	Stock          SetCounts
	Warning        string
}

// Apply writes one pull. full = the pull was made with a blank Datetime, so
// it is the complete current year and anything stored but absent from it
// was deleted in Marg.
func Apply(ctx context.Context, db *pgxpool.Pool, d Details, full bool) (Result, error) {
	var res Result
	if !strings.EqualFold(d.Datastatus, "Completed") {
		return res, fmt.Errorf("marg pull is not complete (Datastatus=%q)", d.Datastatus)
	}
	if full && len(d.Bills) == 0 {
		return res, fmt.Errorf("full pull returned no bills — refusing to apply it")
	}

	charges := ChargePIDs(d.Products)

	// Dedupe by key, last occurrence wins (pages could overlap).
	bills := make([]Bill, 0, len(d.Bills))
	billIdx := map[int64]int{}
	for _, r := range d.Bills {
		b := ToBill(r)
		if b.BillDate == "" || b.BillNo == "" {
			continue
		}
		if i, ok := billIdx[b.Voucher]; ok {
			bills[i] = b
			continue
		}
		billIdx[b.Voucher] = len(bills)
		bills = append(bills, b)
	}
	items := make([]Item, 0, len(d.Lines))
	itemIdx := map[int64]int{}
	for _, r := range d.Lines {
		it := ToItem(r, charges)
		if it.BillDate == "" {
			continue
		}
		if i, ok := itemIdx[it.MargLineID]; ok {
			items[i] = it
			continue
		}
		itemIdx[it.MargLineID] = len(items)
		items = append(items, it)
	}
	res.BillsReceived, res.ItemsReceived = len(bills), len(items)

	tx, err := db.Begin(ctx)
	if err != nil {
		return res, err
	}
	defer tx.Rollback(ctx)

	billHashes, err := loadHashes(ctx, tx, `SELECT voucher, row_hash, is_deleted FROM marg_ede_bills`)
	if err != nil {
		return res, fmt.Errorf("read stored bills: %w", err)
	}
	itemHashes, err := loadHashes(ctx, tx, `SELECT marg_line_id, row_hash, is_deleted FROM marg_ede_bill_items`)
	if err != nil {
		return res, fmt.Errorf("read stored bill items: %w", err)
	}

	// A line can only be stored once its bill is.
	kept := items[:0]
	for _, it := range items {
		if _, inPull := billIdx[it.Voucher]; inPull {
			kept = append(kept, it)
		} else if _, stored := billHashes[it.Voucher]; stored {
			kept = append(kept, it)
		} else {
			res.ItemsSkipped++
		}
	}
	items = kept

	// Only new or changed rows are written. A full pull every 15 minutes
	// re-sends the whole year, and rewriting ~23k unchanged lines each time
	// would be pure database churn.
	changedBills := make([]Bill, 0)
	for _, b := range bills {
		if old, ok := billHashes[b.Voucher]; !ok {
			res.BillsNew++
			changedBills = append(changedBills, b)
		} else if old.hash != b.Hash || old.deleted {
			res.BillsChanged++
			changedBills = append(changedBills, b)
		}
	}
	changedItems := make([]Item, 0)
	for _, it := range items {
		if old, ok := itemHashes[it.MargLineID]; !ok {
			res.ItemsNew++
			changedItems = append(changedItems, it)
		} else if old.hash != it.Hash || old.deleted {
			res.ItemsChanged++
			changedItems = append(changedItems, it)
		}
	}

	for start := 0; start < len(changedBills); start += writeChunkSize {
		if err := upsertBills(ctx, tx, changedBills[start:min(start+writeChunkSize, len(changedBills))]); err != nil {
			return res, fmt.Errorf("upsert bills: %w", err)
		}
	}
	for start := 0; start < len(changedItems); start += writeChunkSize {
		if err := upsertItems(ctx, tx, changedItems[start:min(start+writeChunkSize, len(changedItems))]); err != nil {
			return res, fmt.Errorf("upsert bill items: %w", err)
		}
	}

	// Bills whose line totals need recomputing.
	touchedSet := map[int64]bool{}
	for _, b := range changedBills {
		touchedSet[b.Voucher] = true
	}
	for _, it := range changedItems {
		touchedSet[it.Voucher] = true
	}

	if full {
		live := 0
		for _, h := range billHashes {
			if !h.deleted {
				live++
			}
		}
		if live > 0 && float64(len(bills)) < minFullPullShare*float64(live) {
			res.Warning = fmt.Sprintf("full pull had %d bills against %d stored — deletions were not applied", len(bills), live)
		} else {
			// Everything stored but absent from the full pull was deleted in
			// Marg. Editing a bill in Marg reissues its line IDs, so this is
			// also how the old lines of an edited bill go away.
			lineIDs := make([]int64, len(items))
			for i, it := range items {
				lineIDs[i] = it.MargLineID
			}
			received := make([]int64, 0, len(bills))
			for _, b := range bills {
				received = append(received, b.Voucher)
			}
			for _, it := range items {
				received = append(received, it.Voucher)
			}

			rows, err := tx.Query(ctx, `
				UPDATE marg_ede_bill_items SET is_deleted = TRUE, last_changed_at = NOW(), synced_at = NOW()
				WHERE NOT is_deleted AND NOT (marg_line_id = ANY($1::bigint[]))
				RETURNING voucher`, lineIDs)
			if err != nil {
				return res, fmt.Errorf("mark deleted bill items: %w", err)
			}
			if res.ItemsDeleted, err = collectVouchers(rows, touchedSet); err != nil {
				return res, fmt.Errorf("mark deleted bill items: %w", err)
			}

			rows, err = tx.Query(ctx, `
				UPDATE marg_ede_bills SET is_deleted = TRUE, last_changed_at = NOW(), synced_at = NOW()
				WHERE NOT is_deleted AND NOT (voucher = ANY($1::bigint[]))
				RETURNING voucher`, received)
			if err != nil {
				return res, fmt.Errorf("mark deleted bills: %w", err)
			}
			if res.BillsDeleted, err = collectVouchers(rows, touchedSet); err != nil {
				return res, fmt.Errorf("mark deleted bills: %w", err)
			}
		}
	}

	// Line totals per bill, so a bill whose lines don't add up to its total
	// (Marg leaves some edited bills' lines out) can be found directly.
	if len(touchedSet) > 0 {
		touched := make([]int64, 0, len(touchedSet))
		for v := range touchedSet {
			touched = append(touched, v)
		}
		if _, err := tx.Exec(ctx, refreshTotalsSQL, touched); err != nil {
			return res, fmt.Errorf("refresh bill line totals: %w", err)
		}
	}

	if err := applyLedger(ctx, tx, d.Parties, full, &res); err != nil {
		return res, err
	}
	if err := applyProductsAndStock(ctx, tx, d, full, &res); err != nil {
		return res, err
	}

	return res, tx.Commit(ctx)
}

// applyLedger writes the Party blob (the whole chart of accounts) the same
// way as bills: only new or changed accounts, and on a full pull, anything
// stored but no longer sent is marked deleted.
func applyLedger(ctx context.Context, tx pgx.Tx, parties []PartyRow, full bool, res *Result) error {
	// Marg sends a couple of accounts twice, identical; dedupe by its id.
	ledger := make([]Ledger, 0, len(parties))
	idx := map[int64]int{}
	for _, r := range parties {
		l := ToLedger(r)
		if l.Name == "" {
			continue
		}
		if i, ok := idx[l.MargID]; ok {
			ledger[i] = l
			continue
		}
		idx[l.MargID] = len(ledger)
		ledger = append(ledger, l)
	}
	res.LedgerReceived = len(ledger)

	stored, err := loadHashes(ctx, tx, `SELECT marg_id, row_hash, is_deleted FROM marg_ede_ledger`)
	if err != nil {
		return fmt.Errorf("read stored ledger: %w", err)
	}
	changed := make([]Ledger, 0)
	for _, l := range ledger {
		if old, ok := stored[l.MargID]; !ok {
			res.LedgerNew++
			changed = append(changed, l)
		} else if old.hash != l.Hash || old.deleted {
			res.LedgerChanged++
			changed = append(changed, l)
		}
	}
	for start := 0; start < len(changed); start += writeChunkSize {
		if err := upsertLedger(ctx, tx, changed[start:min(start+writeChunkSize, len(changed))]); err != nil {
			return fmt.Errorf("upsert ledger: %w", err)
		}
	}

	if !full || len(ledger) == 0 {
		return nil
	}
	live := 0
	for _, h := range stored {
		if !h.deleted {
			live++
		}
	}
	if live > 0 && float64(len(ledger)) < minFullPullShare*float64(live) {
		res.Warning = joinWarnings(res.Warning,
			fmt.Sprintf("full pull had %d ledger accounts against %d stored — ledger deletions were not applied", len(ledger), live))
		return nil
	}
	ids := make([]int64, len(ledger))
	for i, l := range ledger {
		ids[i] = l.MargID
	}
	tag, err := tx.Exec(ctx, `
		UPDATE marg_ede_ledger SET is_deleted = TRUE, last_changed_at = NOW(), synced_at = NOW()
		WHERE NOT is_deleted AND NOT (marg_id = ANY($1::bigint[]))`, ids)
	if err != nil {
		return fmt.Errorf("mark deleted ledger: %w", err)
	}
	res.LedgerDeleted = int(tag.RowsAffected())
	return nil
}

func upsertLedger(ctx context.Context, tx pgx.Tx, rows []Ledger) error {
	n := len(rows)
	var (
		id                                    = make([]int64, n)
		name, kind, addField, hash            = make([]string, n), make([]string, n), make([]string, n), make([]string, n)
		code, short, city, gcode, gname       = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		a1, a2, a3, pin, gstin, dl            = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		p1, p2, p3, p4, area, route, salesman = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		rate, crStatus, lat, lng              = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		crLimit                               = make([]*float64, n)
		crDays, crBills                       = make([]*int32, n), make([]*int32, n)
		margDeleted                           = make([]bool, n)
	)
	i32 := func(v *int) *int32 {
		if v == nil {
			return nil
		}
		x := int32(*v)
		return &x
	}
	for i, l := range rows {
		id[i], name[i], kind[i], addField[i], hash[i] = l.MargID, l.Name, l.Kind, l.AddField, l.Hash
		code[i], short[i], city[i], gcode[i], gname[i] = l.PartyCode, l.ShortName, l.City, l.GroupCode, l.GroupName
		a1[i], a2[i], a3[i], pin[i], gstin[i], dl[i] = l.Address1, l.Address2, l.Address3, l.Pin, l.GSTIN, l.DLNo
		p1[i], p2[i], p3[i], p4[i] = l.Phone1, l.Phone2, l.Phone3, l.Phone4
		area[i], route[i], salesman[i] = l.Area, l.Route, l.Salesman
		rate[i], crStatus[i], lat[i], lng[i] = l.RateFlag, l.CreditStatus, l.Lat, l.Lng
		crLimit[i], crDays[i], crBills[i], margDeleted[i] = l.CreditLimit, i32(l.CreditDays), i32(l.CreditBills), l.MargDeleted
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO marg_ede_ledger AS m
			(marg_id, party_code, name, short_name, city, group_code, group_name, kind,
			 address1, address2, address3, pin, gstin, dl_no, phone1, phone2, phone3, phone4,
			 area, route, salesman, rate_flag, credit_status, credit_limit, credit_days, credit_bills,
			 lat, lng, marg_deleted, add_field, row_hash, is_deleted)
		SELECT t.id, t.code, t.name, t.short, t.city, t.gcode, t.gname, t.kind,
		       t.a1, t.a2, t.a3, t.pin, t.gstin, t.dl, t.p1, t.p2, t.p3, t.p4,
		       t.area, t.route, t.salesman, t.rate, t.cr_status, t.cr_limit::numeric, t.cr_days, t.cr_bills,
		       t.lat, t.lng, t.marg_deleted, t.add_field, t.hash, FALSE
		FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
		            $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[], $15::text[],
		            $16::text[], $17::text[], $18::text[], $19::text[], $20::text[], $21::text[], $22::text[],
		            $23::text[], $24::float8[], $25::int4[], $26::int4[], $27::text[], $28::text[], $29::bool[],
		            $30::text[], $31::text[])
		     AS t(id, code, name, short, city, gcode, gname, kind, a1, a2, a3, pin, gstin, dl, p1, p2, p3, p4,
		          area, route, salesman, rate, cr_status, cr_limit, cr_days, cr_bills, lat, lng, marg_deleted,
		          add_field, hash)
		ON CONFLICT (marg_id) DO UPDATE SET
			party_code = EXCLUDED.party_code, name = EXCLUDED.name, short_name = EXCLUDED.short_name,
			city = EXCLUDED.city, group_code = EXCLUDED.group_code, group_name = EXCLUDED.group_name,
			kind = EXCLUDED.kind, address1 = EXCLUDED.address1, address2 = EXCLUDED.address2,
			address3 = EXCLUDED.address3, pin = EXCLUDED.pin, gstin = EXCLUDED.gstin, dl_no = EXCLUDED.dl_no,
			phone1 = EXCLUDED.phone1, phone2 = EXCLUDED.phone2, phone3 = EXCLUDED.phone3, phone4 = EXCLUDED.phone4,
			area = EXCLUDED.area, route = EXCLUDED.route, salesman = EXCLUDED.salesman,
			rate_flag = EXCLUDED.rate_flag, credit_status = EXCLUDED.credit_status,
			credit_limit = EXCLUDED.credit_limit, credit_days = EXCLUDED.credit_days,
			credit_bills = EXCLUDED.credit_bills, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
			marg_deleted = EXCLUDED.marg_deleted, add_field = EXCLUDED.add_field,
			last_changed_at = CASE WHEN m.row_hash IS DISTINCT FROM EXCLUDED.row_hash OR m.is_deleted
			                       THEN NOW() ELSE m.last_changed_at END,
			row_hash = EXCLUDED.row_hash, is_deleted = FALSE, synced_at = NOW()`,
		id, code, name, short, city, gcode, gname, kind,
		a1, a2, a3, pin, gstin, dl, p1, p2, p3, p4,
		area, route, salesman, rate, crStatus, crLimit, crDays, crBills,
		lat, lng, margDeleted, addField, hash)
	return err
}

const refreshTotalsSQL = `
	UPDATE marg_ede_bills b
	SET lines_count = s.n, lines_total = s.total,
	    lines_complete = ABS(s.total - b.total) <= 1
	FROM (
		SELECT bb.voucher, COUNT(i.marg_line_id)::int AS n,
		       COALESCE(SUM(i.amount + i.gst_amount), 0) AS total
		FROM marg_ede_bills bb
		LEFT JOIN marg_ede_bill_items i ON i.voucher = bb.voucher AND NOT i.is_deleted
		WHERE bb.voucher = ANY($1::bigint[])
		GROUP BY bb.voucher
	) s
	WHERE b.voucher = s.voucher`

// collectVouchers drains a RETURNING voucher result into set, returning the
// row count.
func collectVouchers(rows pgx.Rows, set map[int64]bool) (int, error) {
	defer rows.Close()
	n := 0
	for rows.Next() {
		var v int64
		if err := rows.Scan(&v); err != nil {
			return n, err
		}
		set[v] = true
		n++
	}
	return n, rows.Err()
}

type storedHash struct {
	hash    string
	deleted bool
}

func loadHashes(ctx context.Context, tx pgx.Tx, query string) (map[int64]storedHash, error) {
	rows, err := tx.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]storedHash{}
	for rows.Next() {
		var k int64
		var h storedHash
		if err := rows.Scan(&k, &h.hash, &h.deleted); err != nil {
			return nil, err
		}
		out[k] = h
	}
	return out, rows.Err()
}

func upsertBills(ctx context.Context, tx pgx.Tx, bills []Bill) error {
	n := len(bills)
	var (
		voucher, rowID                             = make([]int64, n), make([]int64, n)
		billNo, billType, addField, hash, billDate = make([]string, n), make([]string, n), make([]string, n), make([]string, n), make([]string, n)
		typeName, party, mode, spType, salesman    = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		route, area, orderRefs, orderDate          = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		refNo, refDate, reason, adjAgainst         = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		total                                      = make([]float64, n)
		cash, others, extra, refAmt, adjAmt        = make([]*float64, n), make([]*float64, n), make([]*float64, n), make([]*float64, n), make([]*float64, n)
		cancelled                                  = make([]bool, n)
		cancelledAt                                = make([]*time.Time, n)
	)
	for i, b := range bills {
		voucher[i], rowID[i], billNo[i], billType[i] = b.Voucher, b.MargRowID, b.BillNo, b.BillType
		typeName[i], billDate[i], party[i], mode[i] = b.BillTypeName, b.BillDate, b.PartyCode, b.BillMode
		total[i], cash[i], others[i], spType[i] = b.Total, b.Cash, b.Others, b.SalePurchaseType
		salesman[i], route[i], area[i], orderRefs[i], orderDate[i] = b.Salesman, b.Route, b.Area, b.OrderRefs, b.OrderDate
		extra[i], refNo[i], refDate[i], refAmt[i], reason[i] = b.ExtraAmount, b.RefBillNo, b.RefBillDate, b.RefAmount, b.Reason
		adjAgainst[i], adjAmt[i], cancelled[i], cancelledAt[i] = b.AdjustedAgainst, b.AdjustedAmount, b.IsCancelled, b.CancelledAt
		addField[i], hash[i] = b.AddField, b.Hash
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO marg_ede_bills AS m
			(voucher, marg_row_id, bill_no, bill_type, bill_type_name, bill_date, party_code, bill_mode,
			 total, cash, others, sale_purchase_type, salesman, route, area, order_refs, order_date,
			 extra_amount, ref_bill_no, ref_bill_date, ref_amount, reason, adjusted_against, adjusted_amount,
			 is_cancelled, cancelled_at, add_field, row_hash, is_deleted)
		SELECT t.voucher, t.row_id, t.bill_no, t.bill_type, t.type_name, t.bill_date::date, t.party, t.mode,
		       t.total::numeric, t.cash::numeric, t.others::numeric, t.sp_type, t.salesman, t.route, t.area,
		       t.order_refs, t.order_date::date, t.extra::numeric, t.ref_no, t.ref_date::date, t.ref_amt::numeric,
		       t.reason, t.adj_against, t.adj_amt::numeric, t.cancelled, t.cancelled_at, t.add_field, t.hash, FALSE
		FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
		            $9::float8[], $10::float8[], $11::float8[], $12::text[], $13::text[], $14::text[], $15::text[],
		            $16::text[], $17::text[], $18::float8[], $19::text[], $20::text[], $21::float8[], $22::text[],
		            $23::text[], $24::float8[], $25::bool[], $26::timestamptz[], $27::text[], $28::text[])
		     AS t(voucher, row_id, bill_no, bill_type, type_name, bill_date, party, mode,
		          total, cash, others, sp_type, salesman, route, area, order_refs, order_date,
		          extra, ref_no, ref_date, ref_amt, reason, adj_against, adj_amt, cancelled, cancelled_at, add_field, hash)
		ON CONFLICT (voucher) DO UPDATE SET
			marg_row_id = EXCLUDED.marg_row_id, bill_no = EXCLUDED.bill_no, bill_type = EXCLUDED.bill_type,
			bill_type_name = EXCLUDED.bill_type_name, bill_date = EXCLUDED.bill_date, party_code = EXCLUDED.party_code,
			bill_mode = EXCLUDED.bill_mode, total = EXCLUDED.total, cash = EXCLUDED.cash, others = EXCLUDED.others,
			sale_purchase_type = EXCLUDED.sale_purchase_type, salesman = EXCLUDED.salesman, route = EXCLUDED.route,
			area = EXCLUDED.area, order_refs = EXCLUDED.order_refs, order_date = EXCLUDED.order_date,
			extra_amount = EXCLUDED.extra_amount, ref_bill_no = EXCLUDED.ref_bill_no, ref_bill_date = EXCLUDED.ref_bill_date,
			ref_amount = EXCLUDED.ref_amount, reason = EXCLUDED.reason, adjusted_against = EXCLUDED.adjusted_against,
			adjusted_amount = EXCLUDED.adjusted_amount, is_cancelled = EXCLUDED.is_cancelled,
			cancelled_at = EXCLUDED.cancelled_at, add_field = EXCLUDED.add_field,
			last_changed_at = CASE WHEN m.row_hash IS DISTINCT FROM EXCLUDED.row_hash OR m.is_deleted
			                       THEN NOW() ELSE m.last_changed_at END,
			row_hash = EXCLUDED.row_hash, is_deleted = FALSE, synced_at = NOW()`,
		voucher, rowID, billNo, billType, typeName, billDate, party, mode,
		total, cash, others, spType, salesman, route, area, orderRefs, orderDate,
		extra, refNo, refDate, refAmt, reason, adjAgainst, adjAmt, cancelled, cancelledAt, addField, hash)
	return err
}

func upsertItems(ctx context.Context, tx pgx.Tx, items []Item) error {
	n := len(items)
	var (
		lineID, voucher, pid                        = make([]int64, n), make([]int64, n), make([]int64, n)
		billDate, kind, addField, hash              = make([]string, n), make([]string, n), make([]string, n), make([]string, n)
		lineType, lineBillNo, party, company, batch = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		expiry, salesman, challanNo, challanDate    = make([]*string, n), make([]*string, n), make([]*string, n), make([]*string, n)
		qty, free, mrp, rate, disc, amt, gstP, gstA = make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n)
	)
	for i, it := range items {
		lineID[i], voucher[i], pid[i] = it.MargLineID, it.Voucher, it.ProductPID
		billDate[i], kind[i], addField[i], hash[i] = it.BillDate, it.LineKind, it.AddField, it.Hash
		lineType[i], lineBillNo[i], party[i], company[i], batch[i] = it.LineType, it.LineBillNo, it.PartyCode, it.ItemCompanyCode, it.Batch
		expiry[i], salesman[i], challanNo[i], challanDate[i] = it.Expiry, it.Salesman, it.ChallanNo, it.ChallanDate
		qty[i], free[i], mrp[i], rate[i] = it.Qty, it.Free, it.MRP, it.Rate
		disc[i], amt[i], gstP[i], gstA[i] = it.Discount, it.Amount, it.GSTPercent, it.GSTAmount
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO marg_ede_bill_items AS m
			(marg_line_id, voucher, line_type, line_bill_no, bill_date, party_code, product_pid,
			 item_company_code, line_kind, batch, expiry, qty, free, mrp, rate, discount, amount,
			 gst_percent, gst_amount, salesman, challan_no, challan_date, add_field, row_hash, is_deleted)
		SELECT t.line_id, t.voucher, t.line_type, t.line_bill_no, t.bill_date::date, t.party, t.pid,
		       t.company, t.kind, t.batch, t.expiry::date, t.qty::numeric, t.free::numeric, t.mrp::numeric,
		       t.rate::numeric, t.disc::numeric, t.amt::numeric, t.gst_p::numeric, t.gst_a::numeric,
		       t.salesman, t.challan_no, t.challan_date::date, t.add_field, t.hash, FALSE
		FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[],
		            $8::text[], $9::text[], $10::text[], $11::text[], $12::float8[], $13::float8[], $14::float8[],
		            $15::float8[], $16::float8[], $17::float8[], $18::float8[], $19::float8[], $20::text[],
		            $21::text[], $22::text[], $23::text[], $24::text[])
		     AS t(line_id, voucher, line_type, line_bill_no, bill_date, party, pid, company, kind, batch, expiry,
		          qty, free, mrp, rate, disc, amt, gst_p, gst_a, salesman, challan_no, challan_date, add_field, hash)
		ON CONFLICT (marg_line_id) DO UPDATE SET
			voucher = EXCLUDED.voucher, line_type = EXCLUDED.line_type, line_bill_no = EXCLUDED.line_bill_no,
			bill_date = EXCLUDED.bill_date, party_code = EXCLUDED.party_code, product_pid = EXCLUDED.product_pid,
			item_company_code = EXCLUDED.item_company_code, line_kind = EXCLUDED.line_kind, batch = EXCLUDED.batch,
			expiry = EXCLUDED.expiry, qty = EXCLUDED.qty, free = EXCLUDED.free, mrp = EXCLUDED.mrp,
			rate = EXCLUDED.rate, discount = EXCLUDED.discount, amount = EXCLUDED.amount,
			gst_percent = EXCLUDED.gst_percent, gst_amount = EXCLUDED.gst_amount, salesman = EXCLUDED.salesman,
			challan_no = EXCLUDED.challan_no, challan_date = EXCLUDED.challan_date, add_field = EXCLUDED.add_field,
			last_changed_at = CASE WHEN m.row_hash IS DISTINCT FROM EXCLUDED.row_hash OR m.is_deleted
			                       THEN NOW() ELSE m.last_changed_at END,
			row_hash = EXCLUDED.row_hash, is_deleted = FALSE, synced_at = NOW()`,
		lineID, voucher, lineType, lineBillNo, billDate, party, pid,
		company, kind, batch, expiry, qty, free, mrp, rate, disc, amt, gstP, gstA,
		salesman, challanNo, challanDate, addField, hash)
	return err
}
