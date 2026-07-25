package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SpecialProduct struct {
	ID              uuid.UUID                `json:"id"`
	CustomerID      uuid.UUID                `json:"customer_id"`
	Name            string                   `json:"name"`
	Description     string                   `json:"description,omitempty"`
	Price           *float64                 `json:"price,omitempty"`
	Stock           *int                     `json:"stock,omitempty"`
	IsActive        bool                     `json:"is_active"`
	BrandName       *string                  `json:"brand_name,omitempty"`
	HsnCode         *string                  `json:"hsn_code,omitempty"`
	GstRate         *float64                 `json:"gst_rate,omitempty"`
	Mrp             *float64                 `json:"mrp,omitempty"`
	ProductForm     *string                  `json:"product_form,omitempty"`
	ConsumeType     *string                  `json:"consume_type,omitempty"`
	PackSize        *string                  `json:"pack_size,omitempty"`
	PackForm        *string                  `json:"pack_form,omitempty"`
	KeyIngredients  *string                  `json:"key_ingredients,omitempty"`
	Strength        *string                  `json:"strength,omitempty"`
	ProductWeight   *string                  `json:"product_weight,omitempty"`
	KeyBenefits     *string                  `json:"key_benefits,omitempty"`
	DirectionForUse *string                  `json:"direction_for_use,omitempty"`
	SafetyInfo      *string                  `json:"safety_info,omitempty"`
	Images          []SpecialProductImage    `json:"images"`
	Documents       []SpecialProductDocument `json:"documents"`
	AudioKey        *string                  `json:"audio_key,omitempty"`
	AudioURL        string                   `json:"audio_url,omitempty"`
	CreatedAt       time.Time                `json:"created_at"`
	UpdatedAt       time.Time                `json:"updated_at"`
}

type SpecialProductImage struct {
	ID               uuid.UUID `json:"id"`
	SpecialProductID uuid.UUID `json:"special_product_id"`
	ImageKey         string    `json:"image_key"`
	ImageURL         string    `json:"image_url,omitempty"`
	SortOrder        int       `json:"sort_order"`
	CreatedAt        time.Time `json:"created_at"`
}

type SpecialProductDocument struct {
	ID               uuid.UUID `json:"id"`
	SpecialProductID uuid.UUID `json:"special_product_id"`
	Name             string    `json:"name"`
	FileKey          string    `json:"file_key"`
	FileURL          string    `json:"file_url,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

type CreateSpecialProductRequest struct {
	CustomerID      uuid.UUID `json:"customer_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	Price           *float64  `json:"price"`
	Stock           *int      `json:"stock"`
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
	SafetyInfo      *string   `json:"safety_info"`
}

type UpdateSpecialProductRequest struct {
	Name            *string  `json:"name"`
	Description     *string  `json:"description"`
	Price           *float64 `json:"price"`
	Stock           *int     `json:"stock"`
	IsActive        *bool    `json:"is_active"`
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
	SafetyInfo      *string  `json:"safety_info"`
}

// --- Special Product CRUD ---

func CreateSpecialProduct(ctx context.Context, db *pgxpool.Pool, customerID uuid.UUID, req CreateSpecialProductRequest) (uuid.UUID, error) {
	query := `
		INSERT INTO special_products (customer_id, name, description, price, stock,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_info)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query,
		customerID, req.Name, req.Description, req.Price, req.Stock,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, err
	}

	return id, nil
}

func GetSpecialProductsByCustomer(ctx context.Context, db *pgxpool.Pool, customerID uuid.UUID, activeOnly bool) ([]SpecialProduct, error) {
	query := `
		SELECT id, customer_id, name, description, price, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_info, audio_key,
			created_at, updated_at
		FROM special_products
		WHERE customer_id = $1
	`
	if activeOnly {
		query += " AND is_active = TRUE"
	}
	query += " ORDER BY name ASC"

	rows, err := db.Query(ctx, query, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := make([]SpecialProduct, 0)
	for rows.Next() {
		var p SpecialProduct
		err := rows.Scan(
			&p.ID, &p.CustomerID, &p.Name, &p.Description, &p.Price,
			&p.Stock, &p.IsActive,
			&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
			&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
			&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
			&p.SafetyInfo, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}

func GetSpecialProductByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*SpecialProduct, error) {
	query := `
		SELECT id, customer_id, name, description, price, stock, is_active,
			brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
			pack_size, pack_form, key_ingredients, strength, product_weight,
			key_benefits, direction_for_use, safety_info, audio_key,
			created_at, updated_at
		FROM special_products WHERE id = $1
	`
	var p SpecialProduct
	err := db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.CustomerID, &p.Name, &p.Description, &p.Price,
		&p.Stock, &p.IsActive,
		&p.BrandName, &p.HsnCode, &p.GstRate, &p.Mrp, &p.ProductForm,
		&p.ConsumeType, &p.PackSize, &p.PackForm, &p.KeyIngredients,
		&p.Strength, &p.ProductWeight, &p.KeyBenefits, &p.DirectionForUse,
		&p.SafetyInfo, &p.AudioKey, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func UpdateSpecialProduct(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, req UpdateSpecialProductRequest) error {
	query := `
		UPDATE special_products SET
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
			safety_info        = COALESCE($20, safety_info),
			updated_at         = now()
		WHERE id = $1
	`
	_, err := db.Exec(ctx, query, id,
		req.Name, req.Description, req.Price, req.Stock, req.IsActive,
		req.BrandName, req.HsnCode, req.GstRate, req.Mrp, req.ProductForm,
		req.ConsumeType, req.PackSize, req.PackForm, req.KeyIngredients,
		req.Strength, req.ProductWeight, req.KeyBenefits, req.DirectionForUse,
		req.SafetyInfo,
	)
	return err
}

func DeleteSpecialProduct(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM special_products WHERE id = $1", id)
	return err
}

// SetSpecialProductAudio sets (or clears, if audioKey is nil) the special
// product's single audio clip. One clip per product, not a list.
func SetSpecialProductAudio(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, audioKey *string) error {
	_, err := db.Exec(ctx, "UPDATE special_products SET audio_key = $1, updated_at = now() WHERE id = $2", audioKey, id)
	return err
}

// --- Special Product Images ---

func AddSpecialProductImage(ctx context.Context, db *pgxpool.Pool, specialProductID uuid.UUID, imageKey string, sortOrder int) (uuid.UUID, error) {
	query := `
		INSERT INTO special_product_images (special_product_id, image_key, sort_order)
		VALUES ($1, $2, $3)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query, specialProductID, imageKey, sortOrder).Scan(&id)
	return id, err
}

