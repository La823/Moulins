package dispatch

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

// FreightBill is one transporter's freight bill and what was paid for it.
type FreightBill struct {
	ID              string     `json:"id"`
	BillNo          string     `json:"bill_no,omitempty"`
	BillDate        *time.Time `json:"bill_date,omitempty"`
	TransportID     string     `json:"transport_id,omitempty"`
	TransporterName string     `json:"transporter_name,omitempty"`
	AmountPaid      float64    `json:"amount_paid"`
	PaymentMode     string     `json:"payment_mode"`
	PaidBy          string     `json:"paid_by,omitempty"`
	Remarks         string     `json:"remarks,omitempty"`
	FileURL         string     `json:"file_url"`
	FileName        string     `json:"file_name,omitempty"`
	ContentType     string     `json:"content_type,omitempty"`
	CreatedBy       string     `json:"created_by,omitempty"` // name
	CreatedByID     string     `json:"created_by_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

// FreightInput is what a person fills in for a bill.
type FreightInput struct {
	BillNo          string  `json:"bill_no"`
	BillDate        string  `json:"bill_date"` // YYYY-MM-DD, or empty
	TransportID     string  `json:"transport_id"`
	TransporterName string  `json:"transporter_name"`
	AmountPaid      float64 `json:"amount_paid"`
	PaymentMode     string  `json:"payment_mode"`
	PaidBy          string  `json:"paid_by"`
	Remarks         string  `json:"remarks"`
	FileKey         string  `json:"file_key"`
	FileName        string  `json:"file_name"`
	ContentType     string  `json:"content_type"`
}

var paymentModes = map[string]bool{"cash": true, "upi": true, "bank": true, "cheque": true, "other": true}

// ErrInvalid is a bill that can't be saved as given; its message says why.
type ErrInvalid struct{ Msg string }

func (e ErrInvalid) Error() string { return e.Msg }

// ErrFreightNotFound: no such bill (or it was removed).
var ErrFreightNotFound = errors.New("dispatch: freight bill not found")

func (in *FreightInput) clean(needFile bool) (billDate *time.Time, transportID *uuid.UUID, err error) {
	in.BillNo, in.TransporterName = strings.TrimSpace(in.BillNo), strings.TrimSpace(in.TransporterName)
	in.PaidBy, in.Remarks = strings.TrimSpace(in.PaidBy), strings.TrimSpace(in.Remarks)
	in.PaymentMode = strings.ToLower(strings.TrimSpace(in.PaymentMode))
	if in.AmountPaid < 0 || in.AmountPaid > 1e9 {
		return nil, nil, ErrInvalid{"Enter the amount paid."}
	}
	if !paymentModes[in.PaymentMode] {
		return nil, nil, ErrInvalid{"Pick how it was paid: cash, UPI, bank, cheque or other."}
	}
	// keys come from GeneratePresignedFreightBillUploadURL only
	if needFile && !strings.HasPrefix(in.FileKey, "freight-bills/") {
		return nil, nil, ErrInvalid{"Add a photo or PDF of the bill."}
	}
	if in.FileKey != "" && !strings.HasPrefix(in.FileKey, "freight-bills/") {
		return nil, nil, ErrInvalid{"That file was not uploaded here."}
	}
	if d := strings.TrimSpace(in.BillDate); d != "" {
		t, perr := time.Parse("2006-01-02", d)
		if perr != nil {
			return nil, nil, ErrInvalid{"Bill date should be a date."}
		}
		billDate = &t
	}
	if in.TransportID != "" {
		id, perr := uuid.Parse(in.TransportID)
		if perr != nil {
			return nil, nil, ErrInvalid{"Unknown transporter."}
		}
		transportID = &id
	}
	if transportID == nil && in.TransporterName == "" {
		return nil, nil, ErrInvalid{"Pick or type the transporter."}
	}
	return billDate, transportID, nil
}

// CreateFreightBill saves a new bill for userID.
func CreateFreightBill(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, in FreightInput) (string, error) {
	billDate, transportID, err := in.clean(true)
	if err != nil {
		return "", err
	}
	var id string
	err = db.QueryRow(ctx, `
		INSERT INTO freight_bills (bill_no, bill_date, transport_id, transporter_name, amount_paid, payment_mode,
		                           paid_by, remarks, file_key, file_name, content_type, created_by)
		VALUES (NULLIF($1, ''), $2, $3,
		        COALESCE(NULLIF($4, ''), (SELECT name FROM transports WHERE id = $3)),
		        $5, $6, NULLIF($7, ''), NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF($11, ''), $12)
		RETURNING id::text`,
		in.BillNo, billDate, transportID, in.TransporterName, in.AmountPaid, in.PaymentMode,
		in.PaidBy, in.Remarks, in.FileKey, in.FileName, in.ContentType, userID).Scan(&id)
	return id, err
}

// UpdateFreightBill changes a bill; onlyBy limits it to bills that person
// added (uuid.Nil: any bill). An empty file key keeps the current file.
func UpdateFreightBill(ctx context.Context, db *pgxpool.Pool, id, onlyBy uuid.UUID, in FreightInput) error {
	billDate, transportID, err := in.clean(false)
	if err != nil {
		return err
	}
	tag, err := db.Exec(ctx, `
		UPDATE freight_bills SET
		    bill_no = NULLIF($2, ''), bill_date = $3, transport_id = $4,
		    transporter_name = COALESCE(NULLIF($5, ''), (SELECT name FROM transports WHERE id = $4)),
		    amount_paid = $6, payment_mode = $7, paid_by = NULLIF($8, ''), remarks = NULLIF($9, ''),
		    file_key = COALESCE(NULLIF($10, ''), file_key),
		    file_name = CASE WHEN $10 <> '' THEN NULLIF($11, '') ELSE file_name END,
		    content_type = CASE WHEN $10 <> '' THEN NULLIF($12, '') ELSE content_type END,
		    updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL AND ($13::uuid IS NULL OR created_by = $13)`,
		id, in.BillNo, billDate, transportID, in.TransporterName, in.AmountPaid, in.PaymentMode,
		in.PaidBy, in.Remarks, in.FileKey, in.FileName, in.ContentType, nilIfZero(onlyBy))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFreightNotFound
	}
	return nil
}

// DeleteFreightBill removes a bill from the lists (kept in the table);
// onlyBy as in UpdateFreightBill.
func DeleteFreightBill(ctx context.Context, db *pgxpool.Pool, id, onlyBy uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		UPDATE freight_bills SET deleted_at = now()
		WHERE id = $1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR created_by = $2)`, id, nilIfZero(onlyBy))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFreightNotFound
	}
	return nil
}

