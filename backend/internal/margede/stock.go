package margede

import (
	"context"
	"fmt"
	"strings"
	"time"

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
