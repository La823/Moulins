package stockagent

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// The agent's tools: thin wrappers over the margede reports the admin panel
// already shows (stock list, demand, not selling, product page). Each one
// returns a small, flat JSON summary — totals and the top rows, never every
// batch — so the model reads the numbers our code worked out instead of
// doing the arithmetic itself.

const (
	defaultLimit = 25
	maxLimit     = 100
)

// toolDef is what the model sees of a tool: its name, what it does and a
// JSON Schema of its arguments (the OpenAI-style "function" shape).
type toolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// tool is one function the model may call.
type tool struct {
	def toolDef
	run func(ctx context.Context, s *session, input json.RawMessage) (any, error)
}

// session holds what one question has loaded, so the demand report (the
// slowest query) is built at most once however many tools read it.
type session struct {
	db     *pgxpool.Pool
	demand *margede.DemandList
}

func (s *session) loadDemand(ctx context.Context) (*margede.DemandList, error) {
	if s.demand == nil {
		d, err := margede.Demand(ctx, s.db, margede.DemandOptions{ShelfDays: margede.DefaultShelfDays})
		if err != nil {
			return nil, err
		}
		s.demand = &d
	}
	return s.demand, nil
}

func limitOf(n int) int {
	if n <= 0 {
		return defaultLimit
	}
	return min(n, maxLimit)
}

