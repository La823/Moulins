package margede

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Rate history: what a partner has been charged for a product before, for
// the order page's rate column. Two sources —
//   - Marg sale bills (invoices and challans, not cancelled) to the
//     partner's Marg party: users.rid → margmaster_party.code =
//     marg_ede_bills.party_code; product: products.marg_code = Marg PID.
//   - earlier app orders of the same partner where staff set a rate.

// RatePoint is one time the product was priced for the partner.
type RatePoint struct {
	Date     time.Time `json:"date"`
	Source   string    `json:"source"` // bill | challan | order
	Ref      string    `json:"ref"`    // bill no, or order id
	Voucher  *int64    `json:"voucher,omitempty"`
	OrderID  *string   `json:"order_id,omitempty"`
	Qty      float64   `json:"qty"`
	Free     float64   `json:"free"`
	Rate     float64   `json:"rate"`
	MRP      *float64  `json:"mrp,omitempty"`
	Discount float64   `json:"discount,omitempty"`
	Batch    *string   `json:"batch,omitempty"`
	// The batch as Marg's stock knows it (bills only).
	PurchaseRate *float64   `json:"purchase_rate,omitempty"`
	BatchMRP     *float64   `json:"batch_mrp,omitempty"`
	Expiry       *time.Time `json:"expiry,omitempty"`
	// The supplier invoice Marg's stock records for the batch — what a batch
	// bought before this financial year has instead of a purchase bill.
	SupplierInvoice *string    `json:"supplier_invoice,omitempty"`
	SupplierDate    *time.Time `json:"supplier_invoice_date,omitempty"`
	Status          *string    `json:"status,omitempty"` // order status
}

// ProductRateHistory is one product's history for the partner, newest first.
type ProductRateHistory struct {
	ProductID string      `json:"product_id"`
	MargCode  *string     `json:"marg_code"`
	Points    []RatePoint `json:"points"`
	Last      *RatePoint  `json:"last"` // the most recent Marg bill, else the most recent order
	MinRate   *float64    `json:"min_rate"`
	MaxRate   *float64    `json:"max_rate"`
	AvgRate   *float64    `json:"avg_rate"` // weighted by quantity
	Times     int         `json:"times"`
	// Purchase bill lines (this financial year) of the batches in Points.
	Purchases []BatchPurchase `json:"purchases"`
}

// BatchPurchase is one purchase bill line that brought a batch in.
type BatchPurchase struct {
	Batch    *string   `json:"batch"`
	Date     time.Time `json:"date"`
	Voucher  int64     `json:"voucher"`
	BillNo   string    `json:"bill_no"`
	Supplier *string   `json:"supplier"`
	Qty      float64   `json:"qty"`
	Free     float64   `json:"free"`
	Rate     float64   `json:"rate"`
	MRP      *float64  `json:"mrp,omitempty"`
}

// RateHistory is the response for one partner.
type RateHistory struct {
	PartyCode *string                        `json:"party_code"` // nil: partner not linked to Marg
	Products  map[string]*ProductRateHistory `json:"products"`
}

