package margede

import (
	"testing"
	"time"
)

// Rows shaped like a real Marg pull (field layout, padding, AddField
// positions); party details are made up.

func TestToBillCreditNoteAndCancellation(t *testing.T) {
	cn := ToBill(BillRow{
		ID: 2338161540, Voucher: 49900.0, Type: "R", VCN: "CN00004         ",
		Date: "2026-05-02T00:00:00", CID: "HRE   ", Final: 3701.0,
		AddField: "I;      0.00;MPPL00253;20-04-2026;70095.00;;1;*MPPL01911;-775.00;;;",
		ODate:    "1900-01-01T00:00:00",
	})
	if cn.BillNo != "CN00004" || cn.Voucher != 49900 || cn.BillDate != "2026-05-02" {
		t.Fatalf("basic fields: %+v", cn)
	}
	if cn.PartyCode == nil || *cn.PartyCode != "HRE" {
		t.Fatalf("party code not trimmed: %v", cn.PartyCode)
	}
	if cn.BillTypeName == nil || *cn.BillTypeName != "Credit note" || *cn.BillMode != "invoice" {
		t.Fatalf("type/mode: %v %v", cn.BillTypeName, cn.BillMode)
	}
	if cn.RefBillNo == nil || *cn.RefBillNo != "MPPL00253" || *cn.RefBillDate != "2026-04-20" || *cn.RefAmount != 70095 {
		t.Fatalf("credit note reference: %v %v %v", cn.RefBillNo, cn.RefBillDate, cn.RefAmount)
	}
	if *cn.AdjustedAgainst != "*MPPL01911" || *cn.AdjustedAmount != -775 {
		t.Fatalf("adjusted against: %v %v", cn.AdjustedAgainst, cn.AdjustedAmount)
	}
	if cn.OrderDate != nil || cn.ExtraAmount != nil || cn.IsCancelled {
		t.Fatalf("1900 date / zero amount / cancel flag: %+v", cn)
	}

	c := ToBill(BillRow{
		Voucher: 86731.0, Type: "S", VCN: "MPPL02693", Date: "2026-10-17T00:00:00", CID: "HMP",
		AddField: "I;      0.00;;;;;;;0.00;;;; CANCELLED : 1; CANCELLEDON : 17-10-2026 18:28:07",
	})
	want := time.Date(2026, 10, 17, 18, 28, 7, 0, istZone)
	if !c.IsCancelled || c.CancelledAt == nil || !c.CancelledAt.Equal(want) {
		t.Fatalf("cancellation: %v %v", c.IsCancelled, c.CancelledAt)
	}
}

func TestToItem(t *testing.T) {
	charges := ChargePIDs([]ProductRow{{PID: 1000020.0, Code: "###5      "}, {PID: 1000111.0, Code: "30"}})

	it := ToItem(LineRow{
		ID: 2546229011, Voucher: 90163.0, Type: "G", VCN: "CA002646        ", Date: "2026-10-19T00:00:00",
		CID: "HMP   ", PID: 1000036.0, GCode: "IB    ", Batch: "BSG261087F  ", Qty: 25, MRP: 1120,
		Rate: 110, Amount: 2750, GST: 5, GSTAmount: 137.5,
		AddField: "C;N;IMH;00;0;;20280601;0;0;0;69;0;0;0;0;0;0;0;0;;;QIQK;CA000932;20260613;0",
	}, charges)
	if it.Voucher != 90163 || it.ProductPID != 1000036 || *it.Batch != "BSG261087F" || it.LineKind != "item" {
		t.Fatalf("basic fields: %+v", it)
	}
	if it.Expiry == nil || *it.Expiry != "2028-06-01" {
		t.Fatalf("expiry: %v", it.Expiry)
	}
	if *it.Salesman != "IMH" || *it.ChallanNo != "CA000932" || *it.ChallanDate != "2026-06-13" {
		t.Fatalf("salesman/challan: %v %v %v", it.Salesman, it.ChallanNo, it.ChallanDate)
	}

	freight := ToItem(LineRow{ID: 2544179465, Voucher: 49843.0, Type: "G", Date: "2026-04-01T00:00:00",
		PID: 1000020.0, Batch: "            ", Rate: 2857.5, Amount: 2857.5, GST: 18,
		AddField: "I; ;;00;0;;;0;0;0;0;0;0;0;0;0;0;0;0;;;IBYT;;;0"}, charges)
	if freight.LineKind != "charge" || freight.Batch != nil || freight.Expiry != nil || freight.ChallanNo != nil {
		t.Fatalf("charge line: %+v", freight)
	}
}

