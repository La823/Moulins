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
	Items            []POPDFItem
}

type POPDFItem struct {
	SrNo        int
	ProductName string
	Packing     string
	Quantity    int
	MRP         float64
	Rate        float64
}

func GeneratePOPDF(data POPDFData) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.CellFormat(180, 10, "PURCHASE ORDER", "", 1, "C", false, 0, "")
	pdf.Ln(5)

	// Company name
	pdf.SetFont("Arial", "B", 12)
	pdf.CellFormat(180, 8, data.CompanyName, "", 1, "C", false, 0, "")
	pdf.Ln(8)

	// PO details
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(90, 7, fmt.Sprintf("PO Number: %s", data.PONumber), "", 0, "L", false, 0, "")
	pdf.CellFormat(90, 7, fmt.Sprintf("Date: %s", data.Date), "", 1, "R", false, 0, "")
	pdf.Ln(2)

	// Manufacturer
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(40, 7, "Manufacturer:", "", 0, "L", false, 0, "")
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(140, 7, data.ManufacturerName, "", 1, "L", false, 0, "")
	pdf.Ln(8)

	// Table header
	colWidths := []float64{12, 58, 25, 20, 25, 25, 25}
	headers := []string{"Sr.", "Product Name", "Packing", "Qty", "MRP", "Rate", "Amount"}

	pdf.SetFont("Arial", "B", 9)
	pdf.SetFillColor(240, 240, 240)
	for i, h := range headers {
		pdf.CellFormat(colWidths[i], 8, h, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	// Table rows
	pdf.SetFont("Arial", "", 9)
	var totalAmount float64
	for _, item := range data.Items {
		amount := float64(item.Quantity) * item.Rate
		totalAmount += amount

		pdf.CellFormat(colWidths[0], 7, fmt.Sprintf("%d", item.SrNo), "1", 0, "C", false, 0, "")
		// Handle long product names
		pdf.CellFormat(colWidths[1], 7, truncate(item.ProductName, 35), "1", 0, "L", false, 0, "")
		pdf.CellFormat(colWidths[2], 7, item.Packing, "1", 0, "C", false, 0, "")
		pdf.CellFormat(colWidths[3], 7, fmt.Sprintf("%d", item.Quantity), "1", 0, "C", false, 0, "")
		pdf.CellFormat(colWidths[4], 7, fmt.Sprintf("%.2f", item.MRP), "1", 0, "R", false, 0, "")
		pdf.CellFormat(colWidths[5], 7, fmt.Sprintf("%.2f", item.Rate), "1", 0, "R", false, 0, "")
		pdf.CellFormat(colWidths[6], 7, fmt.Sprintf("%.2f", amount), "1", 0, "R", false, 0, "")
		pdf.Ln(-1)
	}

	// Total row
	totalColSpan := colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5]
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(totalColSpan, 8, "TOTAL", "1", 0, "R", false, 0, "")
	pdf.CellFormat(colWidths[6], 8, fmt.Sprintf("%.2f", totalAmount), "1", 0, "R", false, 0, "")
	pdf.Ln(-1)

	// Footer
	pdf.Ln(15)
	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(90, 7, "Authorized Signature", "T", 0, "C", false, 0, "")
	pdf.CellFormat(90, 7, "Received By", "T", 0, "C", false, 0, "")

	var buf bytes.Buffer
	err := pdf.Output(&buf)
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-2] + ".."
}
