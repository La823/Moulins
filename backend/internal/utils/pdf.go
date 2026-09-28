package utils

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/jung-kurt/gofpdf"
)

type POPDFData struct {
	PONumber         string
	Date             string
	ManufacturerName string
	CompanyName      string
	ProductName      string
	Specifications   string
	Type             string
	Quantity         int
	MRP              float64
	Rate             float64
	Category         string
	Remarks          string
}

// formatDate converts YYYY-MM-DD to DD.MM.YYYY
func formatDate(d string) string {
	parts := strings.Split(d, "-")
	if len(parts) == 3 {
		return parts[2] + "." + parts[1] + "." + parts[0]
	}
	return d
}

func GeneratePOPDF(data POPDFData) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(20, 20, 20)
	pdf.AddPage()

	pageW := 170.0 // usable width (210 - 20 - 20)

	// ── Title ──────────────────────────────────────────────────────────────
	pdf.SetFont("Arial", "B", 16)
	pdf.CellFormat(pageW, 10, "PURCHASE ORDER PERFORMA", "", 1, "C", false, 0, "")
	pdf.Ln(4)

	// ── TO block ───────────────────────────────────────────────────────────
	pdf.SetFont("Arial", "B", 11)
	pdf.CellFormat(pageW, 7, "TO", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 11)
	pdf.CellFormat(pageW, 7, "M/S "+data.ManufacturerName, "", 1, "L", false, 0, "")
	pdf.Ln(3)

	// ── PO number & Date ───────────────────────────────────────────────────
	pdf.SetFont("Arial", "B", 11)
	pdf.CellFormat(pageW, 7, fmt.Sprintf("P.O.NO.- %s", data.PONumber), "", 1, "L", false, 0, "")
	pdf.CellFormat(pageW, 7, fmt.Sprintf("DATE- %s", formatDate(data.Date)), "", 1, "L", false, 0, "")
	pdf.Ln(5)

	// ── Opening letter ─────────────────────────────────────────────────────
	pdf.SetFont("Arial", "", 11)
	pdf.CellFormat(pageW, 7, "Dear Sir/Madam,", "", 1, "L", false, 0, "")
	pdf.MultiCell(pageW, 6,
		"Please find our Purchase order as per specifications given below.\nYou are requested to confirm the same.",
		"", "L", false)
	pdf.Ln(5)

	// ── Table ──────────────────────────────────────────────────────────────
	const labelW = 55.0
	valueW := pageW - labelW

	tableRows := []struct {
		label string
		value string
	}{
		{"COMPANY NAME", data.CompanyName},
		{"BRAND NAME", data.ProductName},
		{"TRADE MARK", "TM"},
		{"COMPOSITION", data.Specifications},
		{"PACKING", data.Specifications},
		{"QUANTITY", fmt.Sprintf("%d", data.Quantity)},
		{"M.R.P", fmt.Sprintf("Rs. %.2f per strip", data.MRP)},
		{"RATE", fmt.Sprintf("Rs. %.2f", data.Rate)},
	}

	if data.Type != "" {
		tableRows = append(tableRows, struct {
			label string
			value string
		}{"TYPE", data.Type})
	}
	if data.Category != "" {
		tableRows = append(tableRows, struct {
			label string
			value string
		}{"CATEGORY", data.Category})
	}

	for _, row := range tableRows {
		lines := pdf.SplitLines([]byte(row.value), valueW-4)
		rowH := float64(len(lines)) * 6.5
		if rowH < 9 {
			rowH = 9
		}

		x, y := pdf.GetX(), pdf.GetY()
		pdf.Rect(x, y, labelW, rowH, "D")
		pdf.Rect(x+labelW, y, valueW, rowH, "D")

		pdf.SetFont("Arial", "B", 10)
		pdf.SetXY(x+2, y+2)
		pdf.CellFormat(labelW-4, rowH-4, row.label, "", 0, "L", false, 0, "")

		pdf.SetFont("Arial", "", 10)
		pdf.SetXY(x+labelW+2, y+2)
		pdf.MultiCell(valueW-4, 6.5, row.value, "", "L", false)

		pdf.SetXY(x, y+rowH)
	}

	pdf.Ln(6)

	// ── Remarks ────────────────────────────────────────────────────────────
	if data.Remarks != "" {
		pdf.SetFont("Arial", "B", 10)
		pdf.CellFormat(pageW, 6, "Remarks:", "", 1, "L", false, 0, "")
		pdf.SetFont("Arial", "", 10)
		pdf.MultiCell(pageW, 6, data.Remarks, "", "L", false)
		pdf.Ln(4)
	}

	// ── Notes ──────────────────────────────────────────────────────────────
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(pageW, 6, "Note -", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	notes := []string{
		"- No Change in Design/Colour of design will be acceptable for repeat orders.",
		"- No variation will be acceptable for strength of carton/foil.",
		"- Any change in MRP/Rate must be informed before processing the order.",
	}
	for _, n := range notes {
		pdf.MultiCell(pageW, 5.5, n, "", "L", false)
	}

	pdf.Ln(8)

	// ── Sign-off ───────────────────────────────────────────────────────────
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(pageW, 6, "Thanks & Regards,", "", 1, "L", false, 0, "")
	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(pageW, 6, "MOULINS PHARMACEUTICALS PVT LTD", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(pageW, 5, "Plot No 363, Ist Floor, Industrial Area, Phase - II", "", 1, "L", false, 0, "")
	pdf.CellFormat(pageW, 5, "Panchkula, Haryana - 134113", "", 1, "L", false, 0, "")
	pdf.CellFormat(pageW, 5, "Contact- 9815535304, 9878020363", "", 1, "L", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type OrderPDFItem struct {
	ProductName string
	ProductCode string // warehouse inventory code, blank if none assigned
	Quantity    int
	Batch       string
	Expiry      string
}

type OrderPDFData struct {
	OrderNumber   string
	Date          string
	Status        string
	CustomerName  string
	CustomerPhone string
	TransportMode string
	TransportName string
	Notes         string
	Items         []OrderPDFItem
	PrintedBy     string
	PrintedAt     string
}

// gofpdf's built-in fonts are cp1252, so a UTF-8 character outside it prints
// as mojibake -- an em-dash in a product name comes out "â€". These are the
// characters that realistically turn up in pasted product names and notes;
// each maps to something readable rather than being dropped.
var pdfTextReplacer = strings.NewReplacer(
	"–", "-", // en dash
	"—", "-", // em dash
	"‒", "-", // figure dash
	"−", "-", // minus sign
	"‘", "'", "’", "'", // curly single quotes
	"“", `"`, "”", `"`, // curly double quotes
	"…", "...", // ellipsis
	"₹", "Rs.", // rupee sign, absent from cp1252
	" ", " ", // non-breaking space
	"•", "-", // bullet
	"×", "x", // multiplication sign
)

// sanitizeOrderPDFData cleans every user-supplied string once, rather than at
// each of the dozen draw calls, so a newly added field cannot quietly skip it.
// It matters that this happens before line measurement too: SplitLines has to
// measure the same string that eventually gets drawn.
func sanitizeOrderPDFData(tr func(string) string, d OrderPDFData) OrderPDFData {
	f := func(s string) string { return tr(pdfTextReplacer.Replace(s)) }
	d.OrderNumber = f(d.OrderNumber)
	d.Date = f(d.Date)
	d.Status = f(d.Status)
	d.CustomerName = f(d.CustomerName)
	d.CustomerPhone = f(d.CustomerPhone)
	d.TransportMode = f(d.TransportMode)
	d.TransportName = f(d.TransportName)
	d.Notes = f(d.Notes)
	d.PrintedBy = f(d.PrintedBy)
	d.PrintedAt = f(d.PrintedAt)
	items := make([]OrderPDFItem, len(d.Items))
	for i, it := range d.Items {
		it.ProductName = f(it.ProductName)
		it.ProductCode = f(it.ProductCode)
		it.Batch = f(it.Batch)
		it.Expiry = f(it.Expiry)
		items[i] = it
	}
	d.Items = items
	return d
}

// GenerateOrderPDF renders a printable summary of a finalized customer
// order — order/customer identity, status, the item lines (with whichever
// Marg batch/expiry is selected, if any), and notes/transport.
func GenerateOrderPDF(data OrderPDFData) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(20, 20, 20)
	pdf.AddPage()

	// Empty descriptor means cp1252, which is what the built-in fonts use.
	data = sanitizeOrderPDFData(pdf.UnicodeTranslatorFromDescriptor(""), data)

	pageW := 170.0

	pdf.SetFont("Arial", "B", 16)
	pdf.CellFormat(pageW, 10, "ORDER SUMMARY", "", 1, "C", false, 0, "")
	pdf.Ln(4)

	pdf.SetFont("Arial", "B", 11)
	pdf.CellFormat(85, 7, fmt.Sprintf("ORDER NO.- %s", data.OrderNumber), "", 0, "L", false, 0, "")
	pdf.CellFormat(85, 7, fmt.Sprintf("DATE- %s", formatDate(data.Date)), "", 1, "L", false, 0, "")
	pdf.CellFormat(85, 7, fmt.Sprintf("STATUS- %s", strings.ToUpper(data.Status)), "", 1, "L", false, 0, "")
	pdf.Ln(3)

	pdf.SetFont("Arial", "B", 11)
	pdf.CellFormat(pageW, 7, "CUSTOMER", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 11)
	pdf.CellFormat(pageW, 7, fmt.Sprintf("%s - %s", data.CustomerName, data.CustomerPhone), "", 1, "L", false, 0, "")
	pdf.Ln(5)

	// ── Items table ────────────────────────────────────────────────────────
	// Page breaks are handled manually below (auto page-break disabled): the
	// row is measured first, and if it doesn't fit in what's left of the
	// page, a new page is started and the header redrawn before drawing the
	// row — letting gofpdf's own auto-break fire mid-row here desyncs the
	// manually-tracked x/y and previously produced dozens of broken pages
	// for any order with more than a handful of items.
	pdf.SetAutoPageBreak(false, 0)
	const bottomLimit = 270.0

	// Wide enough for a full inventory code (OS-0001-TAB/D, 13 chars at
	// Arial 9) rather than the 7-char Marg code this column used to carry.
	// The width comes out of colExp, which is the remainder and had it to
	// spare, so the product name column is unaffected.
	colCode := 34.0
	colProduct := 62.0
	colQty := 16.0
	colBatch := 38.0
	colExp := pageW - colCode - colProduct - colQty - colBatch

	// Column offsets from the row's left edge, accumulated once rather than
	// re-summed at every draw call — five columns of "x+colA+colB+colC" gets
	// unreadable fast and is easy to get subtly wrong.
	xCode := 0.0
	xProduct := xCode + colCode
	xQty := xProduct + colProduct
	xBatch := xQty + colQty
	xExp := xBatch + colBatch

	drawHeader := func() {
		pdf.SetFont("Arial", "B", 9)
		x, y := pdf.GetX(), pdf.GetY()
		pdf.Rect(x+xCode, y, colCode, 8, "D")
		pdf.CellFormat(colCode, 8, "CODE", "", 0, "L", false, 0, "")
		pdf.Rect(x+xProduct, y, colProduct, 8, "D")
		pdf.CellFormat(colProduct, 8, "PRODUCT", "", 0, "L", false, 0, "")
		pdf.Rect(x+xQty, y, colQty, 8, "D")
		pdf.CellFormat(colQty, 8, "QTY", "", 0, "C", false, 0, "")
		pdf.Rect(x+xBatch, y, colBatch, 8, "D")
		pdf.CellFormat(colBatch, 8, "BATCH", "", 0, "L", false, 0, "")
		pdf.Rect(x+xExp, y, colExp, 8, "D")
		pdf.CellFormat(colExp, 8, "EXPIRY", "", 1, "L", false, 0, "")
		pdf.SetFont("Arial", "", 9)
	}

	drawHeader()
	for _, item := range data.Items {
		lines := pdf.SplitLines([]byte(item.ProductName), colProduct-4)
		rowH := float64(len(lines)) * 5
		if rowH < 8 {
			rowH = 8
		}

		if pdf.GetY()+rowH > bottomLimit {
			pdf.AddPage()
			drawHeader()
		}

		x, y := pdf.GetX(), pdf.GetY()
		pdf.Rect(x+xCode, y, colCode, rowH, "D")
		pdf.Rect(x+xProduct, y, colProduct, rowH, "D")
		pdf.Rect(x+xQty, y, colQty, rowH, "D")
		pdf.Rect(x+xBatch, y, colBatch, rowH, "D")
		pdf.Rect(x+xExp, y, colExp, rowH, "D")

		code := item.ProductCode
		if code == "" {
			code = "-"
		}
		pdf.SetXY(x+xCode+1, y+1)
		pdf.CellFormat(colCode-2, rowH-2, code, "", 0, "L", false, 0, "")
		pdf.SetXY(x+xProduct+1, y+1)
		pdf.MultiCell(colProduct-2, 5, item.ProductName, "", "L", false)
		pdf.SetXY(x+xQty+1, y+1)
		pdf.CellFormat(colQty-2, rowH-2, fmt.Sprintf("%d", item.Quantity), "", 0, "C", false, 0, "")
		pdf.SetXY(x+xBatch+1, y+1)
		batch := item.Batch
		if batch == "" {
			batch = "-"
		}
		pdf.CellFormat(colBatch-2, rowH-2, batch, "", 0, "L", false, 0, "")
		pdf.SetXY(x+xExp+1, y+1)
		exp := item.Expiry
		if exp == "" {
			exp = "-"
		}
		pdf.CellFormat(colExp-2, rowH-2, exp, "", 0, "L", false, 0, "")

		pdf.SetXY(x, y+rowH)
	}

	if pdf.GetY()+40 > bottomLimit {
		pdf.AddPage()
	}
	pdf.Ln(6)

	if data.TransportMode != "" {
		pdf.SetFont("Arial", "B", 10)
		// The label cell is sized to the label. Giving it the full page width
		// with ln=0 pushed the cursor to the right margin, so the value was
		// drawn off the edge of the page and all but its first word vanished.
		const transportLabelW = 24.0
		pdf.CellFormat(transportLabelW, 6, "Transport:", "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "", 10)
		transport := data.TransportMode
		if data.TransportName != "" {
			transport += " - " + data.TransportName
		}
		pdf.CellFormat(pageW-transportLabelW, 6, transport, "", 1, "L", false, 0, "")
		pdf.Ln(2)
	}

	if data.Notes != "" {
		pdf.SetFont("Arial", "B", 10)
		pdf.CellFormat(pageW, 6, "Notes:", "", 1, "L", false, 0, "")
		pdf.SetFont("Arial", "", 10)
		pdf.MultiCell(pageW, 6, data.Notes, "", "L", false)
		pdf.Ln(4)
	}

	pdf.Ln(6)
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(pageW, 6, "MOULINS PHARMACEUTICALS PVT LTD", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(pageW, 5, "Plot No 363, Ist Floor, Industrial Area, Phase - II", "", 1, "L", false, 0, "")
	pdf.CellFormat(pageW, 5, "Panchkula, Haryana - 134113", "", 1, "L", false, 0, "")
	pdf.CellFormat(pageW, 5, "Contact- 9815535304, 9878020363", "", 1, "L", false, 0, "")

	// ── Signature block ────────────────────────────────────────────────────
	// Pinned near the bottom of the page (not just after the content flow)
	// so it lands in the same place regardless of how many item rows came
	// before it, unless the content itself has already run past that point
	// (a very long item list), in which case it simply follows the content.
	sigY := 235.0
	if pdf.GetY() < sigY {
		pdf.SetY(sigY)
	} else {
		pdf.Ln(10)
	}
	colW := pageW / 2
	pdf.SetFont("Arial", "", 10)
	x, y := pdf.GetX(), pdf.GetY()
	pdf.Line(x, y+14, x+colW-10, y+14)
	pdf.Line(x+colW+10, y+14, x+pageW, y+14)
	pdf.SetXY(x, y+15)
	pdf.CellFormat(colW-10, 5, "Prepared By", "", 0, "L", false, 0, "")
	pdf.SetXY(x+colW+10, y+15)
	pdf.CellFormat(colW-10, 5, "Receiver's Signature", "", 1, "L", false, 0, "")

	// ── Printed-by footer ──────────────────────────────────────────────────
	if data.PrintedBy != "" {
		pdf.SetXY(x, y+22)
		pdf.SetFont("Arial", "I", 8)
		pdf.SetTextColor(120, 120, 120)
		pdf.CellFormat(pageW, 4, fmt.Sprintf("Printed by %s on %s", data.PrintedBy, data.PrintedAt), "", 1, "L", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
