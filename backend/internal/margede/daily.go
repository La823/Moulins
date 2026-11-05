package margede

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Day-to-day analysis: each day's sales (Marg sale invoices, as the other
// analysis pages count them — saleCond) and orders (app and staff orders,
// by the day they were placed, India time). One day in detail beside the
// day before and the same weekday a week earlier, and a row per day for
// its month.

// DayRow is one day's totals.
type DayRow struct {
	Date        string  `json:"date"` // YYYY-MM-DD
	Bills       int     `json:"bills"`
	Customers   int     `json:"customers"`
	Sales       float64 `json:"sales"`        // bill totals, GST included
	SalesExGST  float64 `json:"sales_ex_gst"` // line amounts
	Units       float64 `json:"units"`
	Orders      int     `json:"orders"`
	StaffOrders int     `json:"staff_orders"` // placed by staff for a customer
	Cancelled   int     `json:"cancelled"`
	OrderValue  float64 `json:"order_value"` // priced lines only
}

// DayCustomer is a customer billed on the day.
type DayCustomer struct {
	Name  string  `json:"name"`
	City  string  `json:"city"`
	Bills int     `json:"bills"`
	Sales float64 `json:"sales"`
}

// DayProduct is a product sold on the day.
type DayProduct struct {
	Name  string  `json:"name"`
	Units float64 `json:"units"`
	Sales float64 `json:"sales"` // ex GST
}

// DayOrder is an order placed on the day.
type DayOrder struct {
	ID        string    `json:"id"`
	Customer  string    `json:"customer"`
	Status    string    `json:"status"`
	Items     int       `json:"items"`
	Value     *float64  `json:"value"`     // nil when no line is priced
	PlacedBy  *string   `json:"placed_by"` // staff name; nil when the customer placed it
	MargOrder *string   `json:"marg_order_no"`
	CreatedAt time.Time `json:"created_at"`
}

// DailyReport is the page.
type DailyReport struct {
	Date      string        `json:"date"`
	Day       DayRow        `json:"day"`
	Yesterday DayRow        `json:"yesterday"` // the day before
	LastWeek  DayRow        `json:"last_week"` // same weekday a week earlier
	Month     []DayRow      `json:"month"`     // every day of the date's month, up to today
	Customers []DayCustomer `json:"customers"` // top 10 billed on the day
	Products  []DayProduct  `json:"products"`  // top 10 sold on the day
	Orders    []DayOrder    `json:"orders"`    // every order placed on the day
}