// FreightFilter narrows the bill list.
type FreightFilter struct {
	From, To  *time.Time // bill date (or the day it was added, when it has none)
	CreatedBy uuid.UUID  // uuid.Nil: everyone's
	Search    string     // bill no, transporter, remarks, who paid
}

// FreightList is the bills and what they add up to.
type FreightList struct {
	Bills []FreightBill `json:"bills"`
	Total float64       `json:"total"`
	Count int           `json:"count"`
}

// ListFreightBills returns the bills matching f, newest first (up to 500).
func ListFreightBills(ctx context.Context, db *pgxpool.Pool, f FreightFilter) (*FreightList, error) {
	rows, err := db.Query(ctx, `
		SELECT b.id::text, COALESCE(b.bill_no, ''), b.bill_date, COALESCE(b.transport_id::text, ''),
		       COALESCE(b.transporter_name, t.name, ''), b.amount_paid::float8, b.payment_mode,
		       COALESCE(b.paid_by, ''), COALESCE(b.remarks, ''), b.file_key, COALESCE(b.file_name, ''),
		       COALESCE(b.content_type, ''), COALESCE(NULLIF(u.username, ''), u.phone_number, ''),
		       COALESCE(b.created_by::text, ''), b.created_at
		FROM freight_bills b
		LEFT JOIN transports t ON t.id = b.transport_id
		LEFT JOIN users u ON u.id = b.created_by
		WHERE b.deleted_at IS NULL
		  AND ($1::date IS NULL OR COALESCE(b.bill_date, (b.created_at AT TIME ZONE 'Asia/Kolkata')::date) >= $1)
		  AND ($2::date IS NULL OR COALESCE(b.bill_date, (b.created_at AT TIME ZONE 'Asia/Kolkata')::date) <= $2)
		  AND ($3::uuid IS NULL OR b.created_by = $3)
		  AND ($4 = '' OR concat_ws(' ', b.bill_no, b.transporter_name, t.name, b.remarks, b.paid_by) ILIKE '%' || $4 || '%')
		ORDER BY COALESCE(b.bill_date, (b.created_at AT TIME ZONE 'Asia/Kolkata')::date) DESC, b.created_at DESC
		LIMIT 500`, f.From, f.To, nilIfZero(f.CreatedBy), strings.TrimSpace(f.Search))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := &FreightList{Bills: []FreightBill{}}
	for rows.Next() {
		var b FreightBill
		var key string
		if err := rows.Scan(&b.ID, &b.BillNo, &b.BillDate, &b.TransportID, &b.TransporterName, &b.AmountPaid,
			&b.PaymentMode, &b.PaidBy, &b.Remarks, &key, &b.FileName, &b.ContentType, &b.CreatedBy,
			&b.CreatedByID, &b.CreatedAt); err != nil {
			return nil, err
		}
		b.FileURL = utils.GetPublicURL(key)
		out.Bills = append(out.Bills, b)
		out.Total += b.AmountPaid
	}
	out.Count = len(out.Bills)
	return out, rows.Err()
}

// FreightBillOwner returns who added a bill (uuid.Nil if unknown).
func FreightBillOwner(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (uuid.UUID, error) {
	var by *uuid.UUID
	err := db.QueryRow(ctx, `SELECT created_by FROM freight_bills WHERE id = $1 AND deleted_at IS NULL`, id).Scan(&by)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrFreightNotFound
	}
	if err != nil || by == nil {
		return uuid.Nil, err
	}
	return *by, nil
}

func nilIfZero(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}
