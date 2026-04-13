package utils

import (
	"bytes"
	"fmt"

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

func GeneratePOPDF(data POPDFData) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.CellFormat(180, 10, "PURCHASE ORDER", "", 1, "C", false, 0, "")
	pdf.Ln(5)

	// PO meta
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(90, 7, fmt.Sprintf("PO Number: %s", data.PONumber), "", 0, "L", false, 0, "")
	pdf.CellFormat(90, 7, fmt.Sprintf("Date: %s", data.Date), "", 1, "R", false, 0, "")
	pdf.Ln(8)

	// Two-column table layout matching the reference doc
	rows := []struct {
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
		{"MANUFACTURER", data.ManufacturerName},
		{"CATEGORY", data.Category},
		{"TYPE", data.Type},
	}

	const labelW = 60.0
	const valueW = 120.0
	pdf.SetFont("Arial", "", 11)

	for _, row := range rows {
		// Calculate row height based on value
		lines := pdf.SplitLines([]byte(row.value), valueW-4)
		rowH := float64(len(lines)) * 7
		if rowH < 9 {
			rowH = 9
		}

		x, y := pdf.GetX(), pdf.GetY()
		pdf.Rect(x, y, labelW, rowH, "D")
		pdf.Rect(x+labelW, y, valueW, rowH, "D")

		pdf.SetFont("Arial", "B", 11)
		pdf.SetXY(x+2, y+2)
		pdf.CellFormat(labelW-4, rowH-4, row.label, "", 0, "L", false, 0, "")

		pdf.SetFont("Arial", "", 11)
		pdf.SetXY(x+labelW+2, y+2)
		pdf.MultiCell(valueW-4, 6, row.value, "", "L", false)

		pdf.SetXY(x, y+rowH)
	}

	if data.Remarks != "" {
		pdf.Ln(5)
		pdf.SetFont("Arial", "B", 10)
		pdf.CellFormat(40, 7, "Remarks:", "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "", 10)
		pdf.MultiCell(140, 6, data.Remarks, "", "L", false)
	}

	// Footer
	pdf.Ln(15)
	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(90, 7, "Authorized Signature", "T", 0, "C", false, 0, "")
	pdf.CellFormat(90, 7, "Received By", "T", 0, "C", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
