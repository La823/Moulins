package margede

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

// Voucher types, named from bill-number prefixes in the real data
// (MPPL/CA, P, CN, DN, AD, SC, PD). Marg does not document them; T and u
// are the least certain.
var billTypeNames = map[string]string{
	"S": "Sale",
	"P": "Purchase",
	"R": "Credit note",
	"B": "Debit note",
	"D": "Stock adjustment",
	"T": "Sales challan",
	"u": "Purchase return challan",
}

var istZone = time.FixedZone("IST", 5*3600+1800)

// Bill is a cleaned MDis row, ready to write.
type Bill struct {
	Voucher          int64
	MargRowID        int64
	BillNo           string
	BillType         string
	BillTypeName     *string
	BillDate         string
	PartyCode        *string
	BillMode         *string
	Total            float64
	Cash             *float64
	Others           *float64
	SalePurchaseType *string
	Salesman         *string
	Route            *string
	Area             *string
	OrderRefs        *string
	OrderDate        *string
	ExtraAmount      *float64
	RefBillNo        *string
	RefBillDate      *string
	RefAmount        *float64
	Reason           *string
	AdjustedAgainst  *string
	AdjustedAmount   *float64
	IsCancelled      bool
	CancelledAt      *time.Time
	AddField         string
	Hash             string
}

// Item is a cleaned Dis row.
type Item struct {
	MargLineID      int64
	Voucher         int64
	LineType        *string
	LineBillNo      *string
	BillDate        string
	PartyCode       *string
	ProductPID      int64
	ItemCompanyCode *string
	LineKind        string
	Batch           *string
	Expiry          *string
	Qty             float64
	Free            float64
	MRP             float64
	Rate            float64
	Discount        float64
	Amount          float64
	GSTPercent      float64
	GSTAmount       float64
	Salesman        *string
	ChallanNo       *string
	ChallanDate     *string
	AddField        string
	Hash            string
}

// text trims Marg's space padding; blank becomes nil.
func text(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

// isoDate turns "2026-10-17T00:00:00" into "2026-10-17"; Marg's
// "1900-01-01" placeholder becomes nil.
func isoDate(s string) *string {
	s = strings.TrimSpace(s)
	if len(s) < 10 || strings.HasPrefix(s, "1900-01-01") {
		return nil
	}
	d := s[:10]
	if _, err := time.Parse("2006-01-02", d); err != nil {
		return nil
	}
	return &d
}

// compactDate turns AddField's "20271101" into "2027-11-01".
func compactDate(s string) *string {
	t, err := time.Parse("20060102", strings.TrimSpace(s))
	if err != nil {
		return nil
	}
	d := t.Format("2006-01-02")
	return &d
}

// dmyDate turns AddField's "20-01-2026" into "2026-01-20".
func dmyDate(s string) *string {
	t, err := time.Parse("02-01-2006", strings.TrimSpace(s))
	if err != nil {
		return nil
	}
	d := t.Format("2006-01-02")
	return &d
}

func number(s string) *float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return nil
	}
	return &f
}

func nonZero(f float64) *float64 {
	if f == 0 {
		return nil
	}
	return &f
}

// field returns AddField position i, or "".
func field(parts []string, i int) string {
	if i < len(parts) {
		return strings.TrimSpace(parts[i])
	}
	return ""
}

// transformVersion is part of every row hash. Bump it whenever ToBill or
// ToItem changes what they derive, so the next sync rewrites every stored
// row once instead of only rows Marg changed.
const transformVersion = 2

func hashOf(v any) string {
	b, _ := json.Marshal(struct {
		V   int
		Row any
	}{transformVersion, v})
	sum := sha1.Sum(b)
	return hex.EncodeToString(sum[:])
}

// cancellation finds " CANCELLED : 1; CANCELLEDON : 17-10-2026 18:18:19" in
// an AddField. The time is Marg's wall clock, which is IST.
func cancellation(addField string) (bool, *time.Time) {
	if !strings.Contains(addField, "CANCELLED : 1") {
		return false, nil
	}
	if i := strings.Index(addField, "CANCELLEDON :"); i >= 0 {
		raw := strings.TrimSpace(addField[i+len("CANCELLEDON :"):])
		if len(raw) >= 19 {
			if t, err := time.ParseInLocation("02-01-2006 15:04:05", raw[:19], istZone); err == nil {
				return true, &t
			}
		}
	}
	return true, nil
}

