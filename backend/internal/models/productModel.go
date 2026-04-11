package models

import (
	"context"
	"fmt"
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
		INSERT INTO products (name, description, price, categories, stock,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query,
		req.Name, req.Description, req.Price, req.Categories, req.Stock,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo,
	).Scan(&id)
	return id, err
}

func GetDistinctCategories(ctx context.Context, db *pgxpool.Pool) ([]string, error) {
	query := `SELECT DISTINCT unnest(categories) AS cat FROM products WHERE is_active = TRUE ORDER BY cat`
	rows, err := db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cats := []string{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		if c != "" {
			cats = append(cats, c)
		}
	}
	return cats, rows.Err()
}

func GetAllProducts(ctx context.Context, db *pgxpool.Pool, activeOnly bool, search, category string, limit, offset int) ([]Product, int, error) {
	conditions := []string{}
	args := []any{}
	argIdx := 1

	if activeOnly {
		conditions = append(conditions, "is_active = TRUE")
	}
	if search != "" {
		conditions = append(conditions, fmt.Sprintf("(name ILIKE $%d OR description ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}
	if category != "" {
		conditions = append(conditions, fmt.Sprintf("$%d = ANY(categories)", argIdx))
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

	query := fmt.Sprintf(`
		SELECT id, name, description, price, categories, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information,
			created_at, updated_at
		FROM products
	`+where+" ORDER BY name ASC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)

	rows, err := db.Query(ctx, query, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	products := make([]Product, 0)
	for rows.Next() {
		var p Product
		err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Price,
			&p.Categories, &p.Stock, &p.IsActive,
			&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
			&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
			&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
			&p.SafetyInfo, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		if p.Categories == nil {
			p.Categories = []string{}
		}
		products = append(products, p)
	}
	return products, total, rows.Err()
}

func GetProductByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Product, error) {
	query := `
		SELECT id, name, description, price, categories, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_information,
			created_at, updated_at
		FROM products WHERE id = $1
	`
	var p Product
	err := db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.Name, &p.Description, &p.Price,
		&p.Categories, &p.Stock, &p.IsActive,
		&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
		&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
		&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
		&p.SafetyInfo, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if p.Categories == nil {
		p.Categories = []string{}
	}
	return &p, nil
}

func UpdateProduct(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, req UpdateProductRequest) error {
	query := `
		UPDATE products SET
			name               = COALESCE($2, name),
			description        = COALESCE($3, description),
			price              = COALESCE($4, price),
			categories         = COALESCE($5, categories),
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
			safety_information = COALESCE($21, safety_information)
		WHERE id = $1
	`
	_, err := db.Exec(ctx, query, id,
		req.Name, req.Description, req.Price, req.Categories, req.Stock, req.IsActive,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo,
	)
	return err
}

func DeleteProduct(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM products WHERE id = $1", id)
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