func TestHashChangesWithContent(t *testing.T) {
	r := LineRow{ID: 1, Voucher: 2, Qty: 5, Date: "2026-10-19T00:00:00"}
	a := ToItem(r, nil).Hash
	r.Qty = 6
	if b := ToItem(r, nil).Hash; a == b {
		t.Fatal("hash did not change when qty changed")
	}
}

func TestToLedger(t *testing.T) {
	l := ToLedger(PartyRow{
		ID: 1001, SCode: "C6    ", CID: "TST   ",
		ParNam:    "SAMPLE MEDICAL AGENCY         TESTPUR        ",
		ParAdd:    "12 MAIN ROAD                                 ",
		GSTNo:     "               ",
		Phone2:    "9000000001  ",
		DlNo:      "20B/TEST/0001                                ",
		Pin:       "100001",
		IsDeleted: "0",
	})
	if l.MargID != 1001 || *l.PartyCode != "TST" || l.Kind != "customer" || *l.GroupName != "Customers" {
		t.Fatalf("ids/group: %+v", l)
	}
	if l.Name != "SAMPLE MEDICAL AGENCY TESTPUR" || *l.ShortName != "SAMPLE MEDICAL AGENCY" || *l.City != "TESTPUR" {
		t.Fatalf("name split: %q %v %v", l.Name, *l.ShortName, *l.City)
	}
	if l.GSTIN != nil || *l.Phone2 != "9000000001" || l.Phone1 != nil || l.MargDeleted {
		t.Fatalf("blanks/phones: %+v", l)
	}

	tax := ToLedger(PartyRow{ID: 1, SCode: "D1�", ParNam: "EXCISE P.L.A."})
	if tax.Kind != "tax" || tax.City != nil {
		t.Fatalf("D1 prefix group / short name: %+v", tax)
	}
}

func TestToProductAndStock(t *testing.T) {
	lk := BuildLookups([]SaleTypeRow{
		{SGCode: "ZZZZZZ", SCode: "IB    ", Name: "SAMPLE PHARMA"},
		{SGCode: "SALT  ", SCode: "SGB   ", Name: "TABLET"},
		{SGCode: "COMMCD", SCode: "SGB   ", Name: "30049099       30049099"}, // same code, other list
	})
	p := ToProduct(ProductRow{ID: 7, PID: 1000111.0, Code: "30        ", Name: "TESTOMAX TAB  10*10",
		Unit: "BOX ", GCode: "IB    ", GCode3: "SGB   ", GCode6: "SGB   ", GST: 5}, lk)
	if p.PID != 1000111 || *p.Code != "30" || p.Name != "TESTOMAX TAB 10*10" || p.Kind != "item" {
		t.Fatalf("basic fields: %+v", p)
	}
	if *p.CompanyName != "SAMPLE PHARMA" || *p.FormName != "TABLET" || *p.HSNCode != "30049099" {
		t.Fatalf("lookups: %v %v %v", *p.CompanyName, *p.FormName, *p.HSNCode)
	}
	if c := ToProduct(ProductRow{PID: 1000020.0, Code: "###5", Name: "FREIGHT OUTWARD SALE 18%"}, lk); c.Kind != "charge" || c.CompanyName != nil {
		t.Fatalf("charge product: %+v", c)
	}

	s := ToStock(StockRow{ID: 9, PID: 1000111.0, Batch: "TB001       ", Expiry: "2027-09-01T00:00:00",
		BatDate: "1900-01-01T00:00:00", SupInvo: "            ", Stock: -16, Opening: 3, PRate: 300, MRP: 2430})
	if s.ProductPID != 1000111 || *s.Batch != "TB001" || *s.Expiry != "2027-09-01" || s.Stock != -16 {
		t.Fatalf("stock fields: %+v", s)
	}
	if s.BatchDate != nil || s.SupplierInvoice != nil || s.RateA != nil {
		t.Fatalf("blank/1900 handling: %+v", s)
	}
}
