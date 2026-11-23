package margede

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// The company block printed at the top of a bill. Name and address default
// to what the website shows; GSTIN and drug licence numbers print only once
// set in the server's environment (COMPANY_GSTIN, COMPANY_DL_NO).
func companyEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// GET /admin/marg-bills/{voucher}/pdf: a printable copy of one Marg bill
// (company, party with address/GSTIN/licence from the Marg ledger, every
// line, GST by rate, total and amount in words). Same permissions as
// reading the bill.
func BillPDFHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		voucher, err := strconv.ParseInt(mux.Vars(r)["voucher"], 10, 64)
		if err != nil {
			http.Error(w, "invalid voucher", http.StatusBadRequest)
			return
		}
		bill, err := margede.GetBill(r.Context(), db, voucher)
		if err != nil {
			http.Error(w, "bill not found", http.StatusNotFound)
			return
		}

		d := utils.MargBillPDFData{
			CompanyName:    companyEnv("COMPANY_NAME", "Moulins Pharmaceuticals Pvt Ltd"),
			CompanyAddress: companyEnv("COMPANY_ADDRESS", "1st Floor, 363, Industrial Area Phase 2, Panchkula, Haryana 134113"),
			CompanyGSTIN:   companyEnv("COMPANY_GSTIN", ""),
			CompanyDLNo:    companyEnv("COMPANY_DL_NO", ""),
			CompanyContact: companyEnv("COMPANY_CONTACT", "info@moulinspharma.com"),
			BillNo:         bill.BillNo,
			BillDate:       bill.BillDate.Format("2006-01-02"),
			IsCancelled:    bill.IsCancelled,
			PartyLabel:     "Bill to",
			LinesTotal:     bill.LinesTotal,
			BillTotal:      bill.Total,
			LinesComplete:  bill.LinesComplete,
		}
		d.Title = "Bill"
		if bill.BillTypeName != nil && *bill.BillTypeName != "" {
			d.Title = *bill.BillTypeName
		}
		if bill.BillType == "CH" || (bill.BillMode != nil && *bill.BillMode == "challan") {
			d.Title = "Challan"
		}
		if bill.BillType == "P" || bill.BillType == "B" {
			d.PartyLabel = "Supplier"
		}

		if bill.PartyName != nil {
			d.PartyName = *bill.PartyName
		}
		if bill.PartyCode != nil && *bill.PartyCode != "" {
			d.PartyCode = *bill.PartyCode
			if c, ok, err := margede.BillPartyContact(r.Context(), db, *bill.PartyCode); err != nil {
				log.Printf("marg bill pdf %d: party %s: %v", voucher, *bill.PartyCode, err)
			} else if ok {
				if d.PartyName == "" {
					d.PartyName = c.Name
				}
				d.PartyAddress, d.PartyGSTIN, d.PartyDLNo, d.PartyPhone = c.Address, c.GSTIN, c.DLNo, c.Phone
			}
		}

		date := func(t *time.Time) string {
			if t == nil {
				return ""
			}
			return t.Format("02.01.2006")
		}
		str := func(p *string) string {
			if p == nil {
				return ""
			}
			return strings.TrimSpace(*p)
		}
		if ref := str(bill.RefBillNo); ref != "" {
			v := ref
			if dt := date(bill.RefBillDate); dt != "" {
				v += " (" + dt + ")"
			}
			d.Facts = append(d.Facts, [2]string{"Against bill", v})
		}
		for _, f := range [][2]string{
			{"Reason", str(bill.Reason)},
			{"App orders", str(bill.OrderRefs)},
			{"From challan", strings.Join(bill.FromChallans, ", ")},
			{"Order date", date(bill.OrderDate)},
			{"Salesman", str(bill.Salesman)},
			{"Area", str(bill.Area)},
		} {
			if f[1] != "" {
				d.Facts = append(d.Facts, f)
			}
		}

		for _, it := range bill.Items {
			l := utils.MargBillPDFLine{
				Product:   str(it.ProductName),
				Batch:     str(it.Batch),
				Qty:       it.Qty,
				Free:      it.Free,
				MRP:       it.MRP,
				Rate:      it.Rate,
				Discount:  it.Discount,
				Amount:    it.Amount,
				GSTAmount: it.GSTAmount,
				LineTotal: it.LineTotal,
				IsCharge:  it.LineKind == "charge",
			}
			if l.Product == "" {
				l.Product = fmt.Sprintf("Product %d", it.ProductPID)
			}
			if it.Expiry != nil {
				l.Expiry = it.Expiry.Format("01/06")
			}
			if it.GSTPercent != nil {
				l.GSTPercent = *it.GSTPercent
			}
			d.Lines = append(d.Lines, l)
		}

		// who printed it, for the footer
		ist, _ := time.LoadLocation("Asia/Kolkata")
		if ist == nil {
			ist = time.FixedZone("IST", 5*3600+1800)
		}
		d.PrintedAt = time.Now().In(ist).Format("02.01.2006 15:04")
		if id, ok := r.Context().Value("user_id").(string); ok {
			if uid, err := uuid.Parse(id); err == nil {
				if u, err := models.GetUserByID(r.Context(), db, uid); err == nil {
					if u.Username != nil && *u.Username != "" {
						d.PrintedBy = *u.Username
					} else {
						d.PrintedBy = u.PhoneNumber
					}
				}
			}
		}

		pdf, err := utils.GenerateMargBillPDF(d)
		if err != nil {
			log.Printf("marg bill pdf %d: %v", voucher, err)
			http.Error(w, "could not generate PDF", http.StatusInternalServerError)
			return
		}
		name := unsafeFileChars.ReplaceAllString(bill.BillNo, "-")
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=marg-bill-%s.pdf", name))
		w.Write(pdf)
	}
}