func day(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

func str(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// schema marks every argument required: Gemma on Bedrock leaves optional
// arguments out of its calls altogether (it sent get_stock with no search
// at all), so each one has a stated "none" value instead (empty, 0, any).
func schema(props map[string]any) map[string]any {
	names := make([]string, 0, len(props))
	for k := range props {
		names = append(names, k)
	}
	sort.Strings(names)
	return map[string]any{"type": "object", "properties": props, "required": names, "additionalProperties": false}
}

var companyArg = map[string]any{"type": "string", "enum": []string{"any", "IB", "IC", "ID"}, "description": "Marg company code to narrow to one company, or any."}

var searchArg = map[string]any{"type": "string", "description": "Only products whose name or code contains this (a word of the name is enough). Empty for all products."}

// matches is the search filter of get_shortages and get_expiry_risk.
func matches(r margede.DemandRow, search string) bool {
	s := strings.ToLower(strings.TrimSpace(search))
	return s == "" || strings.Contains(strings.ToLower(r.Name), s) || strings.Contains(strings.ToLower(str(r.Code)), s)
}

var limitArg = map[string]any{"type": "integer", "description": "Rows to return: 0 for the default 25, at most 100."}

var tools = []tool{
	{
		def: toolDef{
			Name: "get_stock",
			Description: "Current stock per product from Marg, summed over its batches. " +
				"Use it to look products up by name or code (to get their product_pid) and to list products " +
				"by a stock condition. Returns how many products match each view, the stock value and the top rows.",
			Parameters: schema(map[string]any{
				"search": map[string]any{"type": "string", "description": "Product name, code or PID (partial match; a word of the name is enough). Empty for all products."},
				"view": map[string]any{"type": "string", "enum": []string{"all", "in_stock", "negative", "expired", "expiring"},
					"description": "in_stock: stock above zero; negative: a batch below zero (a Marg entry error); expired: stock in batches past expiry; expiring: stock expiring within 180 days."},
				"company": companyArg,
				"limit":   limitArg,
			}),
		},
		run: runGetStock,
	},
	{
		def: toolDef{
			Name: "get_shortages",
			Description: "Products running short: usable stock covers fewer than 90 days at the " +
				"3-month average sale rate. Least cover first. Includes the suggested order quantity, what is " +
				"already on open purchase orders, and what is still to order.",
			Parameters: schema(map[string]any{
				"without_po": map[string]any{"type": "boolean", "description": "true: only products with nothing on an open purchase order yet."},
				"search":     searchArg,
				"company":    companyArg,
				"limit":      limitArg,
			}),
		},
		run: runGetShortages,
	},
	{
		def: toolDef{
			Name: "get_expiry_risk",
			Description: "Stock that will not sell before its batch expires (less 90 days of " +
				"minimum shelf life) at the 3-month average. Highest value at risk first, with the at-risk batches.",
			Parameters: schema(map[string]any{
				"search": searchArg,
				"limit":  limitArg,
			}),
		},
		run: runGetExpiryRisk,
	},
	{
		def: toolDef{
			Name: "get_slow_movers",
			Description: "Products bought this financial year that are hardly selling: the share " +
				"of the bought units sold since, slowest first.",
			Parameters: schema(map[string]any{
				"min_days": map[string]any{"type": "integer", "description": "Only products first bought at least this many days ago: 0 for the default 30."},
				"limit":    limitArg,
			}),
		},
		run: runGetSlowMovers,
	},
	{
		def: toolDef{
			Name: "get_product",
			Description: "Everything about one product: stock and cover, monthly sales this year, " +
				"averages, top buyers, open purchase orders and batches with their expiry outlook. " +
				"Needs the product_pid (find it with get_stock).",
			Parameters: schema(map[string]any{
				"product_pid": map[string]any{"type": "integer"},
			}),
		},
		run: runGetProduct,
	},
}

func runGetStock(ctx context.Context, s *session, input json.RawMessage) (any, error) {
	var in struct {
		Search, View, Company string
		Limit                 int
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	if in.View == "all" {
		in.View = ""
	}
	if in.Company == "any" {
		in.Company = ""
	}
	type row struct {
		PID           int64    `json:"product_pid"`
		Code          string   `json:"code"`
		Name          string   `json:"name"`
		Company       string   `json:"company"`
		Stock         float64  `json:"stock"`
		Batches       int      `json:"batches"`
		ExpiredQty    float64  `json:"expired_qty,omitempty"`
		ExpiredValue  float64  `json:"expired_value,omitempty"` // expired units at purchase rate
		ExpiringQty   float64  `json:"expiring_qty,omitempty"`
		NearestExpiry *string  `json:"nearest_expiry"`
		StockValue    float64  `json:"stock_value"`
		Negative      int      `json:"negative_batches,omitempty"`
		MRP           *float64 `json:"mrp,omitempty"`
	}
	limit := limitOf(in.Limit)
	rows := []row{}
	var list margede.StockList
	expiredValue := 0.0
	today := time.Now().Truncate(24 * time.Hour)
	for page := 1; len(rows) < limit; page++ {
		var err error
		list, err = margede.ListStock(ctx, s.db, margede.StockFilter{Search: in.Search, Company: in.Company, View: in.View, Page: page})
		if err != nil {
			return nil, err
		}
		for _, p := range list.Products {
			r := row{PID: p.ProductPID, Code: str(p.Code), Name: str(p.Name), Company: str(p.CompanyName),
				Stock: p.TotalStock, Batches: p.BatchCount, ExpiredQty: p.ExpiredQty, ExpiringQty: p.ExpiringQty,
				NearestExpiry: day(p.NearestExpiry), StockValue: p.StockValue, Negative: p.NegativeBatches}
			if len(p.Batches) > 0 {
				r.MRP = p.Batches[0].MRP
			}
			for _, b := range p.Batches {
				if b.Stock > 0 && b.Expiry != nil && b.Expiry.Before(today) && b.PurchaseRate != nil {
					r.ExpiredValue += b.Stock * *b.PurchaseRate
				}
			}
			expiredValue += r.ExpiredValue
			r.ExpiredValue = round1(r.ExpiredValue)
			rows = append(rows, r)
		}
		if len(list.Products) < list.PageSize {
			break
		}
	}
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return map[string]any{
		"matching_products":           list.Total,
		"products_per_view":           list.ViewCounts,
		"stock_value":                 list.StockValue, // positive stock at purchase rate, all matching products
		"expired_value_in_rows_shown": round1(expiredValue),
		"rows":                        rows,
		"rows_shown":                  len(rows),
	}, nil
}

// shortRow is a demand row cut down to what an answer needs.
type shortRow struct {
	PID          int64    `json:"product_pid"`
	Name         string   `json:"name"`
	Company      string   `json:"company"`
	Stock        float64  `json:"usable_stock"`
	Expired      float64  `json:"expired_stock,omitempty"`
	Avg3         float64  `json:"avg_monthly_3m"`
	ThisMonth    float64  `json:"sold_this_month"`
	CoverDays    *float64 `json:"cover_days"`
	Suggested    float64  `json:"suggested_qty"`
	OpenPOQty    float64  `json:"open_po_qty"`
	StillToOrder float64  `json:"still_to_order"`
	Review       string   `json:"review"`
	LastSold     *string  `json:"last_sold"`
	LastPurchase *string  `json:"last_purchase"`
	TooNew       bool     `json:"too_new,omitempty"`
	ExpiryRisk   float64  `json:"expiry_risk_qty,omitempty"`
	ExpiryValue  float64  `json:"expiry_risk_value,omitempty"`
}

func toShort(r margede.DemandRow) shortRow {
	return shortRow{PID: r.ProductPID, Name: r.Name, Company: str(r.Company), Stock: r.Stock, Expired: r.ExpiredStock,
		Avg3: round1(r.Avg3), ThisMonth: r.ThisMonth, CoverDays: roundPtr(r.CoverDays), Suggested: r.SuggestedQty,
		OpenPOQty: r.OpenPOQty, StillToOrder: r.StillToOrder, Review: r.Review, LastSold: day(r.LastSold),
		LastPurchase: day(r.LastPurchase), TooNew: r.TooNew, ExpiryRisk: round1(r.ExpiryRiskQty), ExpiryValue: round1(r.ExpiryRiskValue)}
}

func round1(f float64) float64 { return float64(int64(f*10+0.5)) / 10 }

func roundPtr(f *float64) *float64 {
	if f == nil {
		return nil
	}
	v := round1(*f)
	return &v
}

func runGetShortages(ctx context.Context, s *session, input json.RawMessage) (any, error) {
	var in struct {
		WithoutPO bool `json:"without_po"`
		Company   string
		Search    string
		Limit     int
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	if in.Company == "any" {
		in.Company = ""
	}
	d, err := s.loadDemand(ctx)
	if err != nil {
		return nil, err
	}
	short := []margede.DemandRow{}
	for _, r := range d.Rows {
		if !r.NeedsOrder || (in.WithoutPO && r.HasOpenPO) || (in.Company != "" && str(r.CompanyCode) != in.Company) || !matches(r, in.Search) {
			continue
		}
		short = append(short, r)
	}
	sort.SliceStable(short, func(i, j int) bool { return cover(short[i]) < cover(short[j]) })
	rows := []shortRow{}
	for _, r := range short[:min(len(short), limitOf(in.Limit))] {
		rows = append(rows, toShort(r))
	}
	return map[string]any{
		"cover_target_days": d.CoverDays,
		"products_short":    len(short),
		"averages_months":   d.Months,
		"rows":              rows,
		"rows_shown":        len(rows),
	}, nil
}

// cover sorts products that sold nothing (no cover figure) last.
func cover(r margede.DemandRow) float64 {
	if r.CoverDays == nil {
		return 1e9
	}
	return *r.CoverDays
}

func runGetExpiryRisk(ctx context.Context, s *session, input json.RawMessage) (any, error) {
	var in struct {
		Search string
		Limit  int
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	d, err := s.loadDemand(ctx)
	if err != nil {
		return nil, err
	}
	risky := []margede.DemandRow{}
	total := 0.0
	for _, r := range d.Rows {
		if r.ExpiryRiskQty > 0 && matches(r, in.Search) {
			risky = append(risky, r)
			total += r.ExpiryRiskValue
		}
	}
	sort.SliceStable(risky, func(i, j int) bool { return risky[i].ExpiryRiskValue > risky[j].ExpiryRiskValue })
	type batch struct {
		Batch         string  `json:"batch"`
		Expiry        *string `json:"expiry"`
		Stock         float64 `json:"stock"`
		SellableUntil *string `json:"sellable_until"`
		RiskQty       float64 `json:"risk_qty"`
		RiskValue     float64 `json:"risk_value"`
	}
	type row struct {
		shortRow
		Batches []batch `json:"at_risk_batches"`
	}
	rows := []row{}
	for _, r := range risky[:min(len(risky), limitOf(in.Limit))] {
		out := row{shortRow: toShort(r), Batches: []batch{}}
		for _, b := range r.Batches {
			if b.Status == "at_risk" {
				out.Batches = append(out.Batches, batch{str(b.Batch), day(b.Expiry), b.Stock, day(b.SellableUntil), round1(b.RiskQty), round1(b.RiskValue)})
			}
		}
		rows = append(rows, out)
	}
	return map[string]any{
		"shelf_days":         d.ShelfDays,
		"products_at_risk":   len(risky),
		"total_value_risked": round1(total),
		"rows":               rows,
		"rows_shown":         len(rows),
	}, nil
}

func runGetSlowMovers(ctx context.Context, s *session, input json.RawMessage) (any, error) {
	var in struct {
		MinDays int `json:"min_days"`
		Limit   int
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	days := 30
	if in.MinDays > 0 {
		days = in.MinDays
	}
	all, err := margede.NotSelling(ctx, s.db, days, true)
	if err != nil {
		return nil, err
	}
	type row struct {
		PID           int64   `json:"product_pid"`
		Name          string  `json:"name"`
		Company       string  `json:"company"`
		BoughtUnits   float64 `json:"bought_units"`
		BoughtAmount  float64 `json:"bought_amount_ex_gst"`
		SoldUnits     float64 `json:"sold_units"`
		SellThrough   float64 `json:"sell_through_pct"`
		FirstPurchase string  `json:"first_purchase"`
		LastSold      *string `json:"last_sold"`
		DaysSince     int     `json:"days_since_first_purchase"`
	}
	rows := []row{}
	for _, r := range all[:min(len(all), limitOf(in.Limit))] {
		rows = append(rows, row{r.ProductPID, str(r.Name), str(r.Company), r.BoughtUnits, round1(r.BoughtAmount), r.SoldUnits,
			round1(r.SellThrough * 100), r.FirstPurchase.Format("2006-01-02"), day(r.LastSold), r.DaysSinceFirst})
	}
	return map[string]any{"products": len(all), "rows": rows, "rows_shown": len(rows)}, nil
}

func runGetProduct(ctx context.Context, s *session, input json.RawMessage) (any, error) {
	var in struct {
		PID int64 `json:"product_pid"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	a, err := margede.AnalyzeProduct(ctx, s.db, in.PID, 0, false)
	if err != nil {
		return nil, err
	}
	d, err := margede.Demand(ctx, s.db, margede.DemandOptions{Product: &in.PID, ShelfDays: margede.DefaultShelfDays, AllBatches: true})
	if err != nil {
		return nil, err
	}
	type month struct {
		Month     string  `json:"month"`
		Qty       float64 `json:"qty_sold"`
		Sales     float64 `json:"sales_ex_gst"`
		Customers int     `json:"customers"`
	}
	type buyer struct {
		Name    string  `json:"name"`
		City    string  `json:"city"`
		Qty     float64 `json:"qty"`
		Amount  float64 `json:"amount"`
		Share   float64 `json:"share_pct"`
		LastBuy *string `json:"last_buy"`
	}
	out := map[string]any{
		"product_pid": a.ProductPID, "name": str(a.Name), "company": str(a.Company), "form": str(a.Form),
		"year_sales_ex_gst": round1(a.Amount), "year_qty": a.Qty, "year_free_qty": a.Free,
		"customers": a.Customers, "avg_rate": round1(a.AvgRate), "best_month": a.BestMonth,
	}
	months := []month{}
	for _, m := range a.Monthly {
		months = append(months, month{m.Month, m.Qty, round1(m.Sales), m.Customers})
	}
	out["monthly"] = months
	buyers := []buyer{}
	for _, b := range a.Buyers[:min(len(a.Buyers), 10)] {
		buyers = append(buyers, buyer{str(b.Name), str(b.City), b.Qty, round1(b.Amount), round1(b.Share * 100), day(b.LastBuy)})
	}
	out["top_buyers"] = buyers
	if len(d.Rows) > 0 {
		r := d.Rows[0]
		out["stock"] = toShort(r)
		out["averages_monthly"] = map[string]float64{"2m": round1(r.Avg2), "3m": round1(r.Avg3), "6m": round1(r.Avg6), "12m": round1(r.Avg12)}
		pos := []map[string]any{}
		for _, p := range r.POs {
			pos = append(pos, map[string]any{"po_number": p.PONumber, "date": day(p.Date), "qty": p.Qty,
				"received": p.Received, "status": p.Status, "open": p.Open, "outstanding_qty": p.OutstandQty})
		}
		out["linked_pos"] = pos
		batches := []map[string]any{}
		for _, b := range r.Batches {
			batches = append(batches, map[string]any{"batch": str(b.Batch), "expiry": day(b.Expiry), "stock": b.Stock,
				"mrp": b.MRP, "sells_out_by": day(b.SellsOutBy), "risk_qty": round1(b.RiskQty), "status": b.Status})
		}
		out["batches"] = batches
		if r.LastRemark != nil {
			out["last_remark"] = r.LastRemark
		}
	}
	return out, nil
}

// toolByName finds a tool for the loop.
func toolByName(name string) (tool, bool) {
	for _, t := range tools {
		if strings.EqualFold(t.def.Name, name) {
			return t, true
		}
	}
	return tool{}, false
}
