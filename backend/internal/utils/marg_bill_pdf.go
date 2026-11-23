package utils

import (
	"bytes"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/jung-kurt/gofpdf"
)

// MargBillPDFData is one Marg bill as printed: the company, the party, the
// lines and the totals. Money is in rupees; empty strings are left off.
type MargBillPDFData struct {
	CompanyName    string
	CompanyAddress string
	CompanyGSTIN   string
	CompanyDLNo    string
	CompanyContact string

	Title       string // the bill type: "Sales Return", "Challan", ... ("" prints no heading)
	BillNo      string
	BillDate    string // YYYY-MM-DD
	IsCancelled bool

	PartyLabel   string // "Bill to", "Supplier", ...
	PartyName    string
	PartyCode    string
	PartyAddress []string
	PartyGSTIN   string
	PartyDLNo    string
	PartyPhone   string

	Facts [][2]string // label, value: against bill, reason, app orders, salesman ...

	Lines []MargBillPDFLine

	LinesTotal    float64
	BillTotal     float64
	LinesComplete bool // false: Marg sent fewer lines than the total covers

	PrintedBy string
	PrintedAt string
}

// MargBillPDFLine is one line of the bill. Charge lines (freight and other
// "###" items in Marg) carry no batch or quantity.
type MargBillPDFLine struct {
	Product    string
	Batch      string
	Expiry     string // MM/YY
	Qty        float64
	Free       float64
	MRP        *float64
	Rate       *float64
	Discount   float64
	Amount     float64 // taxable, after discount
	GSTPercent float64
	GSTAmount  float64
	LineTotal  float64
	IsCharge   bool
}

func billMoney(v float64) string { return indianNumber(v, 2) }

// indianNumber formats 1234567.5 as "12,34,567.50".
func indianNumber(v float64, decimals int) string {
	neg := v < 0
	s := fmt.Sprintf("%.*f", decimals, math.Abs(v))
	intPart, frac := s, ""
	if i := strings.IndexByte(s, '.'); i >= 0 {
		intPart, frac = s[:i], s[i:]
	}
	if len(intPart) > 3 {
		head, tail := intPart[:len(intPart)-3], intPart[len(intPart)-3:]
		var groups []string
		for len(head) > 2 {
			groups = append([]string{head[len(head)-2:]}, groups...)
			head = head[:len(head)-2]
		}
		if head != "" {
			groups = append([]string{head}, groups...)
		}
		intPart = strings.Join(groups, ",") + "," + tail
	}
	if neg {
		return "-" + intPart + frac
	}
	return intPart + frac
}

func qtyText(v float64) string {
	if v == math.Trunc(v) {
		return indianNumber(v, 0)
	}
	return indianNumber(v, 2)
}