// ToBill cleans one MDis row.
//
// AddField layout, as observed: 0 = I (credit) / C (cash); 1 = an amount on
// a few bills (unconfirmed); 2-4 = original bill no, date (dd-mm-yyyy) and
// amount on credit notes; 5 = reason; 7-8 = bill adjusted against, amount;
// a trailing "CANCELLED : 1; CANCELLEDON : ..." on cancelled bills.
func ToBill(r BillRow) Bill {
	p := strings.Split(r.AddField, ";")
	b := Bill{
		Voucher:          int64(r.Voucher),
		MargRowID:        r.ID,
		BillNo:           strings.TrimSpace(r.VCN),
		BillType:         strings.TrimSpace(r.Type),
		PartyCode:        text(r.CID),
		Total:            r.Final,
		Cash:             nonZero(r.Cash),
		Others:           nonZero(r.Others),
		SalePurchaseType: text(r.Salun),
		Salesman:         text(r.MR),
		Route:            text(r.Rout),
		Area:             text(r.Area),
		OrderRefs:        text(r.ORN),
		OrderDate:        isoDate(r.ODate),
		RefBillNo:        text(field(p, 2)),
		RefBillDate:      dmyDate(field(p, 3)),
		Reason:           text(field(p, 5)),
		AdjustedAgainst:  text(field(p, 7)),
		AddField:         r.AddField,
	}
	if d := isoDate(r.Date); d != nil {
		b.BillDate = *d
	}
	if n, ok := billTypeNames[b.BillType]; ok {
		b.BillTypeName = &n
	}
	// AddField pos 0: I = invoice, C = challan. CA-numbered sales are
	// delivery challans: once one is billed it disappears from Marg and its
	// number shows up on the invoice's lines (challan_no).
	switch field(p, 0) {
	case "I":
		m := "invoice"
		b.BillMode = &m
	case "C":
		m := "challan"
		b.BillMode = &m
	}
	if v := number(field(p, 1)); v != nil && *v != 0 {
		b.ExtraAmount = v
	}
	if v := number(field(p, 4)); v != nil && *v != 0 {
		b.RefAmount = v
	}
	if v := number(field(p, 8)); v != nil && *v != 0 {
		b.AdjustedAmount = v
	}
	b.IsCancelled, b.CancelledAt = cancellation(r.AddField)
	b.Hash = hashOf(r)
	return b
}

// ToItem cleans one Dis row. chargePIDs holds products whose code starts
// with ### (freight, insurance, cylinder charges ...), which Marg books as
// bill lines but which are not goods.
//
// AddField layout, as observed: 2 = salesman; 6 = batch expiry (yyyymmdd);
// 22-23 = challan no and date (yyyymmdd).
func ToItem(r LineRow, chargePIDs map[int64]bool) Item {
	p := strings.Split(r.AddField, ";")
	it := Item{
		MargLineID:      r.ID,
		Voucher:         int64(r.Voucher),
		LineType:        text(r.Type),
		LineBillNo:      text(r.VCN),
		PartyCode:       text(r.CID),
		ProductPID:      int64(r.PID),
		ItemCompanyCode: text(r.GCode),
		LineKind:        "item",
		Batch:           text(r.Batch),
		Expiry:          compactDate(field(p, 6)),
		Qty:             r.Qty,
		Free:            r.Free,
		MRP:             r.MRP,
		Rate:            r.Rate,
		Discount:        r.Discount,
		Amount:          r.Amount,
		GSTPercent:      r.GST,
		GSTAmount:       r.GSTAmount,
		Salesman:        text(field(p, 2)),
		ChallanNo:       text(field(p, 22)),
		ChallanDate:     compactDate(field(p, 23)),
		AddField:        r.AddField,
	}
	if d := isoDate(r.Date); d != nil {
		it.BillDate = *d
	}
	if chargePIDs[it.ProductPID] {
		it.LineKind = "charge"
	}
	it.Hash = hashOf(r)
	return it
}

// ChargePIDs picks the ### products out of the response's Product blob.
func ChargePIDs(products []ProductRow) map[int64]bool {
	out := map[int64]bool{}
	for _, p := range products {
		if strings.HasPrefix(strings.TrimSpace(p.Code), "###") {
			out[int64(p.PID)] = true
		}
	}
	return out
}