func GetSpecialProductImages(ctx context.Context, db *pgxpool.Pool, specialProductID uuid.UUID) ([]SpecialProductImage, error) {
	query := `
		SELECT id, special_product_id, image_key, sort_order, created_at
		FROM special_product_images
		WHERE special_product_id = $1
		ORDER BY sort_order ASC, created_at ASC
	`
	rows, err := db.Query(ctx, query, specialProductID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]SpecialProductImage, 0)
	for rows.Next() {
		var img SpecialProductImage
		err := rows.Scan(&img.ID, &img.SpecialProductID, &img.ImageKey, &img.SortOrder, &img.CreatedAt)
		if err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, rows.Err()
}

func DeleteSpecialProductImage(ctx context.Context, db *pgxpool.Pool, imageID uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM special_product_images WHERE id = $1", imageID)
	return err
}

// --- Special Product Documents ---

func AddSpecialProductDocument(ctx context.Context, db *pgxpool.Pool, specialProductID uuid.UUID, name string, fileKey string) (uuid.UUID, error) {
	query := `
		INSERT INTO special_product_documents (special_product_id, name, file_key)
		VALUES ($1, $2, $3)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query, specialProductID, name, fileKey).Scan(&id)
	return id, err
}

func GetSpecialProductDocuments(ctx context.Context, db *pgxpool.Pool, specialProductID uuid.UUID) ([]SpecialProductDocument, error) {
	query := `
		SELECT id, special_product_id, name, file_key, created_at
		FROM special_product_documents
		WHERE special_product_id = $1
		ORDER BY created_at ASC
	`
	rows, err := db.Query(ctx, query, specialProductID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	docs := make([]SpecialProductDocument, 0)
	for rows.Next() {
		var d SpecialProductDocument
		err := rows.Scan(&d.ID, &d.SpecialProductID, &d.Name, &d.FileKey, &d.CreatedAt)
		if err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, rows.Err()
}

func DeleteSpecialProductDocument(ctx context.Context, db *pgxpool.Pool, docID uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM special_product_documents WHERE id = $1", docID)
	return err
}

func GetSpecialProductIDByImageID(ctx context.Context, db *pgxpool.Pool, imageID uuid.UUID) (uuid.UUID, error) {
	var specialProductID uuid.UUID
	err := db.QueryRow(ctx, "SELECT special_product_id FROM special_product_images WHERE id = $1", imageID).Scan(&specialProductID)
	return specialProductID, err
}

func GetSpecialProductIDByDocumentID(ctx context.Context, db *pgxpool.Pool, docID uuid.UUID) (uuid.UUID, error) {
	var specialProductID uuid.UUID
	err := db.QueryRow(ctx, "SELECT special_product_id FROM special_product_documents WHERE id = $1", docID).Scan(&specialProductID)
	return specialProductID, err
}

// --- Batch loaders (avoid N+1) ---
// Reuses buildPlaceholders defined in productModel.go (same package).

func GetSpecialProductImagesBatch(ctx context.Context, db *pgxpool.Pool, specialProductIDs []uuid.UUID) (map[uuid.UUID][]SpecialProductImage, error) {
	if len(specialProductIDs) == 0 {
		return make(map[uuid.UUID][]SpecialProductImage), nil
	}
	ph, args := buildPlaceholders(specialProductIDs)
	query := `SELECT id, special_product_id, image_key, sort_order, created_at
		FROM special_product_images
		WHERE special_product_id IN (` + ph + `)
		ORDER BY sort_order ASC, created_at ASC`

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]SpecialProductImage)
	for rows.Next() {
		var img SpecialProductImage
		if err := rows.Scan(&img.ID, &img.SpecialProductID, &img.ImageKey, &img.SortOrder, &img.CreatedAt); err != nil {
			return nil, err
		}
		result[img.SpecialProductID] = append(result[img.SpecialProductID], img)
	}
	return result, rows.Err()
}

func GetSpecialProductDocumentsBatch(ctx context.Context, db *pgxpool.Pool, specialProductIDs []uuid.UUID) (map[uuid.UUID][]SpecialProductDocument, error) {
	if len(specialProductIDs) == 0 {
		return make(map[uuid.UUID][]SpecialProductDocument), nil
	}
	ph, args := buildPlaceholders(specialProductIDs)
	query := `SELECT id, special_product_id, name, file_key, created_at
		FROM special_product_documents
		WHERE special_product_id IN (` + ph + `)
		ORDER BY created_at ASC`

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]SpecialProductDocument)
	for rows.Next() {
		var d SpecialProductDocument
		if err := rows.Scan(&d.ID, &d.SpecialProductID, &d.Name, &d.FileKey, &d.CreatedAt); err != nil {
			return nil, err
		}
		result[d.SpecialProductID] = append(result[d.SpecialProductID], d)
	}
	return result, rows.Err()
}