// GetRateHistory returns, for each of productIDs, what partnerID was
// charged for it before (excluding excludeOrder, typically the order being
// edited). At most perProduct points per product.
func GetRateHistory(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID, productIDs []string, excludeOrder *uuid.UUID, perProduct int) (RateHistory, error) {
	out := RateHistory{Products: map[string]*ProductRateHistory{}}
	if perProduct <= 0 || perProduct > 100 {
		perProduct = 25
	}
	for _, id := range productIDs {
		out.Products[id] = &ProductRateHistory{ProductID: id, Points: []RatePoint{}, Purchases: []BatchPurchase{}}
	}
	if len(productIDs) == 0 {
		return out, nil
	}

	if err := db.QueryRow(ctx, `
		SELECT TRIM(mp.code) FROM users u
		JOIN margmaster_party mp ON mp.rid = NULLIF(u.rid, '')
		WHERE u.id = $1`, partnerID).Scan(&out.PartyCode); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}

	// Marg bills.
	if out.PartyCode != nil && *out.PartyCode != "" {
		rows, err := db.Query(ctx, `
			SELECT p.id::text, p.marg_code, b.bill_date, b.voucher, b.bill_no, b.bill_mode,
			       i.qty::float8, i.free::float8, COALESCE(i.rate, 0)::float8, i.mrp::float8,
			       i.discount::float8, i.batch,
			       NULLIF(st.purchase_rate, 0)::float8, NULLIF(st.mrp, 0)::float8, COALESCE(st.expiry, i.expiry),
			       NULLIF(TRIM(st.supplier_invoice), ''), st.supplier_invoice_date
			FROM products p
			JOIN marg_ede_bill_items i ON i.product_pid::text = p.marg_code AND NOT i.is_deleted
			JOIN marg_ede_bills b ON b.voucher = i.voucher
			LEFT JOIN LATERAL (
				SELECT s.purchase_rate, s.mrp, s.expiry, s.supplier_invoice, s.supplier_invoice_date FROM marg_ede_stock s
				WHERE s.product_pid = i.product_pid AND COALESCE(s.batch, '') = COALESCE(i.batch, '') AND NOT s.is_deleted
				LIMIT 1
			) st ON TRUE
			WHERE p.id::text = ANY($1::text[]) AND b.party_code = $2
			  AND b.bill_type = 'S' AND NOT b.is_deleted AND NOT b.is_cancelled
			ORDER BY b.bill_date DESC, b.bill_no DESC`, productIDs, *out.PartyCode)
		if err != nil {
			return out, err
		}
		for rows.Next() {
			var pid string
			var code, mode *string
			var pt RatePoint
			var voucher int64
			if err := rows.Scan(&pid, &code, &pt.Date, &voucher, &pt.Ref, &mode, &pt.Qty, &pt.Free, &pt.Rate,
				&pt.MRP, &pt.Discount, &pt.Batch, &pt.PurchaseRate, &pt.BatchMRP, &pt.Expiry,
				&pt.SupplierInvoice, &pt.SupplierDate); err != nil {
				rows.Close()
				return out, err
			}
			pt.Voucher = &voucher
			pt.Source = "bill"
			if mode != nil && *mode == "challan" {
				pt.Source = "challan"
			}
			h := out.Products[pid]
			h.MargCode = code
			h.Points = append(h.Points, pt)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return out, err
		}
		if err := addBatchPurchases(ctx, db, out); err != nil {
			return out, err
		}
	}

	// Earlier app orders with a rate.
	orows, err := db.Query(ctx, `
		SELECT oi.product_id::text, o.created_at, o.id::text, o.status, oi.quantity::float8, oi.rate::float8
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE o.user_id = $1 AND oi.product_id::text = ANY($2::text[]) AND oi.rate IS NOT NULL
		  AND ($3::uuid IS NULL OR o.id <> $3) AND o.status <> 'cancelled'
		ORDER BY o.created_at DESC`, partnerID, productIDs, excludeOrder)
	if err != nil {
		return out, err
	}
	for orows.Next() {
		var pid, orderID, status string
		var pt RatePoint
		if err := orows.Scan(&pid, &pt.Date, &orderID, &status, &pt.Qty, &pt.Rate); err != nil {
			orows.Close()
			return out, err
		}
		pt.Source, pt.OrderID, pt.Status = "order", &orderID, &status
		pt.Ref = "#" + orderID[:8]
		out.Products[pid].Points = append(out.Products[pid].Points, pt)
	}
	orows.Close()
	if err := orows.Err(); err != nil {
		return out, err
	}

	for _, h := range out.Products {
		sort.SliceStable(h.Points, func(i, j int) bool { return h.Points[i].Date.After(h.Points[j].Date) })
		var sum, qty float64
		for i := range h.Points {
			p := &h.Points[i]
			if p.Rate <= 0 {
				continue
			}
			if h.MinRate == nil || p.Rate < *h.MinRate {
				v := p.Rate
				h.MinRate = &v
			}
			if h.MaxRate == nil || p.Rate > *h.MaxRate {
				v := p.Rate
				h.MaxRate = &v
			}
			w := p.Qty
			if w <= 0 {
				w = 1
			}
			sum += p.Rate * w
			qty += w
			h.Times++
		}
		if qty > 0 {
			v := sum / qty
			h.AvgRate = &v
		}
		// "Last" prefers what was actually invoiced.
		for i := range h.Points {
			if h.Points[i].Source != "order" && h.Points[i].Rate > 0 {
				h.Last = &h.Points[i]
				break
			}
		}
		if h.Last == nil {
			for i := range h.Points {
				if h.Points[i].Rate > 0 {
					h.Last = &h.Points[i]
					break
				}
			}
		}
		if len(h.Points) > perProduct {
			h.Points = h.Points[:perProduct]
		}
	}
	return out, nil
}

// addBatchPurchases fills each product's Purchases with the purchase bill
// lines of the batches it was sold to the partner from.
func addBatchPurchases(ctx context.Context, db *pgxpool.Pool, out RateHistory) error {
	sold := map[string]bool{} // product id + "|" + batch
	var ids, batches []string
	for id, h := range out.Products {
		for _, p := range h.Points {
			b := ""
			if p.Batch != nil {
				b = *p.Batch
			}
			if !sold[id+"|"+b] {
				sold[id+"|"+b] = true
				ids = append(ids, id)
				batches = append(batches, b)
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	rows, err := db.Query(ctx, `
		SELECT p.id::text, i.batch, b.bill_date, b.voucher, b.bill_no, lg.name,
		       i.qty::float8, i.free::float8, COALESCE(i.rate, 0)::float8, i.mrp::float8
		FROM unnest($1::text[], $2::text[]) AS want(product_id, batch)
		JOIN products p ON p.id::text = want.product_id
		JOIN marg_ede_bill_items i ON i.product_pid::text = p.marg_code AND COALESCE(i.batch, '') = want.batch
		JOIN marg_ede_bills b ON b.voucher = i.voucher
		LEFT JOIN LATERAL (
			SELECT l.name FROM marg_ede_ledger l
			WHERE l.party_code = b.party_code AND NOT l.is_deleted ORDER BY l.marg_id LIMIT 1
		) lg ON TRUE
		WHERE b.bill_type = 'P' AND i.line_kind = 'item'
		  AND NOT i.is_deleted AND NOT b.is_deleted AND NOT b.is_cancelled
		ORDER BY b.bill_date DESC, b.bill_no DESC`, ids, batches)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var pid string
		var bp BatchPurchase
		if err := rows.Scan(&pid, &bp.Batch, &bp.Date, &bp.Voucher, &bp.BillNo, &bp.Supplier,
			&bp.Qty, &bp.Free, &bp.Rate, &bp.MRP); err != nil {
			return err
		}
		h := out.Products[pid]
		h.Purchases = append(h.Purchases, bp)
	}
	return rows.Err()
}