func dayRows(ctx context.Context, db *pgxpool.Pool, from, to time.Time) (map[string]*DayRow, error) {
	out := map[string]*DayRow{}
	var mu sync.Mutex
	get := func(d time.Time) *DayRow {
		k := d.Format("2006-01-02")
		if out[k] == nil {
			out[k] = &DayRow{Date: k}
		}
		return out[k]
	}
	var wg sync.WaitGroup
	var salesErr, ordersErr error
	wg.Add(2)
	// sales: bills, customers and bill totals, with the line amounts and units
	go func() {
		defer wg.Done()
		rows, err := db.Query(ctx, `
			WITH bills AS (
				SELECT b.voucher, b.bill_date, b.party_code, b.total FROM marg_ede_bills b
				WHERE `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled AND b.bill_date BETWEEN $1 AND $2
			), lines AS (
				SELECT b.bill_date, SUM(i.amount) AS amt, SUM(i.qty) FILTER (WHERE i.line_kind IS DISTINCT FROM 'charge') AS qty
				FROM bills b JOIN marg_ede_bill_items i ON i.voucher = b.voucher AND NOT i.is_deleted
				GROUP BY 1
			)
			SELECT b.bill_date, COUNT(*)::int, COUNT(DISTINCT b.party_code)::int, COALESCE(SUM(b.total), 0)::float8,
			       COALESCE(MAX(l.amt), 0)::float8, COALESCE(MAX(l.qty), 0)::float8
			FROM bills b LEFT JOIN lines l ON l.bill_date = b.bill_date
			GROUP BY 1`, from, to)
		if err != nil {
			salesErr = err
			return
		}
		defer rows.Close()
		for rows.Next() {
			var d time.Time
			var bills, cust int
			var total, amt, qty float64
			if err := rows.Scan(&d, &bills, &cust, &total, &amt, &qty); err != nil {
				salesErr = err
				return
			}
			mu.Lock()
			r := get(d)
			r.Bills, r.Customers, r.Sales, r.SalesExGST, r.Units = bills, cust, total, amt, qty
			mu.Unlock()
		}
		salesErr = rows.Err()
	}()
	// orders, by the day they were placed (India time)
	go func() {
		defer wg.Done()
		rows, err := db.Query(ctx, `
			SELECT (o.created_at AT TIME ZONE 'Asia/Kolkata')::date,
			       COUNT(*)::int,
			       COUNT(*) FILTER (WHERE ev.actor_id IS NOT NULL AND ev.actor_id <> o.user_id)::int,
			       COUNT(*) FILTER (WHERE o.status = 'cancelled')::int,
			       COALESCE(SUM(v.val) FILTER (WHERE o.status <> 'cancelled'), 0)::float8
			FROM orders o
			LEFT JOIN LATERAL (SELECT SUM(oi.line_total) AS val FROM order_items oi WHERE oi.order_id = o.id) v ON TRUE
			LEFT JOIN LATERAL (
				SELECT e.actor_id FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'order.created'
				ORDER BY e.created_at LIMIT 1
			) ev ON TRUE
			WHERE (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
			GROUP BY 1`, from, to)
		if err != nil {
			ordersErr = err
			return
		}
		defer rows.Close()
		for rows.Next() {
			var d time.Time
			var n, staff, cancelled int
			var val float64
			if err := rows.Scan(&d, &n, &staff, &cancelled, &val); err != nil {
				ordersErr = err
				return
			}
			mu.Lock()
			r := get(d)
			r.Orders, r.StaffOrders, r.Cancelled, r.OrderValue = n, staff, cancelled, val
			mu.Unlock()
		}
		ordersErr = rows.Err()
	}()
	wg.Wait()
	if salesErr != nil {
		return nil, salesErr
	}
	return out, ordersErr
}

// Daily builds the page for day (India time).
func Daily(ctx context.Context, db *pgxpool.Pool, day time.Time) (DailyReport, error) {
	ist := time.FixedZone("IST", 5*3600+1800)
	today := time.Now().In(ist)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
	if day.After(today) {
		day = today
	}
	monthStart := time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, -1)
	if monthEnd.After(today) {
		monthEnd = today
	}
	from := day.AddDate(0, 0, -7)
	if monthStart.Before(from) {
		from = monthStart
	}
	to := monthEnd
	if day.After(to) {
		to = day
	}

	out := DailyReport{Date: day.Format("2006-01-02"), Month: []DayRow{}, Customers: []DayCustomer{}, Products: []DayProduct{}, Orders: []DayOrder{}}
	// The parts don't depend on each other, and each is a round trip to a
	// database in another region: run them at the same time.
	var (
		wg                                sync.WaitGroup
		rows                              map[string]*DayRow
		rowsErr, custErr, prodErr, ordErr error
	)
	wg.Add(4)
	go func() { defer wg.Done(); rows, rowsErr = dayRows(ctx, db, from, to) }()
	go func() { defer wg.Done(); out.Customers, custErr = dayCustomers(ctx, db, day) }()
	go func() { defer wg.Done(); out.Products, prodErr = dayProducts(ctx, db, day) }()
	go func() { defer wg.Done(); out.Orders, ordErr = dayOrders(ctx, db, day) }()
	wg.Wait()
	for _, err := range []error{rowsErr, custErr, prodErr, ordErr} {
		if err != nil {
			return out, err
		}
	}
	pick := func(d time.Time) DayRow {
		if r := rows[d.Format("2006-01-02")]; r != nil {
			return *r
		}
		return DayRow{Date: d.Format("2006-01-02")}
	}
	out.Day, out.Yesterday, out.LastWeek = pick(day), pick(day.AddDate(0, 0, -1)), pick(day.AddDate(0, 0, -7))
	for d := monthStart; !d.After(monthEnd); d = d.AddDate(0, 0, 1) {
		out.Month = append(out.Month, pick(d))
	}

	return out, nil
}

func dayCustomers(ctx context.Context, db *pgxpool.Pool, day time.Time) ([]DayCustomer, error) {
	list := []DayCustomer{}
	crows, err := db.Query(ctx, `
		SELECT COALESCE(l.name, b.party_code, ''), COALESCE(l.city, ''), COUNT(*)::int, SUM(b.total)::float8
		FROM marg_ede_bills b
		LEFT JOIN LATERAL (
			SELECT ld.name, ld.city FROM marg_ede_ledger ld WHERE ld.party_code = b.party_code AND NOT ld.is_deleted
			ORDER BY ld.marg_id LIMIT 1
		) l ON TRUE
		WHERE `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled AND b.bill_date = $1
		GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 10`, day)
	if err != nil {
		return nil, err
	}
	for crows.Next() {
		var c DayCustomer
		if err := crows.Scan(&c.Name, &c.City, &c.Bills, &c.Sales); err != nil {
			crows.Close()
			return nil, err
		}
		list = append(list, c)
	}
	crows.Close()
	return list, crows.Err()
}

func dayProducts(ctx context.Context, db *pgxpool.Pool, day time.Time) ([]DayProduct, error) {
	list := []DayProduct{}
	prows, err := db.Query(ctx, `
		SELECT COALESCE(p.name, i.product_pid::text), SUM(i.qty)::float8, SUM(i.amount)::float8
		FROM marg_ede_bill_items i JOIN marg_ede_bills b ON b.voucher = i.voucher
		LEFT JOIN marg_ede_products p ON p.product_pid = i.product_pid
		WHERE `+saleCond+` AND NOT b.is_deleted AND NOT b.is_cancelled AND NOT i.is_deleted
		  AND i.line_kind IS DISTINCT FROM 'charge' AND b.bill_date = $1
		GROUP BY 1 ORDER BY 3 DESC LIMIT 10`, day)
	if err != nil {
		return nil, err
	}
	for prows.Next() {
		var p DayProduct
		if err := prows.Scan(&p.Name, &p.Units, &p.Sales); err != nil {
			prows.Close()
			return nil, err
		}
		list = append(list, p)
	}
	prows.Close()
	return list, prows.Err()
}

func dayOrders(ctx context.Context, db *pgxpool.Pool, day time.Time) ([]DayOrder, error) {
	list := []DayOrder{}
	orows, err := db.Query(ctx, `
		SELECT o.id::text, COALESCE(NULLIF(u.username, ''), u.phone_number, ''), o.status,
		       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int,
		       (SELECT SUM(oi.line_total) FROM order_items oi WHERE oi.order_id = o.id)::float8,
		       CASE WHEN ev.actor_id IS NOT NULL AND ev.actor_id <> o.user_id THEN COALESCE(NULLIF(st.username, ''), st.phone_number) END,
		       o.marg_order_no, o.created_at
		FROM orders o
		LEFT JOIN users u ON u.id = o.user_id
		LEFT JOIN LATERAL (
			SELECT e.actor_id FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'order.created'
			ORDER BY e.created_at LIMIT 1
		) ev ON TRUE
		LEFT JOIN users st ON st.id = ev.actor_id
		WHERE (o.created_at AT TIME ZONE 'Asia/Kolkata')::date = $1
		ORDER BY o.created_at DESC`, day)
	if err != nil {
		return nil, err
	}
	defer orows.Close()
	for orows.Next() {
		var o DayOrder
		if err := orows.Scan(&o.ID, &o.Customer, &o.Status, &o.Items, &o.Value, &o.PlacedBy, &o.MargOrder, &o.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, o)
	}
	return list, orows.Err()
}
