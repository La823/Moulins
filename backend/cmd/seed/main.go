package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
	"github.com/xuri/excelize/v2"
)

// Column indices (1-based, matching Excel columns)
const (
	colProductName   = 3  // C: Product Name
	colBrandName     = 4  // D: Brand Name
	colHsnCode       = 10 // J: HSN Code
	colGstRate       = 11 // K: GST Rate
	colMrp           = 12 // L: MRP
	colSellingPrice  = 13 // M: Tentative SP (selling price)
	colProductForm   = 17 // Q: Product Form
	colConsumeType   = 18 // R: Consume Type
	colPackSize      = 21 // U: Pack size
	colPackForm      = 23 // W: Pack Form
	colKeyIngredient = 25 // Y: Key Ingredient
	colStrength      = 26 // Z: Strength
	colProductWeight = 30 // AD: Product Weight
	colUses          = 35 // AI: Uses (category)
	colDescription   = 44 // AR: Product Information
	colKeyBenefits   = 46 // AT: Key Benefits/Uses
	colDirForUse     = 47 // AU: Direction for use/Dosage
	colSafetyInfo    = 48 // AV: Safety Information
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("DB_URL is not set")
	}

	excelPath := "1mg SHEET.xlsx"
	if len(os.Args) > 1 {
		excelPath = os.Args[1]
	}

	// Connect to DB for migration
	migDB, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	// Run migration 006
	log.Println("Running migration 006...")
	migrationSQL, err := os.ReadFile("internal/database/migrations/006_add_product_detail_columns.sql")
	if err != nil {
		log.Fatalf("could not read migration file: %v", err)
	}
	if _, err := migDB.Exec(context.Background(), string(migrationSQL)); err != nil {
		log.Printf("migration warning (may already be applied): %v", err)
	}
	log.Println("Migration done.")
	migDB.Close()

	// Reconnect with fresh statement cache for inserts
	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("failed to reconnect to database: %v", err)
	}
	defer db.Close()

	// Open Excel
	f, err := excelize.OpenFile(excelPath)
	if err != nil {
		log.Fatalf("could not open Excel file: %v", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	rows, err := f.GetRows(sheetName)
	if err != nil {
		log.Fatalf("could not read rows: %v", err)
	}

	log.Printf("Found %d rows (including headers)", len(rows))

	// Data rows start at index 3 (row 4 in Excel, after 2 header rows + 1 description row)
	inserted := 0
	skipped := 0

	for i := 3; i < len(rows); i++ {
		row := rows[i]

		name := cellStr(row, colProductName)
		if name == "" {
			skipped++
			continue
		}

		price := cellFloat(row, colSellingPrice)
		if price <= 0 {
			// Fall back to MRP if no selling price
			price = cellFloat(row, colMrp)
		}
		if price <= 0 {
			log.Printf("Row %d: skipping %q — no valid price", i+1, name)
			skipped++
			continue
		}

		brandName := cellStr(row, colBrandName)
		hsnCode := cellStr(row, colHsnCode)
		gstRate := cellFloat(row, colGstRate)
		mrp := cellFloat(row, colMrp)
		productForm := cellStr(row, colProductForm)
		consumeType := cellStr(row, colConsumeType)
		packSize := cellStr(row, colPackSize)
		packForm := cellStr(row, colPackForm)
		keyIngredient := cellStr(row, colKeyIngredient)
		strength := cellStr(row, colStrength)
		productWeight := cellStr(row, colProductWeight)
		uses := cellStr(row, colUses)
		description := cellStr(row, colDescription)
		keyBenefits := cellStr(row, colKeyBenefits)
		dirForUse := cellStr(row, colDirForUse)
		safetyInfo := cellStr(row, colSafetyInfo)

		// Build categories from the "Uses" column
		var categories []string
		if uses != "" {
			categories = []string{strings.TrimSpace(uses)}
		} else {
			categories = []string{}
		}

		query := `
			INSERT INTO products (
				name, description, price, categories, stock,
				brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
				pack_size, pack_form, key_ingredients, strength, product_weight,
				key_benefits, direction_for_use, safety_information
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8, $9, $10, $11,
				$12, $13, $14, $15, $16,
				$17, $18, $19
			)
		`

		_, err := db.Exec(context.Background(), query,
			name, description, price, categories, 0,
			nilIfEmpty(brandName), nilIfEmpty(hsnCode), nilIfZero(gstRate), nilIfZero(mrp),
			nilIfEmpty(productForm), nilIfEmpty(consumeType),
			nilIfEmpty(packSize), nilIfEmpty(packForm), nilIfEmpty(keyIngredient),
			nilIfEmpty(strength), nilIfEmpty(productWeight),
			nilIfEmpty(keyBenefits), nilIfEmpty(dirForUse), nilIfEmpty(safetyInfo),
		)
		if err != nil {
			log.Printf("Row %d: error inserting %q: %v", i+1, name, err)
			skipped++
			continue
		}
		inserted++
	}

	fmt.Printf("\nDone! Inserted: %d, Skipped: %d\n", inserted, skipped)
}

// cellStr safely returns the string at the given 1-based column index.
func cellStr(row []string, col int) string {
	idx := col - 1
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

// cellFloat parses a float from the given 1-based column index.
func cellFloat(row []string, col int) float64 {
	s := cellStr(row, col)
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func nilIfZero(f float64) *float64 {
	if f == 0 {
		return nil
	}
	return &f
}
