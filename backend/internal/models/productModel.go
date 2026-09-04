package models

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Product struct {
	ID              uuid.UUID         `json:"id"`
	ProductID       int               `json:"product_id"`
	Name            string            `json:"name"`
	Description     string            `json:"description,omitempty"`
	Price           float64           `json:"price"`
	Categories      []string          `json:"categories"`
	Tags            []string          `json:"tags"`
	Stock           int               `json:"stock"`
	Moq             int               `json:"moq"`
	IsActive        bool              `json:"is_active"`
	BrandName       *string           `json:"brand_name,omitempty"`
	HsnCode         *string           `json:"hsn_code,omitempty"`
	GstRate         *float64          `json:"gst_rate,omitempty"`
	Mrp             *float64          `json:"mrp,omitempty"`
	MrpUnit         *string           `json:"mrp_unit,omitempty"`
	ProductForm     *string           `json:"product_form,omitempty"`
	ConsumeType     *string           `json:"consume_type,omitempty"`
	PackSize        *string           `json:"pack_size,omitempty"`
	PackForm        *string           `json:"pack_form,omitempty"`
	KeyIngredients  *string           `json:"key_ingredients,omitempty"`
	Strength        *string           `json:"strength,omitempty"`
	ProductWeight   *string           `json:"product_weight,omitempty"`
	LengthCm        *float64          `json:"length_cm,omitempty"`
	WidthCm         *float64          `json:"width_cm,omitempty"`
	HeightCm        *float64          `json:"height_cm,omitempty"`
	KeyBenefits     *string           `json:"key_benefits,omitempty"`
	DirectionForUse *string           `json:"direction_for_use,omitempty"`
	SafetyInfo      *string           `json:"safety_information,omitempty"`
	Edetailing      *string           `json:"edetailing,omitempty"`
	Images          []ProductImage    `json:"images"`
	Documents       []ProductDocument `json:"documents"`
	AudioKey        *string           `json:"audio_key,omitempty"`
	AudioURL        string            `json:"audio_url,omitempty"`
	MargCode        *string           `json:"marg_code,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

type ProductImage struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	ImageKey  string    `json:"image_key"`
	ImageURL  string    `json:"image_url,omitempty"`
	SortOrder int       `json:"sort_order"`
	VisualAid bool      `json:"visual_aid"`
	Hidden    bool      `json:"hidden"`
	CreatedAt time.Time `json:"created_at"`
}

type ProductDocument struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	Name      string    `json:"name"`
	FileKey   string    `json:"file_key"`
	FileURL   string    `json:"file_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateProductRequest struct {
	ProductID       *int     `json:"product_id"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Price           float64  `json:"price"`
	Categories      []string `json:"categories"`
	Tags            []string `json:"tags"`
	Stock           int      `json:"stock"`
	Moq             *int     `json:"moq"`
	BrandName       *string  `json:"brand_name"`
	HsnCode         *string  `json:"hsn_code"`
	GstRate         *float64 `json:"gst_rate"`
	Mrp             *float64 `json:"mrp"`
	MrpUnit         *string  `json:"mrp_unit"`
	ProductForm     *string  `json:"product_form"`
	ConsumeType     *string  `json:"consume_type"`
	PackSize        *string  `json:"pack_size"`
	PackForm        *string  `json:"pack_form"`
	KeyIngredients  *string  `json:"key_ingredients"`
	Strength        *string  `json:"strength"`
	ProductWeight   *string  `json:"product_weight"`
	LengthCm        *float64 `json:"length_cm"`
	WidthCm         *float64 `json:"width_cm"`
	HeightCm        *float64 `json:"height_cm"`
	KeyBenefits     *string  `json:"key_benefits"`
	DirectionForUse *string  `json:"direction_for_use"`
	SafetyInfo      *string  `json:"safety_information"`
	Edetailing      *string  `json:"edetailing"`
	MargCode        *string  `json:"marg_code"`
}

type UpdateProductRequest struct {
	ProductID       *int      `json:"product_id"`
	Name            *string   `json:"name"`
	Description     *string   `json:"description"`
	Price           *float64  `json:"price"`
	Categories      *[]string `json:"categories"`
	Tags            *[]string `json:"tags"`
	Stock           *int      `json:"stock"`
	Moq             *int      `json:"moq"`
	IsActive        *bool     `json:"is_active"`
	BrandName       *string   `json:"brand_name"`
	HsnCode         *string   `json:"hsn_code"`
	GstRate         *float64  `json:"gst_rate"`
	Mrp             *float64  `json:"mrp"`
	MrpUnit         *string   `json:"mrp_unit"`
	ProductForm     *string   `json:"product_form"`
	ConsumeType     *string   `json:"consume_type"`
	PackSize        *string   `json:"pack_size"`
	PackForm        *string   `json:"pack_form"`
	KeyIngredients  *string   `json:"key_ingredients"`
	Strength        *string   `json:"strength"`
	ProductWeight   *string   `json:"product_weight"`
	LengthCm        *float64  `json:"length_cm"`
	WidthCm         *float64  `json:"width_cm"`
	HeightCm        *float64  `json:"height_cm"`
	KeyBenefits     *string   `json:"key_benefits"`
	DirectionForUse *string   `json:"direction_for_use"`
	SafetyInfo      *string   `json:"safety_information"`
	Edetailing      *string   `json:"edetailing"`
	MargCode        *string   `json:"marg_code"`
}

// --- Product CRUD ---

func CreateProduct(ctx context.Context, db *pgxpool.Pool, req CreateProductRequest) (uuid.UUID, error) {
	var id uuid.UUID
	var err error

	moq := 1
	if req.Moq != nil && *req.Moq > 0 {
		moq = *req.Moq
	}

	// product_id is a SERIAL with a default — only override it when the
	// admin explicitly supplied one (their "actual product id"); otherwise
	// leave the column out of the INSERT entirely so the sequence default applies.
	if req.ProductID != nil {
		query := `
			INSERT INTO products (product_id, name, description, price, stock, moq,
				brand_name, hsn_code, gst_rate, mrp, mrp_unit, product_form, consume_type,
				pack_size, pack_form, key_ingredients, strength, product_weight,
				length_cm, width_cm, height_cm,
				key_benefits, direction_for_use, safety_information, edetailing, marg_code)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
			RETURNING id;
		`
		err = db.QueryRow(ctx, query,
			*req.ProductID, req.Name, req.Description, req.Price, req.Stock, moq,
			req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.MrpUnit, req.ProductForm,
			req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
			req.Strength, req.ProductWeight, req.LengthCm, req.WidthCm, req.HeightCm,
			req.KeyBenefits, req.DirectionForUse, req.SafetyInfo, req.Edetailing, req.MargCode,
		).Scan(&id)
	} else {
		query := `
			INSERT INTO products (name, description, price, stock, moq,
				brand_name, hsn_code, gst_rate, mrp, mrp_unit, product_form, consume_type,
				pack_size, pack_form, key_ingredients, strength, product_weight,
				length_cm, width_cm, height_cm,
				key_benefits, direction_for_use, safety_information, edetailing, marg_code)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
			RETURNING id;
		`
		err = db.QueryRow(ctx, query,
			req.Name, req.Description, req.Price, req.Stock, moq,
			req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.MrpUnit, req.ProductForm,
			req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
			req.Strength, req.ProductWeight, req.LengthCm, req.WidthCm, req.HeightCm,
			req.KeyBenefits, req.DirectionForUse, req.SafetyInfo, req.Edetailing, req.MargCode,
		).Scan(&id)
	}
	if err != nil {
		return uuid.Nil, err
	}

	if err := setProductCategories(ctx, db, id, req.Categories); err != nil {
		return uuid.Nil, err
	}
	if err := setProductTags(ctx, db, id, req.Tags); err != nil {
		return uuid.Nil, err
	}

	return id, nil
}

// setProductCategories resolves category names against the categories table
// and replaces a product's category links. Unknown names are rejected so a
// product can never reference a category that doesn't (or no longer) exists.
func setProductCategories(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, names []string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_categories WHERE product_id = $1`, productID); err != nil {
		return err
	}

	if len(names) > 0 {
		rows, err := tx.Query(ctx, `SELECT id, name FROM categories WHERE name = ANY($1)`, names)
		if err != nil {
			return err
		}
		resolved := make(map[string]uuid.UUID, len(names))
		for rows.Next() {
			var id uuid.UUID
			var name string
			if err := rows.Scan(&id, &name); err != nil {
				rows.Close()
				return err
			}
			resolved[name] = id
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		var unknown []string
		for _, n := range names {
			if _, ok := resolved[n]; !ok {
				unknown = append(unknown, n)
			}
		}
		if len(unknown) > 0 {
			return fmt.Errorf("unknown categories: %s", strings.Join(unknown, ", "))
		}

		for _, id := range resolved {
			if _, err := tx.Exec(ctx,
				`INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)`,
				productID, id,
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func GetProductCategories(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) ([]string, error) {
	rows, err := db.Query(ctx, `
		SELECT c.name FROM product_categories pc
		JOIN categories c ON c.id = pc.category_id
		WHERE pc.product_id = $1
		ORDER BY c.name
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func GetProductCategoriesBatch(ctx context.Context, db *pgxpool.Pool, productIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	if len(productIDs) == 0 {
		return make(map[uuid.UUID][]string), nil
	}
	ph, args := buildPlaceholders(productIDs)
	query := `
		SELECT pc.product_id, c.name FROM product_categories pc
		JOIN categories c ON c.id = pc.category_id
		WHERE pc.product_id IN (` + ph + `)
		ORDER BY c.name
	`
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]string)
	for rows.Next() {
		var productID uuid.UUID
		var name string
		if err := rows.Scan(&productID, &name); err != nil {
			return nil, err
		}
		result[productID] = append(result[productID], name)
	}
	return result, rows.Err()
}

// setProductTags resolves tag names against the tags table and replaces a
// product's tag links — same shape as setProductCategories, and just like
// categories, a product can carry a single tag or several at once.
func setProductTags(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, names []string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_tags WHERE product_id = $1`, productID); err != nil {
		return err
	}

	if len(names) > 0 {
		rows, err := tx.Query(ctx, `SELECT id, name FROM tags WHERE name = ANY($1)`, names)
		if err != nil {
			return err
		}
		resolved := make(map[string]uuid.UUID, len(names))
		for rows.Next() {
			var id uuid.UUID
			var name string
			if err := rows.Scan(&id, &name); err != nil {
				rows.Close()
				return err
			}
			resolved[name] = id
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		var unknown []string
		for _, n := range names {
			if _, ok := resolved[n]; !ok {
				unknown = append(unknown, n)
			}
		}
		if len(unknown) > 0 {
			return fmt.Errorf("unknown tags: %s", strings.Join(unknown, ", "))
		}

		for _, id := range resolved {
			if _, err := tx.Exec(ctx,
				`INSERT INTO product_tags (product_id, tag_id) VALUES ($1, $2)`,
				productID, id,
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func GetProductTags(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) ([]string, error) {
	rows, err := db.Query(ctx, `
		SELECT t.name FROM product_tags pt
		JOIN tags t ON t.id = pt.tag_id
		WHERE pt.product_id = $1
		ORDER BY t.name
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func GetProductTagsBatch(ctx context.Context, db *pgxpool.Pool, productIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	if len(productIDs) == 0 {
		return make(map[uuid.UUID][]string), nil
	}
	ph, args := buildPlaceholders(productIDs)
	query := `
		SELECT pt.product_id, t.name FROM product_tags pt
		JOIN tags t ON t.id = pt.tag_id
		WHERE pt.product_id IN (` + ph + `)
		ORDER BY t.name
	`
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]string)
	for rows.Next() {
		var productID uuid.UUID
		var name string
		if err := rows.Scan(&productID, &name); err != nil {
			return nil, err
		}
		result[productID] = append(result[productID], name)
	}
	return result, rows.Err()
}

// GetDistinctProductForms returns one canonical label per product_form in
// use, across active products — powers the "Type" filter on the product
// listing. Raw data has case/whitespace variants of the same form (e.g.
// "Capsule", "Capsules ", "capsule") which are collapsed into a single
// entry here; GetAllProducts' form filter does the matching case- and
// whitespace-insensitively so selecting the canonical label still catches
// every variant in the actual data.
func GetDistinctProductForms(ctx context.Context, db *pgxpool.Pool) ([]string, error) {
	rows, err := db.Query(ctx,
		`SELECT DISTINCT product_form FROM products
		 WHERE is_active = TRUE AND product_form IS NOT NULL AND TRIM(product_form) != ''`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// key (lowercased, trimmed) -> chosen display label for that group.
	seen := map[string]string{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		label := titleCase(trimmed)
		// Prefer the shortest label for a group (e.g. "Capsule" over
		// "Capsules") as a simple, deterministic tie-breaker.
		if existing, ok := seen[key]; !ok || len(label) < len(existing) {
			seen[key] = label
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	forms := make([]string, 0, len(seen))
	for _, label := range seen {
		forms = append(forms, label)
	}
	sort.Strings(forms)
	return forms, nil
}

func titleCase(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		r := []rune(w)
		if len(r) > 0 {
			r[0] = unicode.ToUpper(r[0])
			for j := 1; j < len(r); j++ {
				r[j] = unicode.ToLower(r[j])
			}
			words[i] = string(r)
		}
	}
	return strings.Join(words, " ")
}

// buildProductConditions builds the shared WHERE-clause pieces for
// GetAllProducts. fuzzy swaps the search condition from a literal ILIKE
// match to a pg_trgm similarity match (used as a fallback when the literal
// search finds nothing, e.g. a misspelled salt/composition name).
func buildProductConditions(activeOnly bool, search, category, form, tag string, nameOnly, saltOnly, fuzzy bool) ([]string, []any, int) {
	conditions := []string{}
	args := []any{}
	argIdx := 1

	if activeOnly {
		conditions = append(conditions, "is_active = TRUE")
	}
	if search != "" {
		if fuzzy {
			switch {
			case saltOnly:
				conditions = append(conditions, fmt.Sprintf("$%d <%% key_ingredients", argIdx))
			case nameOnly:
				conditions = append(conditions, fmt.Sprintf("$%d <%% name", argIdx))
			default:
				conditions = append(conditions, fmt.Sprintf("($%d <%% name OR $%d <%% key_ingredients)", argIdx, argIdx))
			}
			args = append(args, search)
		} else {
			switch {
			case saltOnly:
				conditions = append(conditions, fmt.Sprintf("key_ingredients ILIKE $%d", argIdx))
			case nameOnly:
				conditions = append(conditions, fmt.Sprintf("name ILIKE $%d", argIdx))
			default:
				conditions = append(conditions, fmt.Sprintf("(name ILIKE $%d OR key_ingredients ILIKE $%d)", argIdx, argIdx))
			}
			args = append(args, "%"+search+"%")
		}
		argIdx++
	}
	if category != "" {
		conditions = append(conditions, fmt.Sprintf(
			`EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = products.id AND c.name = $%d)`,
			argIdx))
		args = append(args, category)
		argIdx++
	}
	if form != "" {
		conditions = append(conditions, fmt.Sprintf("LOWER(TRIM(product_form)) = LOWER(TRIM($%d))", argIdx))
		args = append(args, form)
		argIdx++
	}
	if tag != "" {
		conditions = append(conditions, fmt.Sprintf(
			`EXISTS (SELECT 1 FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = products.id AND t.name = $%d)`,
			argIdx))
		args = append(args, tag)
		argIdx++
	}
	return conditions, args, argIdx
}

func productWhereClause(conditions []string) string {
	if len(conditions) == 0 {
		return ""
	}
	where := " WHERE " + conditions[0]
	for _, c := range conditions[1:] {
		where += " AND " + c
	}
	return where
}

func queryProducts(ctx context.Context, db *pgxpool.Pool, conditions []string, args []any, argIdx, limit, offset int, fuzzy bool, search string) ([]Product, int, error) {
	where := productWhereClause(conditions)

	var total int
	countQuery := "SELECT COUNT(*) FROM products" + where
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	orderBy := " ORDER BY name ASC"
	if fuzzy && search != "" {
		orderBy = fmt.Sprintf(" ORDER BY GREATEST(word_similarity($%d, name), word_similarity($%d, key_ingredients)) DESC", argIdx, argIdx)
		// word_similarity (not similarity) matches a short search term against
		// the best-matching substring of a longer field — plain similarity()
		// dilutes short terms against e.g. "LAXPOSE SYP 100 ML" and misses
		// otherwise-good typo matches. Needs its own copy of the search term
		// as a trailing arg, distinct from the positional args already
		// consumed by the WHERE clause.
	}

	baseQuery := `
		SELECT id, product_id, name, description, price, stock, moq, is_active,
			brand_name, hsn_code, gst_rate, mrp, mrp_unit, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			length_cm, width_cm, height_cm,
			key_benefits, direction_for_use, safety_information, edetailing, audio_key,
			created_at, updated_at
		FROM products
	` + where + orderBy

	queryArgs := args
	if fuzzy && search != "" {
		queryArgs = append(append([]any{}, args...), search)
		argIdx++
	}

	query := baseQuery
	if limit != 0 {
		// Concatenate rather than re-running the whole query through
		// Sprintf — baseQuery/where can contain literal "%" (the pg_trgm
		// fuzzy-match operator), which Sprintf would otherwise reinterpret
		// as a format verb.
		query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
		queryArgs = append(queryArgs, limit, offset)
	}

	rows, err := db.Query(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	products := make([]Product, 0)
	for rows.Next() {
		var p Product
		err := rows.Scan(
			&p.ID, &p.ProductID, &p.Name, &p.Description, &p.Price,
			&p.Stock, &p.Moq, &p.IsActive,
			&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.MrpUnit, &p.ProductForm,
			&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
			&p.Strength, &p.ProductWeight, &p.LengthCm, &p.WidthCm, &p.HeightCm,
			&p.KeyBenefits, &p.DirectionForUse,
			&p.SafetyInfo, &p.Edetailing, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		p.Categories = []string{}
		products = append(products, p)
	}
	return products, total, rows.Err()
}

func GetAllProducts(ctx context.Context, db *pgxpool.Pool, activeOnly bool, search, category, form, tag string, limit, offset int, nameOnly bool) ([]Product, int, error) {
	products, total, _, err := GetAllProductsWithSuggestion(ctx, db, activeOnly, search, category, form, tag, limit, offset, nameOnly, false)
	return products, total, err
}

// GetAllProductsWithSuggestion is GetAllProducts plus a "did you mean"
// spelling suggestion. It's computed for any non-empty search term —
// whether the literal search found results or not — but only returned
// when it differs from what was actually typed (case aside), so a
// correctly-spelled search doesn't get a pointless "did you mean X?"
// pointing back at the same word.
//
// saltOnly restricts matching to key_ingredients (composition) instead of
// name+key_ingredients — used when the search term came from clicking a
// "did you mean" salt suggestion, so the result list is the products that
// actually contain that salt rather than a looser text match.
func GetAllProductsWithSuggestion(ctx context.Context, db *pgxpool.Pool, activeOnly bool, search, category, form, tag string, limit, offset int, nameOnly, saltOnly bool) ([]Product, int, []string, error) {
	conditions, args, argIdx := buildProductConditions(activeOnly, search, category, form, tag, nameOnly, saltOnly, false)
	products, total, err := queryProducts(ctx, db, conditions, args, argIdx, limit, offset, false, search)
	if err != nil || search == "" {
		return products, total, nil, err
	}

	if len(products) > 0 {
		return products, total, suggestionsOrEmpty(ctx, db, search), nil
	}

	// Literal search found nothing — fall back to a pg_trgm fuzzy match in
	// case the term was misspelled (e.g. a salt/composition name).
	fuzzyConditions, fuzzyArgs, fuzzyArgIdx := buildProductConditions(activeOnly, search, category, form, tag, nameOnly, saltOnly, true)
	fuzzyProducts, fuzzyTotal, err := queryProducts(ctx, db, fuzzyConditions, fuzzyArgs, fuzzyArgIdx, limit, offset, true, search)
	if err != nil || len(fuzzyProducts) == 0 {
		return fuzzyProducts, fuzzyTotal, nil, err
	}
	return fuzzyProducts, fuzzyTotal, suggestionsOrEmpty(ctx, db, search), nil
}

// suggestionsOrEmpty runs suggestSpelling and drops any suggestion that
// errored, or that just echoes back the term the user already typed.
func suggestionsOrEmpty(ctx context.Context, db *pgxpool.Pool, search string) []string {
	words, err := suggestSpelling(ctx, db, search)
	if err != nil {
		return nil
	}
	suggestions := make([]string, 0, len(words))
	for _, w := range words {
		if !strings.EqualFold(w, search) {
			suggestions = append(suggestions, w)
		}
	}
	return suggestions
}

// suggestSpelling finds the top 5 real words (from any product's name or
// key_ingredients) closest to the given typo, for a "did you mean X?"
// prompt — independent of which specific products matched, since a typo
// like "paracetmol" should surface "Paracetamol" even though many
// different products contain it.
func suggestSpelling(ctx context.Context, db *pgxpool.Pool, term string) ([]string, error) {
	const q = `
		SELECT word FROM (
			SELECT DISTINCT unnest(regexp_split_to_array(
				regexp_replace(name || ' ' || COALESCE(key_ingredients, ''), '[^a-zA-Z0-9]+', ' ', 'g'),
				' '
			)) AS word
			FROM products
		) words
		WHERE length(word) > 3
		ORDER BY word_similarity($1, word) DESC
		LIMIT 5
	`
	rows, err := db.Query(ctx, q, term)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var words []string
	for rows.Next() {
		var word string
		if err := rows.Scan(&word); err != nil {
			return nil, err
		}
		words = append(words, word)
	}
	return words, rows.Err()
}

func GetProductByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Product, error) {
	query := `
		SELECT id, product_id, name, description, price, stock, moq, is_active,
			brand_name, hsn_code, gst_rate, mrp, mrp_unit, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			length_cm, width_cm, height_cm,
			key_benefits, direction_for_use, safety_information, edetailing, audio_key,
			created_at, updated_at, marg_code
		FROM products WHERE id = $1
	`
	var p Product
	err := db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.ProductID, &p.Name, &p.Description, &p.Price,
		&p.Stock, &p.Moq, &p.IsActive,
		&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.MrpUnit, &p.ProductForm,
		&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
		&p.Strength, &p.ProductWeight, &p.LengthCm, &p.WidthCm, &p.HeightCm,
		&p.KeyBenefits, &p.DirectionForUse,
		&p.SafetyInfo, &p.Edetailing, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt, &p.MargCode,
	)
	if err != nil {
		return nil, err
	}
	p.Categories = []string{}
	return &p, nil
}

func UpdateProduct(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, req UpdateProductRequest) error {
	query := `
		UPDATE products SET
			product_id         = COALESCE($2, product_id),
			name               = COALESCE($3, name),
			description        = COALESCE($4, description),
			price              = COALESCE($5, price),
			stock              = COALESCE($6, stock),
			is_active          = COALESCE($7, is_active),
			brand_name         = COALESCE($8, brand_name),
			hsn_code           = COALESCE($9, hsn_code),
			gst_rate           = COALESCE($10, gst_rate),
			mrp                = COALESCE($11, mrp),
			mrp_unit           = COALESCE($12, mrp_unit),
			product_form       = COALESCE($13, product_form),
			consume_type       = COALESCE($14, consume_type),
			pack_size          = COALESCE($15, pack_size),
			pack_form          = COALESCE($16, pack_form),
			key_ingredients    = COALESCE($17, key_ingredients),
			strength           = COALESCE($18, strength),
			product_weight     = COALESCE($19, product_weight),
			length_cm          = COALESCE($20, length_cm),
			width_cm           = COALESCE($21, width_cm),
			height_cm          = COALESCE($22, height_cm),
			key_benefits       = COALESCE($23, key_benefits),
			direction_for_use  = COALESCE($24, direction_for_use),
			safety_information = COALESCE($25, safety_information),
			edetailing         = COALESCE($26, edetailing),
			moq                = COALESCE($27, moq),
			marg_code          = COALESCE($28, marg_code)
		WHERE id = $1
	`
	_, err := db.Exec(ctx, query, id,
		req.ProductID, req.Name, req.Description, req.Price, req.Stock, req.IsActive,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.MrpUnit, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.LengthCm, req.WidthCm, req.HeightCm,
		req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo, req.Edetailing, req.Moq, req.MargCode,
	)
	if err != nil {
		return err
	}

	if req.Categories != nil {
		if err := setProductCategories(ctx, db, id, *req.Categories); err != nil {
			return err
		}
	}
	if req.Tags != nil {
		if err := setProductTags(ctx, db, id, *req.Tags); err != nil {
			return err
		}
	}

	return nil
}

func DeleteProduct(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM products WHERE id = $1", id)
	return err
}

// SetProductAudio sets (or clears, if audioKey is nil) the product's single
// audio clip — e.g. a spoken usage guide. One clip per product, not a list.
func SetProductAudio(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, audioKey *string) error {
	_, err := db.Exec(ctx, "UPDATE products SET audio_key = $1 WHERE id = $2", audioKey, id)
	return err
}

// --- Product Images ---

func AddProductImage(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, imageKey string, sortOrder int) (uuid.UUID, error) {
	query := `
		INSERT INTO product_images (product_id, image_key, sort_order)
		VALUES ($1, $2, $3)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query, productID, imageKey, sortOrder).Scan(&id)
	return id, err
}

func GetProductImages(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) ([]ProductImage, error) {
	query := `
		SELECT id, product_id, image_key, sort_order, visual_aid, hidden, created_at
		FROM product_images
		WHERE product_id = $1
		ORDER BY sort_order ASC, created_at ASC
	`
	rows, err := db.Query(ctx, query, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]ProductImage, 0)
	for rows.Next() {
		var img ProductImage
		err := rows.Scan(&img.ID, &img.ProductID, &img.ImageKey, &img.SortOrder, &img.VisualAid, &img.Hidden, &img.CreatedAt)
		if err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, rows.Err()
}

func DeleteProductImage(ctx context.Context, db *pgxpool.Pool, imageID uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM product_images WHERE id = $1", imageID)
	return err
}

// SetImageVisualAid marks a product image as recommended/not-recommended
// for partners building a slideshow presentation — a staff-set curation
// signal, distinct from an actual presentation deck.
func SetImageVisualAid(ctx context.Context, db *pgxpool.Pool, imageID uuid.UUID, visualAid bool) error {
	_, err := db.Exec(ctx, "UPDATE product_images SET visual_aid = $1 WHERE id = $2", visualAid, imageID)
	return err
}

// SetImageHidden marks a product image as hidden from customer-facing
// views — the image still exists (and is still shown in admin), it's just
// excluded from what customers see. Distinct from deleting the image.
func SetImageHidden(ctx context.Context, db *pgxpool.Pool, imageID uuid.UUID, hidden bool) error {
	_, err := db.Exec(ctx, "UPDATE product_images SET hidden = $1 WHERE id = $2", hidden, imageID)
	return err
}

// --- Product Documents ---

func AddProductDocument(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, name string, fileKey string) (uuid.UUID, error) {
	query := `
		INSERT INTO product_documents (product_id, name, file_key)
		VALUES ($1, $2, $3)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query, productID, name, fileKey).Scan(&id)
	return id, err
}

func GetProductDocuments(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) ([]ProductDocument, error) {
	query := `
		SELECT id, product_id, name, file_key, created_at
		FROM product_documents
		WHERE product_id = $1
		ORDER BY created_at ASC
	`
	rows, err := db.Query(ctx, query, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	docs := make([]ProductDocument, 0)
	for rows.Next() {
		var d ProductDocument
		err := rows.Scan(&d.ID, &d.ProductID, &d.Name, &d.FileKey, &d.CreatedAt)
		if err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, rows.Err()
}

func DeleteProductDocument(ctx context.Context, db *pgxpool.Pool, docID uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM product_documents WHERE id = $1", docID)
	return err
}

func GetProductIDByImageID(ctx context.Context, db *pgxpool.Pool, imageID uuid.UUID) (uuid.UUID, error) {
	var productID uuid.UUID
	err := db.QueryRow(ctx, "SELECT product_id FROM product_images WHERE id = $1", imageID).Scan(&productID)
	return productID, err
}

func GetProductIDByDocumentID(ctx context.Context, db *pgxpool.Pool, docID uuid.UUID) (uuid.UUID, error) {
	var productID uuid.UUID
	err := db.QueryRow(ctx, "SELECT product_id FROM product_documents WHERE id = $1", docID).Scan(&productID)
	return productID, err
}

// --- Batch loaders (avoid N+1) ---

// buildPlaceholders returns "$1,$2,...,$n" and a []any of string IDs
func buildPlaceholders(productIDs []uuid.UUID) (string, []any) {
	args := make([]any, len(productIDs))
	ph := ""
	for i, id := range productIDs {
		if i > 0 {
			ph += ","
		}
		ph += fmt.Sprintf("$%d", i+1)
		args[i] = id.String()
	}
	return ph, args
}

func GetProductImagesBatch(ctx context.Context, db *pgxpool.Pool, productIDs []uuid.UUID) (map[uuid.UUID][]ProductImage, error) {
	if len(productIDs) == 0 {
		return make(map[uuid.UUID][]ProductImage), nil
	}
	ph, args := buildPlaceholders(productIDs)
	query := `SELECT id, product_id, image_key, sort_order, visual_aid, hidden, created_at
		FROM product_images
		WHERE product_id IN (` + ph + `)
		ORDER BY sort_order ASC, created_at ASC`

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]ProductImage)
	for rows.Next() {
		var img ProductImage
		if err := rows.Scan(&img.ID, &img.ProductID, &img.ImageKey, &img.SortOrder, &img.VisualAid, &img.Hidden, &img.CreatedAt); err != nil {
			return nil, err
		}
		result[img.ProductID] = append(result[img.ProductID], img)
	}
	return result, rows.Err()
}

func GetProductDocumentsBatch(ctx context.Context, db *pgxpool.Pool, productIDs []uuid.UUID) (map[uuid.UUID][]ProductDocument, error) {
	if len(productIDs) == 0 {
		return make(map[uuid.UUID][]ProductDocument), nil
	}
	ph, args := buildPlaceholders(productIDs)
	query := `SELECT id, product_id, name, file_key, created_at
		FROM product_documents
		WHERE product_id IN (` + ph + `)
		ORDER BY created_at ASC`

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]ProductDocument)
	for rows.Next() {
		var d ProductDocument
		if err := rows.Scan(&d.ID, &d.ProductID, &d.Name, &d.FileKey, &d.CreatedAt); err != nil {
			return nil, err
		}
		result[d.ProductID] = append(result[d.ProductID], d)
	}
	return result, rows.Err()
}
