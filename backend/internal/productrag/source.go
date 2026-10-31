// Package productrag is the public product assistant: anyone can ask about
// a product and get a full, well-written overview of it.
//
// It is "product-anchored" retrieval. A question is nearly always about one
// product, so instead of handing the model the five closest text fragments
// from anywhere, it first works out WHICH product (or few products) the
// question means, then gives the model EVERYTHING about them — the product
// record read fresh from the database, plus the best-matching passages of
// that product's PDFs.
//
//	index.go   keeps product_rag_chunks in step with the catalogue
//	search.go  stage 1: which product? (name, keyword and meaning search)
//	answer.go  stage 2: load everything about it and have Gemini write it up
//
// Only active, non-exclusive products are ever indexed or answered about,
// and only the fields in productSource reach the model — never partner
// price, stock, MOQ or Marg/HSN codes.
package productrag

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

// productSource is everything about a product the assistant may say.
type productSource struct {
	ID              string
	Name            string
	Brand           string
	Categories      []string
	Tags            []string
	Form            string
	ConsumeType     string
	Strength        string
	PackSize        string
	PackForm        string
	FoodType        string
	Mrp             *float64
	MrpUnit         string
	Description     string
	KeyIngredients  string
	KeyBenefits     string
	DirectionForUse string
	SafetyInfo      string
	Edetailing      string
	ThumbURL        string
}

// publicFilter is the one definition of a product the public may hear about.
const publicFilter = `p.is_active AND NOT p.exclusive`

// loadSources reads public products with their categories and tags in one
// round trip — ids nil means every public product. A requested id that is
// missing from the result is no longer public (or no longer exists).
func loadSources(ctx context.Context, db *pgxpool.Pool, ids []string) ([]productSource, error) {
	query := `
		SELECT p.id::text, p.name, COALESCE(p.brand_name, ''),
			COALESCE((SELECT array_agg(c.name ORDER BY c.name) FROM product_categories pc
				JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id), '{}'),
			COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM product_tags pt
				JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = p.id), '{}'),
			COALESCE(p.product_form, ''), COALESCE(p.consume_type, ''), COALESCE(p.strength, ''),
			COALESCE(p.pack_size, ''), COALESCE(p.pack_form, ''), COALESCE(p.food_type, ''),
			p.mrp, COALESCE(p.mrp_unit, ''), COALESCE(p.description, ''),
			COALESCE(p.key_ingredients, ''), COALESCE(p.key_benefits, ''),
			COALESCE(p.direction_for_use, ''), COALESCE(p.safety_information, ''),
			COALESCE(p.edetailing, ''), COALESCE(p.thumb_key, '')
		FROM products p
		WHERE ` + publicFilter + ` AND ($1::text[] IS NULL OR p.id::text = ANY($1::text[]))
		ORDER BY p.name`
	var idArg any
	if ids != nil {
		idArg = ids
	}
	rows, err := db.Query(ctx, query, idArg)
	if err != nil {
		return nil, fmt.Errorf("productrag: load products: %w", err)
	}
	defer rows.Close()

	var out []productSource
	for rows.Next() {
		var s productSource
		var thumbKey string
		if err := rows.Scan(&s.ID, &s.Name, &s.Brand, &s.Categories, &s.Tags,
			&s.Form, &s.ConsumeType, &s.Strength, &s.PackSize, &s.PackForm, &s.FoodType,
			&s.Mrp, &s.MrpUnit, &s.Description, &s.KeyIngredients, &s.KeyBenefits,
			&s.DirectionForUse, &s.SafetyInfo, &s.Edetailing, &thumbKey); err != nil {
			return nil, fmt.Errorf("productrag: scan product: %w", err)
		}
		if thumbKey != "" {
			s.ThumbURL = utils.GetPublicURL(thumbKey)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// header is the line every chunk of a product starts with, so a passage
// found on its own still says which product it is about.
func (s productSource) header() string {
	parts := []string{"Product: " + s.Name}
	if s.Brand != "" {
		parts = append(parts, "Brand: "+s.Brand)
	}
	if len(s.Categories) > 0 {
		parts = append(parts, "Category: "+strings.Join(s.Categories, ", "))
	}
	return strings.Join(parts, " · ")
}

// profile is the product's full description as labelled lines, as the
// model is shown it when answering.
func (s productSource) profile() string { return s.describe(true) }

// searchText is the profile without its price — what gets embedded. A
// price says nothing about what a product is for, so it would only add
// noise to meaning search, and leaving it out means a price change does
// not send the product back to Voyage.
func (s productSource) searchText() string { return s.describe(false) }

func (s productSource) describe(withPrice bool) string {
	var b strings.Builder
	b.WriteString(s.header())
	line := func(label, v string) {
		if v = strings.TrimSpace(v); v != "" {
			fmt.Fprintf(&b, "\n%s: %s", label, v)
		}
	}
	line("Tags", strings.Join(s.Tags, ", "))
	line("Form", s.Form)
	line("How it is taken", s.ConsumeType)
	line("Strength", s.Strength)
	line("Pack size", s.PackSize)
	line("Pack type", s.PackForm)
	line("Food type", s.FoodType)
	if withPrice && s.Mrp != nil {
		// "Rs." rather than "₹": the smaller model sometimes garbles the sign
		mrp := fmt.Sprintf("Rs. %.2f", *s.Mrp)
		if unit := strings.TrimSpace(s.MrpUnit); unit != "" {
			if !strings.HasPrefix(strings.ToLower(unit), "per ") {
				unit = "per " + unit
			}
			mrp += " " + strings.ToLower(unit)
		}
		line("MRP", mrp)
	}
	line("Description", s.Description)
	line("Key ingredients", s.KeyIngredients)
	line("Key benefits", s.KeyBenefits)
	line("Directions for use", s.DirectionForUse)
	line("Safety information", s.SafetyInfo)
	line("Product detailing", s.Edetailing)
	return b.String()
}
