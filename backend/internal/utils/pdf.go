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