// Ledger is a cleaned Party row.
type Ledger struct {
	MargID       int64
	PartyCode    *string
	Name         string
	ShortName    *string
	City         *string
	GroupCode    *string
	GroupName    *string
	Kind         string
	Address1     *string
	Address2     *string
	Address3     *string
	Pin          *string
	GSTIN        *string
	DLNo         *string
	Phone1       *string
	Phone2       *string
	Phone3       *string
	Phone4       *string
	Area         *string
	Route        *string
	Salesman     *string
	RateFlag     *string
	CreditStatus *string
	CreditLimit  *float64
	CreditDays   *int
	CreditBills  *int
	Lat          *string
	Lng          *string
	MargDeleted  bool
	AddField     string
	Hash         string
}

// ledgerGroups names Marg's ledger group codes (Party.SCode), worked out
// from the accounts in each group in Moulins' data; Marg does not document
// them. Unknown codes fall back by prefix in groupInfo.
var ledgerGroups = map[string]struct{ name, kind string }{
	"C6":  {"Customers", "customer"},
	"C6z": {"Customers (MargMart)", "customer"},
	"D3":  {"Suppliers", "supplier"},
	"D34": {"Manufacturers", "manufacturer"}, // Baddi/Solan/Sirmour makers, all with a DL
	"D33": {"Expense vendors", "expense_vendor"},
	"D32": {"Staff", "staff"},
	"B":   {"Capital", "other"},
	"C1":  {"Banks", "bank_cash"},
	"C2":  {"Cash", "bank_cash"},
	"C5":  {"Stock in hand", "other"},
	"Cx":  {"Advances & deposits", "other"},
	"D":   {"Current liabilities", "other"},
	"Dy":  {"Duties & taxes (reverse charge / advance)", "tax"},
	"E":   {"Fixed assets", "other"},
	"I":   {"Profit & loss", "other"},
	"J11": {"Direct expenses", "expense_account"},
	"J12": {"Indirect expenses", "expense_account"},
	"J3":  {"Charges billed on sales", "sales_purchase_account"},
	"J4":  {"Interest", "expense_account"},
	"J5":  {"Stock receive", "other"},
	"J6":  {"Stock transfer", "other"},
	"J51": {"Purchase accounts (central)", "sales_purchase_account"},
	"J52": {"Purchase accounts (local)", "sales_purchase_account"},
	"J61": {"Sales accounts (central)", "sales_purchase_account"},
	"J62": {"Sales accounts (local)", "sales_purchase_account"},
	"K":   {"Suspense", "other"},
}

func groupInfo(code string) (*string, string) {
	if g, ok := ledgerGroups[code]; ok {
		n := g.name
		return &n, g.kind
	}
	if strings.HasPrefix(code, "D1") { // D1, D1z, D11, D12 and one with a stray byte
		n := "Duties & taxes"
		return &n, "tax"
	}
	return nil, "other"
}

func intOrNil(v int) *int {
	if v == 0 {
		return nil
	}
	return &v
}

// ToLedger cleans one Party row. Marg pads ParNam so the first 30
// characters are the name and the rest the city.
func ToLedger(r PartyRow) Ledger {
	full := strings.Join(strings.Fields(r.ParNam), " ")
	var short, city *string
	if runes := []rune(r.ParNam); len(runes) > 30 {
		short, city = text(string(runes[:30])), text(string(runes[30:]))
	} else {
		short = text(r.ParNam)
	}
	group := strings.TrimSpace(r.SCode)
	groupName, kind := groupInfo(group)
	l := Ledger{
		MargID:       r.ID,
		PartyCode:    text(r.CID),
		Name:         full,
		ShortName:    short,
		City:         city,
		GroupCode:    text(group),
		GroupName:    groupName,
		Kind:         kind,
		Address1:     text(r.ParAdd),
		Address2:     text(r.ParAdd1),
		Address3:     text(r.ParAdd2),
		Pin:          text(r.Pin),
		GSTIN:        text(r.GSTNo),
		DLNo:         text(r.DlNo),
		Phone1:       text(r.Phone1),
		Phone2:       text(r.Phone2),
		Phone3:       text(r.Phone3),
		Phone4:       text(r.Phone4),
		Area:         text(r.Area),
		Route:        text(r.Rout),
		Salesman:     text(r.MR),
		RateFlag:     text(r.Rate),
		CreditStatus: text(r.CRStatus),
		CreditLimit:  nonZero(r.Credit),
		CreditDays:   intOrNil(r.CRDays),
		CreditBills:  intOrNil(r.CRBills),
		Lat:          text(r.Lat),
		Lng:          text(r.Lng),
		MargDeleted:  strings.TrimSpace(r.IsDeleted) == "1",
		AddField:     r.AddField,
	}
	l.Hash = hashOf(r)
	return l
}

