package models

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Product struct {
	ID               uuid.UUID         `json:"id"`
	Name             string            `json:"name"`
	Description      string            `json:"description,omitempty"`
	Price            float64           `json:"price"`
	Categories       []string          `json:"categories"`
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
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Price           float64  `json:"price"`
	Categories      []string `json:"categories"`
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
}

type UpdateProductRequest struct {
	Name            *string   `json:"name"`
	Description     *string   `json:"description"`
	Price           *float64  `json:"price"`
	Categories      *[]string `json:"categories"`
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
}

// --- Product CRUD ---

func CreateProduct(ctx context.Context, db *pgxpool.Pool, req CreateProductRequest) (uuid.UUID, error) {
	query := `
		INSERT INTO products (name, description, price, stock,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query,
		req.Name, req.Description, req.Price, req.Stock,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, err
	}

	if err := setProductCategories(ctx, db, id, req.Categories); err != nil {
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

func GetAllProducts(ctx context.Context, db *pgxpool.Pool, activeOnly bool, search, category string, limit, offset int, nameOnly bool) ([]Product, int, error) {
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
		SELECT id, name, description, price, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information, audio_key,
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
			&p.ID, &p.Name, &p.Description, &p.Price,
			&p.Stock, &p.IsActive,
			&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
			&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
			&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
			&p.SafetyInfo, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt,
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
		SELECT id, name, description, price, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information, audio_key,
			created_at, updated_at
		FROM products WHERE id = $1
	`
	var p Product
	err := db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.Name, &p.Description, &p.Price,
		&p.Stock, &p.IsActive,
		&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
		&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
		&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
		&p.SafetyInfo, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt,
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
			name               = COALESCE($2, name),
			description        = COALESCE($3, description),
			price              = COALESCE($4, price),
			stock              = COALESCE($5, stock),
			is_active          = COALESCE($6, is_active),
			brand_name         = COALESCE($7, brand_name),
			hsn_code           = COALESCE($8, hsn_code),
			gst_rate           = COALESCE($9, gst_rate),
			mrp                = COALESCE($10, mrp),
			product_form       = COALESCE($11, product_form),
			consume_type       = COALESCE($12, consume_type),
			pack_size          = COALESCE($13, pack_size),
			pack_form          = COALESCE($14, pack_form),
			key_ingredients    = COALESCE($15, key_ingredients),
			strength           = COALESCE($16, strength),
			product_weight     = COALESCE($17, product_weight),
			key_benefits       = COALESCE($18, key_benefits),
			direction_for_use  = COALESCE($19, direction_for_use),
			safety_information = COALESCE($20, safety_information)
		WHERE id = $1
	`
	_, err := db.Exec(ctx, query, id,
		req.Name, req.Description, req.Price, req.Stock, req.IsActive,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo,
	)
	if err != nil {
		return err
	}

	if req.Categories != nil {
		if err := setProductCategories(ctx, db, id, *req.Categories); err != nil {
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
