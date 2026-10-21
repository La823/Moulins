package margede

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StockFilter is the product-wise stock list query. Charge products (###)
// are never listed: Marg keeps dummy zero-stock rows for them.
type StockFilter struct {
	Search  string // product name, code or PID
	Company string // IB, IC, ID
	View    string // "" all | in_stock | negative | expired | expiring | differs
	Page    int
}

// StockViews are the list's quick filters, applied to a product's batches.
var stockViews = map[string]string{
	"in_stock": "a.total_stock > 0",
	"negative": "a.negative_batches > 0",
	"expired":  "a.expired_qty > 0",
	"expiring": "a.expiring_qty > 0",
	"differs":  "a.master_mismatches > 0",
}

// StockBatchRow is one batch of a product.
type StockBatchRow struct {
	MargID             int64      `json:"marg_id"`
	Batch              *string    `json:"batch"`
	Expiry             *time.Time `json:"expiry"`
	Stock              float64    `json:"stock"`
	Opening            float64    `json:"opening"`
	MRP                *float64   `json:"mrp"`
	PurchaseRate       *float64   `json:"purchase_rate"`
	CostRate           *float64   `json:"cost_rate"`
	SupplierInvoice    *string    `json:"supplier_invoice"`
	SupplierDate       *time.Time `json:"supplier_invoice_date"`
	MasterStatus       string     `json:"master_status"`
	MasterStock        *float64   `json:"master_stock"`
	MasterMRP          *float64   `json:"master_mrp"`
	MasterPurchaseRate *float64   `json:"master_purchase_rate"`
	MasterExpiry       *string    `json:"master_expiry"`
	LastChangedAt      time.Time  `json:"last_changed_at"`
}

// StockProduct is one product with its batches.
type StockProduct struct {
	ProductPID       int64           `json:"product_pid"`
	Code             *string         `json:"code"`
	Name             *string         `json:"name"`
	CompanyCode      *string         `json:"company_code"`
	CompanyName      *string         `json:"company_name"`
	FormName         *string         `json:"form_name"`
	HSNCode          *string         `json:"hsn_code"`
	GSTPercent       *float64        `json:"gst_percent"`
	Unit             *string         `json:"unit"`
	TotalStock       float64         `json:"total_stock"`
	BatchCount       int             `json:"batch_count"`
	NegativeBatches  int             `json:"negative_batches"`
	ExpiredQty       float64         `json:"expired_qty"`
	ExpiringQty      float64         `json:"expiring_qty"`
	NearestExpiry    *time.Time      `json:"nearest_expiry"`
	StockValue       float64         `json:"stock_value"` // positive stock at purchase rate
	MasterMismatches int             `json:"master_mismatches"`
	Batches          []StockBatchRow `json:"batches"`
}

// StockList is the stock list response.
type StockList struct {
	Products   []StockProduct `json:"products"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	PageSize   int            `json:"page_size"`
	ViewCounts map[string]int `json:"view_counts"` // products per quick filter, under search/company
	StockValue float64        `json:"stock_value"` // over the filtered products
}

// stockAgg is one row per product over its live batches. "Expiring" means
// in stock and expiring within 180 days.
const stockAgg = `
	WITH a AS (
		SELECT s.product_pid,
		       MAX(s.item_company_code) AS company_code,
		       COUNT(*)::int AS batch_count,
		       SUM(s.stock) AS total_stock,
		       COUNT(*) FILTER (WHERE s.stock < 0)::int AS negative_batches,
		       COALESCE(SUM(s.stock) FILTER (WHERE s.stock > 0 AND s.expiry < CURRENT_DATE), 0) AS expired_qty,
		       COALESCE(SUM(s.stock) FILTER (WHERE s.stock > 0 AND s.expiry >= CURRENT_DATE
		                                   AND s.expiry < CURRENT_DATE + 180), 0) AS expiring_qty,
		       MIN(s.expiry) FILTER (WHERE s.stock > 0 AND s.expiry >= CURRENT_DATE) AS nearest_expiry,
		       COALESCE(SUM(s.stock * s.purchase_rate) FILTER (WHERE s.stock > 0), 0) AS stock_value,
		       COUNT(*) FILTER (WHERE s.master_status IN ('negative_master_zero', 'differs', 'not_in_master'))::int AS master_mismatches
		FROM v_marg_ede_stock s
		GROUP BY s.product_pid
	)`

func (f StockFilter) where(withView bool) (string, []any) {
	conds := []string{"COALESCE(p.kind, 'item') <> 'charge'"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		add("(p.name ILIKE ? OR p.code ILIKE ? OR a.product_pid::text ILIKE ?)", "%"+s+"%")
	}
	if f.Company != "" {
		add("a.company_code = ?", f.Company)
	}
	if v, ok := stockViews[f.View]; ok && withView {
		conds = append(conds, v)
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// ListStock returns one page of products, each with its live batches.
func ListStock(ctx context.Context, db *pgxpool.Pool, f StockFilter) (StockList, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	out := StockList{Products: []StockProduct{}, Page: f.Page, PageSize: BillsPageSize, ViewCounts: map[string]int{}}
	from := stockAgg + ` SELECT %s FROM a LEFT JOIN marg_ede_products p ON p.product_pid = a.product_pid`

	where, args := f.where(false)
	var all, inStock, negative, expired, expiring, differs int
	if err := db.QueryRow(ctx, fmt.Sprintf(from, `COUNT(*)::int,
		COUNT(*) FILTER (WHERE a.total_stock > 0)::int, COUNT(*) FILTER (WHERE a.negative_batches > 0)::int,
		COUNT(*) FILTER (WHERE a.expired_qty > 0)::int, COUNT(*) FILTER (WHERE a.expiring_qty > 0)::int,
		COUNT(*) FILTER (WHERE a.master_mismatches > 0)::int`)+where, args...).
		Scan(&all, &inStock, &negative, &expired, &expiring, &differs); err != nil {
		return out, err
	}
	out.ViewCounts = map[string]int{"": all, "in_stock": inStock, "negative": negative,
		"expired": expired, "expiring": expiring, "differs": differs}

	where, args = f.where(true)
	if err := db.QueryRow(ctx, fmt.Sprintf(from, `COUNT(*)::int, COALESCE(SUM(a.stock_value), 0)::float8`)+where, args...).
		Scan(&out.Total, &out.StockValue); err != nil {
		return out, err
	}

	rows, err := db.Query(ctx, fmt.Sprintf(from, `a.product_pid, p.code, p.name, a.company_code, p.company_name,
		p.form_name, p.hsn_code, p.gst_percent::float8, p.unit, a.total_stock::float8, a.batch_count,
		a.negative_batches, a.expired_qty::float8, a.expiring_qty::float8, a.nearest_expiry,
		a.stock_value::float8, a.master_mismatches`)+where+fmt.Sprintf(`
		ORDER BY p.name NULLS LAST, a.product_pid
		LIMIT %d OFFSET %d`, BillsPageSize, (f.Page-1)*BillsPageSize), args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	index := map[int64]int{}
	pids := []int64{}
	for rows.Next() {
		var p StockProduct
		if err := rows.Scan(&p.ProductPID, &p.Code, &p.Name, &p.CompanyCode, &p.CompanyName,
			&p.FormName, &p.HSNCode, &p.GSTPercent, &p.Unit, &p.TotalStock, &p.BatchCount,
			&p.NegativeBatches, &p.ExpiredQty, &p.ExpiringQty, &p.NearestExpiry,
			&p.StockValue, &p.MasterMismatches); err != nil {
			return out, err
		}
		p.Batches = []StockBatchRow{}
		index[p.ProductPID] = len(out.Products)
		pids = append(pids, p.ProductPID)
		out.Products = append(out.Products, p)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(pids) == 0 {
		return out, nil
	}

	brows, err := db.Query(ctx, `
		SELECT s.product_pid, s.marg_id, s.batch, s.expiry, s.stock::float8, s.opening::float8, s.mrp::float8,
		       s.purchase_rate::float8, s.cost_rate::float8, s.supplier_invoice, s.supplier_invoice_date,
		       s.master_status, s.master_stock::float8, s.master_mrp::float8, s.master_purchase_rate::float8,
		       NULLIF(TRIM(s.master_expiry), ''), s.last_changed_at
		FROM v_marg_ede_stock s
		WHERE s.product_pid = ANY($1::bigint[])
		ORDER BY s.product_pid, s.expiry NULLS LAST, s.batch`, pids)
	if err != nil {
		return out, err
	}
	defer brows.Close()
	for brows.Next() {
		var pid int64
		var b StockBatchRow
		if err := brows.Scan(&pid, &b.MargID, &b.Batch, &b.Expiry, &b.Stock, &b.Opening, &b.MRP,
			&b.PurchaseRate, &b.CostRate, &b.SupplierInvoice, &b.SupplierDate,
			&b.MasterStatus, &b.MasterStock, &b.MasterMRP, &b.MasterPurchaseRate,
			&b.MasterExpiry, &b.LastChangedAt); err != nil {
			return out, err
		}
		if i, ok := index[pid]; ok {
			out.Products[i].Batches = append(out.Products[i].Batches, b)
		}
	}
	return out, brows.Err()
}

// Batch movement history: the batch's opening stock (1 April, from Marg)
// plus every bill line that moved it, with a running balance.
//
// Direction by voucher type, checked against Marg's own closing stock on
// 21 Oct 2026 (it matched for 91% of batches): purchases (P), credit notes
// (R) and stock adjustments (D, signed qty) add; sales invoices and
// challans (S), debit notes (B), purchase-return (u) and sales (T) challans
// take away. Cancelled bills don't count. Where Marg's stock is lower than
// this explains, stock left the batch without a bill line the API sends
// (breakage/sample issues, or lines Marg omits from an edited bill) — the
// page shows that gap instead of hiding it.

// BatchMovement is one bill line that moved a batch.
type BatchMovement struct {
	Date         time.Time `json:"date"`
	Voucher      int64     `json:"voucher"`
	BillNo       string    `json:"bill_no"`
	BillType     string    `json:"bill_type"`
	BillTypeName *string   `json:"bill_type_name"`
	PartyCode    *string   `json:"party_code"`
	PartyName    *string   `json:"party_name"`
	Qty          float64   `json:"qty"`
	Free         float64   `json:"free"`
	Change       float64   `json:"change"` // signed: + into stock, - out
	Rate         float64   `json:"rate"`
	Amount       float64   `json:"amount"` // before GST
	Balance      float64   `json:"balance"`
}

// BatchHistory is the batch page.
type BatchHistory struct {
	MargID          int64           `json:"marg_id"`
	ProductPID      int64           `json:"product_pid"`
	ProductName     *string         `json:"product_name"`
	Batch           *string         `json:"batch"`
	Expiry          *time.Time      `json:"expiry"`
	MRP             *float64        `json:"mrp"`
	PurchaseRate    *float64        `json:"purchase_rate"`
	SupplierInvoice *string         `json:"supplier_invoice"`
	SupplierDate    *time.Time      `json:"supplier_invoice_date"`
	Opening         float64         `json:"opening"`
	In              float64         `json:"in"`
	Out             float64         `json:"out"`
	SoldQty         float64         `json:"sold_qty"`   // on sale invoices and challans, incl. free
	SoldValue       float64         `json:"sold_value"` // before GST
	Calculated      float64         `json:"calculated"` // opening + in - out
	MargStock       float64         `json:"marg_stock"`
	Unexplained     float64         `json:"unexplained"` // marg_stock - calculated
	Movements       []BatchMovement `json:"movements"`
}

// ErrBatchNotFound: no such stock row.
var ErrBatchNotFound = errors.New("batch not found")

// GetBatchHistory returns one stock batch (by its Marg stock id) and its
// movements this financial year, oldest first.
func GetBatchHistory(ctx context.Context, db *pgxpool.Pool, margID int64) (BatchHistory, error) {
	h := BatchHistory{MargID: margID, Movements: []BatchMovement{}}
	err := db.QueryRow(ctx, `
		SELECT s.product_pid, COALESCE(p.name, mp.name), s.batch, s.expiry, s.mrp::float8, s.purchase_rate::float8,
		       s.supplier_invoice, s.supplier_invoice_date, s.opening::float8, s.stock::float8
		FROM marg_ede_stock s
		LEFT JOIN marg_ede_products p ON p.product_pid = s.product_pid
		LEFT JOIN margmaster_products mp ON mp.base_code = s.product_pid::text
		WHERE s.marg_id = $1`, margID).
		Scan(&h.ProductPID, &h.ProductName, &h.Batch, &h.Expiry, &h.MRP, &h.PurchaseRate,
			&h.SupplierInvoice, &h.SupplierDate, &h.Opening, &h.MargStock)
	if errors.Is(err, pgx.ErrNoRows) {
		return h, ErrBatchNotFound
	}
	if err != nil {
		return h, err
	}

	batch := ""
	if h.Batch != nil {
		batch = *h.Batch
	}
	rows, err := db.Query(ctx, `
		SELECT b.bill_date, b.voucher, b.bill_no, `+kindExpr+`, `+kindNameExpr+`, b.party_code, lg.name,
		       i.qty::float8, i.free::float8,
		       (CASE WHEN b.bill_type IN ('P', 'R', 'D') THEN 1 ELSE -1 END * (i.qty + i.free))::float8,
		       COALESCE(i.rate, 0)::float8, i.amount::float8
		FROM marg_ede_bill_items i
		JOIN marg_ede_bills b ON b.voucher = i.voucher
		LEFT JOIN LATERAL (
			SELECT l.name FROM marg_ede_ledger l
			WHERE l.party_code = b.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
		) lg ON TRUE
		WHERE i.product_pid = $1 AND COALESCE(i.batch, '') = $2 AND i.line_kind = 'item'
		  AND NOT i.is_deleted AND NOT b.is_deleted AND NOT b.is_cancelled
		ORDER BY b.bill_date, CASE WHEN b.bill_type IN ('P', 'R', 'D') THEN 0 ELSE 1 END, b.bill_no, i.marg_line_id`,
		h.ProductPID, batch)
	if err != nil {
		return h, err
	}
	defer rows.Close()
	bal := h.Opening
	for rows.Next() {
		var m BatchMovement
		if err := rows.Scan(&m.Date, &m.Voucher, &m.BillNo, &m.BillType, &m.BillTypeName, &m.PartyCode, &m.PartyName,
			&m.Qty, &m.Free, &m.Change, &m.Rate, &m.Amount); err != nil {
			return h, err
		}
		bal += m.Change
		m.Balance = bal
		if m.Change >= 0 {
			h.In += m.Change
		} else {
			h.Out -= m.Change
		}
		if m.BillType == "S" || m.BillType == ChallanType {
			h.SoldQty += m.Qty + m.Free
			h.SoldValue += m.Amount
		}
		h.Movements = append(h.Movements, m)
	}
	if err := rows.Err(); err != nil {
		return h, err
	}
	h.Calculated = bal
	h.Unexplained = h.MargStock - h.Calculated
	return h, nil
}