// Lookups resolves Marg's list codes: (list, code) -> name, e.g.
// ("COMMCD", "ZSP") -> "30042019". Codes repeat across lists, so the list
// is always part of the key.
type Lookups map[[2]string]string

// BuildLookups indexes the SaleType blob.
func BuildLookups(rows []SaleTypeRow) Lookups {
	l := Lookups{}
	for _, r := range rows {
		l[[2]string{strings.TrimSpace(r.SGCode), strings.TrimSpace(r.SCode)}] = strings.Join(strings.Fields(r.Name), " ")
	}
	return l
}

func (l Lookups) name(list, code string) *string {
	if code == "" {
		return nil
	}
	if v, ok := l[[2]string{list, code}]; ok && v != "" {
		return &v
	}
	return nil
}

// Product is a cleaned Product row.
type Product struct {
	PID         int64
	MargID      int64
	Code        *string
	Name        string
	Unit        *string
	Pack        *float64
	Kind        string
	CompanyCode *string
	CompanyName *string
	FormCode    *string
	FormName    *string
	HSNCode     *string
	GSTPercent  float64
	AddField    string
	Hash        string
}

// ToProduct cleans one Product row. Company comes from the ZZZZZZ list,
// dosage form from SALT, HSN from COMMCD (GCode6 is a code into it).
func ToProduct(r ProductRow, lk Lookups) Product {
	company := strings.TrimSpace(r.GCode)
	form := strings.TrimSpace(r.GCode3)
	hsnCode := strings.TrimSpace(r.GCode6)
	p := Product{
		PID:         int64(r.PID),
		MargID:      r.ID,
		Code:        text(r.Code),
		Name:        strings.Join(strings.Fields(r.Name), " "),
		Unit:        text(r.Unit),
		Pack:        nonZero(r.Pack),
		Kind:        "item",
		CompanyCode: text(company),
		CompanyName: lk.name("ZZZZZZ", company),
		FormCode:    text(form),
		FormName:    lk.name("SALT", form),
		HSNCode:     lk.name("COMMCD", hsnCode),
		GSTPercent:  r.GST,
		AddField:    r.AddField,
	}
	if p.HSNCode != nil {
		// Some COMMCD names repeat the code ("96190040       96190040").
		h := strings.Fields(*p.HSNCode)[0]
		p.HSNCode = &h
	}
	if strings.HasPrefix(strings.TrimSpace(r.Code), "###") {
		p.Kind = "charge"
	}
	p.Hash = hashOf(struct {
		R       ProductRow
		C, F, H *string
	}{r, p.CompanyName, p.FormName, p.HSNCode})
	return p
}

// StockBatch is a cleaned Stock row.
type StockBatch struct {
	MargID          int64
	ProductPID      int64
	Batch           *string
	ItemCompanyCode *string
	BatchDate       *string
	Expiry          *string
	SupplierInvoice *string
	SupplierDate    *string
	SupplierCode    *string
	Opening         float64
	Stock           float64
	BrokenStock     float64
	CostRate        float64
	PurchaseRate    float64
	MRP             float64
	RateA           *float64
	RateB           *float64
	RateC           *float64
	AddField        string
	Hash            string
}

// ToStock cleans one Stock row.
func ToStock(r StockRow) StockBatch {
	s := StockBatch{
		MargID:          r.ID,
		ProductPID:      int64(r.PID),
		Batch:           text(r.Batch),
		ItemCompanyCode: text(r.GCode),
		BatchDate:       isoDate(r.BatDate),
		Expiry:          isoDate(r.Expiry),
		SupplierInvoice: text(r.SupInvo),
		SupplierDate:    isoDate(r.SupDate),
		SupplierCode:    text(r.SupCode),
		Opening:         r.Opening,
		Stock:           r.Stock,
		BrokenStock:     r.BrkStock,
		CostRate:        r.LPRate,
		PurchaseRate:    r.PRate,
		MRP:             r.MRP,
		RateA:           nonZero(r.RateA),
		RateB:           nonZero(r.RateB),
		RateC:           nonZero(r.RateC),
		AddField:        r.AddField,
	}
	s.Hash = hashOf(r)
	return s
}
