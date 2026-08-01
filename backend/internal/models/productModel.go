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
	ID               uuid.UUID         `json:"id"`
	ProductID        int               `json:"product_id"`
	Name             string            `json:"name"`
	Description      string            `json:"description,omitempty"`
	Price            float64           `json:"price"`
	Categories       []string          `json:"categories"`
	Tags             []string          `json:"tags"`
	Stock            int               `json:"stock"`
	IsActive         bool              `json:"is_active"`
	BrandName        *string           `json:"brand_name,omitempty"`
	HsnCode          *string           `json:"hsn_code,omitempty"`
	GstRate          *float64          `json:"gst_rate,omitempty"`
	Mrp              *float64          `json:"mrp,omitempty"`
	ProductForm      *string           `json:"product_form,omitempty"`
	ConsumeType      *string           `json:"consume_type,omitempty"`
	PackSize         *string           `json:"pack_size,omitempty"`
	PackForm         *string           `json:"pack_form,omitempty"`
	KeyIngredients   *string           `json:"key_ingredients,omitempty"`
	Strength         *string           `json:"strength,omitempty"`
	ProductWeight    *string           `json:"product_weight,omitempty"`
	KeyBenefits      *string           `json:"key_benefits,omitempty"`
	DirectionForUse  *string           `json:"direction_for_use,omitempty"`
	SafetyInfo       *string           `json:"safety_information,omitempty"`
	Edetailing       *string           `json:"edetailing,omitempty"`
	Images           []ProductImage    `json:"images"`
	Documents        []ProductDocument `json:"documents"`
	AudioKey         *string           `json:"audio_key,omitempty"`
	AudioURL         string            `json:"audio_url,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}

type ProductImage struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	ImageKey  string    `json:"image_key"`
	ImageURL  string    `json:"image_url,omitempty"`
	SortOrder int       `json:"sort_order"`
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
	BrandName       *string  `json:"brand_name"`
	HsnCode         *string  `json:"hsn_code"`
	GstRate         *float64 `json:"gst_rate"`
	Mrp             *float64 `json:"mrp"`
	ProductForm     *string  `json:"product_form"`
	ConsumeType     *string  `json:"consume_type"`
	PackSize        *string  `json:"pack_size"`
	PackForm        *string  `json:"pack_form"`
	KeyIngredients  *string  `json:"key_ingredients"`
	Strength        *string  `json:"strength"`
	ProductWeight   *string  `json:"product_weight"`
	KeyBenefits     *string  `json:"key_benefits"`
	DirectionForUse *string  `json:"direction_for_use"`
	SafetyInfo      *string  `json:"safety_information"`
	Edetailing      *string  `json:"edetailing"`
}

type UpdateProductRequest struct {
	ProductID       *int      `json:"product_id"`
	Name            *string   `json:"name"`
	Description     *string   `json:"description"`
	Price           *float64  `json:"price"`
	Categories      *[]string `json:"categories"`
	Tags            *[]string `json:"tags"`
	Stock           *int      `json:"stock"`
	IsActive        *bool     `json:"is_active"`
	BrandName       *string   `json:"brand_name"`
	HsnCode         *string   `json:"hsn_code"`
	GstRate         *float64  `json:"gst_rate"`
	Mrp             *float64  `json:"mrp"`
	ProductForm     *string   `json:"product_form"`
	ConsumeType     *string   `json:"consume_type"`
	PackSize        *string   `json:"pack_size"`
	PackForm        *string   `json:"pack_form"`
	KeyIngredients  *string   `json:"key_ingredients"`
	Strength        *string   `json:"strength"`
	ProductWeight   *string   `json:"product_weight"`
	KeyBenefits     *string   `json:"key_benefits"`
	DirectionForUse *string   `json:"direction_for_use"`
	SafetyInfo      *string   `json:"safety_information"`
	Edetailing      *string   `json:"edetailing"`
}

// --- Product CRUD ---

func CreateProduct(ctx context.Context, db *pgxpool.Pool, req CreateProductRequest) (uuid.UUID, error) {
	var id uuid.UUID
	var err error

	// product_id is a SERIAL with a default — only override it when the
	// admin explicitly supplied one (their "actual product id"); otherwise
	// leave the column out of the INSERT entirely so the sequence default applies.
	if req.ProductID != nil {
		query := `
			INSERT INTO products (product_id, name, description, price, stock,
				brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
				pack_size, pack_form, key_ingredients, strength, product_weight,
				key_benefits, direction_for_use, safety_information, edetailing)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
			RETURNING id;
		`
		err = db.QueryRow(ctx, query,
			*req.ProductID, req.Name, req.Description, req.Price, req.Stock,
			req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
			req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
			req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
			req.SafetyInfo, req.Edetailing,
		).Scan(&id)
	} else {
		query := `
			INSERT INTO products (name, description, price, stock,
				brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
				pack_size, pack_form, key_ingredients, strength, product_weight,
				key_benefits, direction_for_use, safety_information, edetailing)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
			RETURNING id;
		`
		err = db.QueryRow(ctx, query,
			req.Name, req.Description, req.Price, req.Stock,
			req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
			req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
			req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
			req.SafetyInfo, req.Edetailing,
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

func GetAllProducts(ctx context.Context, db *pgxpool.Pool, activeOnly bool, search, category, form, tag string, limit, offset int, nameOnly bool) ([]Product, int, error) {
	conditions := []string{}
	args := []any{}
	argIdx := 1

	if activeOnly {
		conditions = append(conditions, "is_active = TRUE")
	}
	if search != "" {
		if nameOnly {
			conditions = append(conditions, fmt.Sprintf("name ILIKE $%d", argIdx))
		} else {
			conditions = append(conditions, fmt.Sprintf("(name ILIKE $%d OR description ILIKE $%d OR key_ingredients ILIKE $%d)", argIdx, argIdx, argIdx))
		}
		args = append(args, "%"+search+"%")
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

	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + conditions[0]
		for _, c := range conditions[1:] {
			where += " AND " + c
		}
	}

	// Get total count
	var total int
	countQuery := "SELECT COUNT(*) FROM products" + where
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	baseQuery := `
		SELECT id, product_id, name, description, price, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information, edetailing, audio_key,
			created_at, updated_at
		FROM products
	` + where + " ORDER BY name ASC"

	var query string
	var queryArgs []any
	if limit == 0 {
		query = baseQuery
		queryArgs = args
	} else {
		query = fmt.Sprintf(baseQuery+" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
		queryArgs = append(args, limit, offset)
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
			&p.Stock, &p.IsActive,
			&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
			&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
			&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
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

func GetProductByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Product, error) {
	query := `
		SELECT id, product_id, name, description, price, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information, edetailing, audio_key,
			created_at, updated_at
		FROM products WHERE id = $1
	`
	var p Product
	err := db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.ProductID, &p.Name, &p.Description, &p.Price,
		&p.Stock, &p.IsActive,
		&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
		&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
		&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
		&p.SafetyInfo, &p.Edetailing, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt,
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
			product_form       = COALESCE($12, product_form),
			consume_type       = COALESCE($13, consume_type),
			pack_size          = COALESCE($14, pack_size),
			pack_form          = COALESCE($15, pack_form),
			key_ingredients    = COALESCE($16, key_ingredients),
			strength           = COALESCE($17, strength),
			product_weight     = COALESCE($18, product_weight),
			key_benefits       = COALESCE($19, key_benefits),
			direction_for_use  = COALESCE($20, direction_for_use),
			safety_information = COALESCE($21, safety_information),
			edetailing         = COALESCE($22, edetailing)
		WHERE id = $1
	`
	_, err := db.Exec(ctx, query, id,
		req.ProductID, req.Name, req.Description, req.Price, req.Stock, req.IsActive,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo, req.Edetailing,
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
		SELECT id, product_id, image_key, sort_order, created_at
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
		err := rows.Scan(&img.ID, &img.ProductID, &img.ImageKey, &img.SortOrder, &img.CreatedAt)
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
	query := `SELECT id, product_id, image_key, sort_order, created_at
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
		if err := rows.Scan(&img.ID, &img.ProductID, &img.ImageKey, &img.SortOrder, &img.CreatedAt); err != nil {
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