var (
	onesWords = []string{"", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
		"Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"}
	tensWords = []string{"", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"}
)

func belowHundred(n int) string {
	if n < 20 {
		return onesWords[n]
	}
	if n%10 == 0 {
		return tensWords[n/10]
	}
	return tensWords[n/10] + " " + onesWords[n%10]
}

func belowThousand(n int) string {
	parts := []string{}
	if n >= 100 {
		parts = append(parts, onesWords[n/100]+" Hundred")
		n %= 100
	}
	if n > 0 {
		parts = append(parts, belowHundred(n))
	}
	return strings.Join(parts, " ")
}

// RupeesInWords spells an amount the Indian way: "Rupees One Lakh Twenty
// Thousand and Fifty Paise Only".
func RupeesInWords(v float64) string {
	v = math.Abs(v)
	rupees := int64(v)
	paise := int(math.Round((v - float64(rupees)) * 100))
	if paise == 100 {
		rupees++
		paise = 0
	}
	out := "Rupees Zero"
	if rupees > 0 {
		out = "Rupees " + RupeesInWordsInt(rupees)
	}
	if paise > 0 {
		out += " and " + belowHundred(paise) + " Paise"
	}
	return out + " Only"
}

// RupeesInWordsInt spells a whole number below a crore-crore.
func RupeesInWordsInt(n int64) string {
	if n >= 10000000 {
		return RupeesInWordsInt(n/10000000) + " Crore " + RupeesInWordsInt(n%10000000)
	}
	parts := []string{}
	if n >= 100000 {
		parts = append(parts, belowHundred(int(n/100000))+" Lakh")
		n %= 100000
	}
	if n >= 1000 {
		parts = append(parts, belowHundred(int(n/1000))+" Thousand")
		n %= 1000
	}
	if n > 0 {
		parts = append(parts, belowThousand(int(n)))
	}
	return strings.TrimSpace(strings.Join(parts, " "))
}

// copyNotice sits under the header of every printed bill.
const copyNotice = "COPY FOR REFERENCE ONLY. This is a computer-generated copy of a bill from our records. " +
	"It is not a tax invoice and must not be mistaken for, or used as, the original invoice."

// GenerateMargBillPDF prints a Marg bill on A4.
func GenerateMargBillPDF(d MargBillPDFData) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	const left, top, pageW, bottomLimit = 10.0, 10.0, 190.0, 280.0
	pdf.SetMargins(left, top, left)
	pdf.SetAutoPageBreak(false, 0)
	tr := pdf.UnicodeTranslatorFromDescriptor("") // built-in fonts are cp1252
	t := func(s string) string { return tr(strings.ReplaceAll(s, "₹", "Rs.")) }

	// a single-line cell, cut with "..." to fit its width
	fit := func(s string, w float64) string {
		s = t(s)
		if pdf.GetStringWidth(s) <= w-2 {
			return s
		}
		for len(s) > 0 && pdf.GetStringWidth(s+"...") > w-2 {
			s = s[:len(s)-1]
		}
		return s + "..."
	}

	pdf.SetFooterFunc(func() {
		pdf.SetY(-10)
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(120, 120, 120)
		note := "Copy for reference only, not a tax invoice - bill " + d.BillNo
		if d.PrintedAt != "" {
			note += " - printed " + d.PrintedAt
		}
		if d.PrintedBy != "" {
			note += " by " + d.PrintedBy
		}
		pdf.CellFormat(pageW/2, 4, t(note), "", 0, "L", false, 0, "")
		pdf.CellFormat(pageW/2, 4, fmt.Sprintf("Page %d of {nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AliasNbPages("{nb}")
	pdf.AddPage()

	// ── company (left) and bill (right) ─────────────────────────────────
	y0 := pdf.GetY()
	pdf.SetFont("Arial", "B", 14)
	pdf.CellFormat(120, 7, t(d.CompanyName), "", 2, "L", false, 0, "")
	pdf.SetFont("Arial", "", 8.5)
	for _, l := range []string{d.CompanyAddress, d.CompanyContact} {
		if l != "" {
			pdf.MultiCell(120, 4, t(l), "", "L", false)
		}
	}
	ids := []string{}
	if d.CompanyGSTIN != "" {
		ids = append(ids, "GSTIN: "+d.CompanyGSTIN)
	}
	if d.CompanyDLNo != "" {
		ids = append(ids, "D.L. No.: "+d.CompanyDLNo)
	}
	if len(ids) > 0 {
		pdf.MultiCell(120, 4, t(strings.Join(ids, "    ")), "", "L", false)
	}
	yCompany := pdf.GetY()

	pdf.SetXY(left+120, y0)
	if d.Title != "" {
		pdf.SetFont("Arial", "B", 13)
		pdf.CellFormat(70, 7, t(strings.ToUpper(d.Title)), "", 2, "R", false, 0, "")
	}
	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(70, 5, t("Bill No.: "+d.BillNo), "", 2, "R", false, 0, "")
	pdf.CellFormat(70, 5, t("Date: "+formatDate(d.BillDate)), "", 2, "R", false, 0, "")
	if d.IsCancelled {
		pdf.SetFont("Arial", "B", 11)
		pdf.SetTextColor(200, 30, 30)
		pdf.CellFormat(70, 7, "CANCELLED", "", 2, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	}
	pdf.SetY(math.Max(yCompany, pdf.GetY()) + 2)
	pdf.SetDrawColor(180, 180, 180)
	pdf.Line(left, pdf.GetY(), left+pageW, pdf.GetY())
	pdf.Ln(2)

	// the legal notice: this is a copy for reference, not the invoice
	pdf.SetFillColor(255, 246, 230)
	pdf.SetDrawColor(230, 180, 110)
	pdf.SetTextColor(140, 80, 0)
	pdf.SetFont("Arial", "B", 8)
	pdf.MultiCell(pageW, 4.5, t(copyNotice), "1", "C", true)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetDrawColor(180, 180, 180)
	pdf.Ln(3)

	// ── party (left) and facts (right) ──────────────────────────────────
	y0 = pdf.GetY()
	pdf.SetFont("Arial", "B", 8)
	pdf.SetTextColor(110, 110, 110)
	pdf.CellFormat(110, 4, t(strings.ToUpper(d.PartyLabel)), "", 2, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "B", 10.5)
	name := d.PartyName
	if name == "" {
		name = "Unknown party"
	}
	pdf.MultiCell(110, 5, t(name), "", "L", false)
	pdf.SetFont("Arial", "", 8.5)
	for _, l := range d.PartyAddress {
		pdf.MultiCell(110, 4, t(l), "", "L", false)
	}
	partyIDs := []string{}
	if d.PartyGSTIN != "" {
		partyIDs = append(partyIDs, "GSTIN: "+d.PartyGSTIN)
	}
	if d.PartyDLNo != "" {
		partyIDs = append(partyIDs, "D.L. No.: "+d.PartyDLNo)
	}
	if len(partyIDs) > 0 {
		pdf.MultiCell(110, 4, t(strings.Join(partyIDs, "    ")), "", "L", false)
	}
	extra := []string{}
	if d.PartyPhone != "" {
		extra = append(extra, "Phone: "+d.PartyPhone)
	}
	if d.PartyCode != "" {
		extra = append(extra, "Party code: "+d.PartyCode)
	}
	if len(extra) > 0 {
		pdf.MultiCell(110, 4, t(strings.Join(extra, "    ")), "", "L", false)
	}
	yParty := pdf.GetY()

	pdf.SetXY(left+115, y0)
	for _, f := range d.Facts {
		pdf.SetX(left + 115)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(28, 4.5, t(f[0]), "", 0, "L", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
		pdf.MultiCell(47, 4.5, t(f[1]), "", "L", false)
	}
	pdf.SetY(math.Max(yParty, pdf.GetY()) + 4)

	// ── lines ───────────────────────────────────────────────────────────
	type col struct {
		title string
		w     float64
		align string
	}
	cols := []col{
		{"#", 8, "C"}, {"PRODUCT", 43, "L"}, {"BATCH", 21, "L"}, {"EXP", 11, "C"},
		{"QTY", 11, "R"}, {"FREE", 10, "R"}, {"MRP", 15, "R"}, {"RATE", 15, "R"},
		{"DISC", 12, "R"}, {"TAXABLE", 17, "R"}, {"GST%", 10, "R"}, {"AMOUNT", 17, "R"},
	}
	header := func() {
		pdf.SetFont("Arial", "B", 7)
		pdf.SetFillColor(238, 240, 242)
		for _, c := range cols {
			pdf.CellFormat(c.w, 6, c.title, "1", 0, c.align, true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont("Arial", "", 7.5)
	}
	header()
	const rowH = 5.5
	var qtyTotal, freeTotal float64
	for i, l := range d.Lines {
		if pdf.GetY()+rowH > bottomLimit-10 {
			pdf.AddPage()
			header()
		}
		opt := func(p *float64) string {
			if p == nil || *p == 0 {
				return ""
			}
			return billMoney(*p)
		}
		disc := ""
		if l.Discount != 0 {
			disc = billMoney(l.Discount)
		}
		qty, free := qtyText(l.Qty), ""
		if l.Free > 0 {
			free = qtyText(l.Free)
		}
		if l.IsCharge {
			qty = ""
		} else {
			qtyTotal += l.Qty
			freeTotal += l.Free
		}
		gst := ""
		if l.GSTPercent > 0 || l.GSTAmount > 0 {
			gst = strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%.2f", l.GSTPercent), "0"), ".0")
		}
		vals := []string{fmt.Sprint(i + 1), l.Product, l.Batch, l.Expiry, qty, free,
			opt(l.MRP), opt(l.Rate), disc, billMoney(l.Amount), gst, billMoney(l.LineTotal)}
		for j, c := range cols {
			pdf.CellFormat(c.w, rowH, fit(vals[j], c.w), "LR", 0, c.align, false, 0, "")
		}
		pdf.Ln(-1)
	}
	// closing rule and the quantity totals
	pdf.SetFont("Arial", "B", 7.5)
	for j, c := range cols {
		v := ""
		switch j {
		case 1:
			v = fmt.Sprintf("%d line%s", len(d.Lines), map[bool]string{true: "", false: "s"}[len(d.Lines) == 1])
		case 4:
			v = qtyText(qtyTotal)
		case 5:
			if freeTotal > 0 {
				v = qtyText(freeTotal)
			}
		}
		pdf.CellFormat(c.w, 6, fit(v, c.w), "1", 0, c.align, false, 0, "")
	}
	pdf.Ln(-1)
	pdf.Ln(3)

	// ── totals ──────────────────────────────────────────────────────────
	var taxable float64
	gstByRate := map[float64][2]float64{} // rate -> taxable, gst
	for _, l := range d.Lines {
		taxable += l.Amount
		g := gstByRate[l.GSTPercent]
		gstByRate[l.GSTPercent] = [2]float64{g[0] + l.Amount, g[1] + l.GSTAmount}
	}
	rates := make([]float64, 0, len(gstByRate))
	for r, g := range gstByRate {
		if g[1] != 0 {
			rates = append(rates, r)
		}
	}
	sort.Float64s(rates)

	rows := [][2]string{{"Taxable amount", billMoney(taxable)}}
	for _, r := range rates {
		g := gstByRate[r]
		rows = append(rows, [2]string{fmt.Sprintf("GST @ %s%% on %s", strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%.2f", r), "0"), ".0"), billMoney(g[0])), billMoney(g[1])})
	}
	if diff := d.BillTotal - d.LinesTotal; d.LinesComplete && math.Abs(diff) >= 0.005 {
		rows = append(rows, [2]string{"Round off / other", billMoney(diff)})
	}

	if pdf.GetY()+float64(len(rows))*5+24 > bottomLimit {
		pdf.AddPage()
	}
	yTotals := pdf.GetY()
	pdf.SetFont("Arial", "", 8.5)
	for _, r := range rows {
		pdf.SetX(left + 110)
		pdf.CellFormat(55, 5, t(r[0]), "", 0, "R", false, 0, "")
		pdf.CellFormat(25, 5, t(r[1]), "", 1, "R", false, 0, "")
	}
	pdf.SetX(left + 110)
	pdf.SetFont("Arial", "B", 10.5)
	pdf.CellFormat(45, 7, "BILL TOTAL", "T", 0, "R", false, 0, "")
	pdf.CellFormat(35, 7, t("Rs. "+billMoney(d.BillTotal)), "T", 1, "R", false, 0, "")
	yEnd := pdf.GetY()

	pdf.SetXY(left, yTotals)
	pdf.SetFont("Arial", "", 7.5)
	pdf.SetTextColor(110, 110, 110)
	pdf.CellFormat(105, 4, "Amount in words", "", 2, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "B", 8.5)
	pdf.MultiCell(105, 4.5, t(RupeesInWords(d.BillTotal)), "", "L", false)
	if !d.LinesComplete && !d.IsCancelled {
		pdf.Ln(2)
		pdf.SetFont("Arial", "", 7.5)
		pdf.SetTextColor(170, 100, 0)
		pdf.MultiCell(105, 4, t(fmt.Sprintf("Marg sent lines adding up to Rs. %s, but the bill total is Rs. %s: some lines are missing from Marg's data.",
			billMoney(d.LinesTotal), billMoney(d.BillTotal))), "", "L", false)
		pdf.SetTextColor(0, 0, 0)
	}
	pdf.SetY(math.Max(yEnd, pdf.GetY()) + 12)

	// signature (not on a supplier's bill: that is theirs to sign)
	if d.PartyLabel != "Supplier" {
		if pdf.GetY()+14 > bottomLimit {
			pdf.AddPage()
		}
		pdf.SetX(left + 110)
		pdf.SetFont("Arial", "B", 8.5)
		pdf.CellFormat(80, 5, t("For "+d.CompanyName), "", 2, "R", false, 0, "")
		pdf.Ln(8)
		pdf.SetX(left + 110)
		pdf.SetFont("Arial", "", 8)
		pdf.CellFormat(80, 5, "Authorised Signatory", "", 1, "R", false, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
