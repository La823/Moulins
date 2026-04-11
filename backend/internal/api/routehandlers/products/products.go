package products

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// loadProductRelations fetches images + documents and attaches S3 URLs (single product)
func loadProductRelations(r *http.Request, db *pgxpool.Pool, p *models.Product) {
	images, _ := models.GetProductImages(r.Context(), db, p.ID)
	if images == nil {
		images = []models.ProductImage{}
	}
	for i := range images {
		images[i].ImageURL = utils.GetPublicURL(images[i].ImageKey)
	}
	p.Images = images

	docs, _ := models.GetProductDocuments(r.Context(), db, p.ID)
	if docs == nil {
		docs = []models.ProductDocument{}
	}
	for i := range docs {
		docs[i].FileURL = utils.GetPublicURL(docs[i].FileKey)
	}
	p.Documents = docs
}

// loadProductRelationsBatch fetches images + documents for many products in 2 queries
func loadProductRelationsBatch(r *http.Request, db *pgxpool.Pool, products []models.Product) {
	if len(products) == 0 {
		return
	}

	ids := make([]uuid.UUID, len(products))
	for i := range products {
		ids[i] = products[i].ID
	}

	imagesMap, _ := models.GetProductImagesBatch(r.Context(), db, ids)
	docsMap, _ := models.GetProductDocumentsBatch(r.Context(), db, ids)

	for i := range products {
		images := imagesMap[products[i].ID]
		if images == nil {
			images = []models.ProductImage{}
		}
		for j := range images {
			images[j].ImageURL = utils.GetPublicURL(images[j].ImageKey)
		}
		products[i].Images = images

		docs := docsMap[products[i].ID]
		if docs == nil {
			docs = []models.ProductDocument{}
		}
		for j := range docs {
			docs[j].FileURL = utils.GetPublicURL(docs[j].FileKey)
		}
		products[i].Documents = docs
	}
}

// POST /admin/products
func CreateProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req models.CreateProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.Name == "" || req.Price <= 0 {
			http.Error(w, "name and a valid price are required", http.StatusBadRequest)
			return
		}

		if req.Categories == nil {
			req.Categories = []string{}
		}

		id, err := models.CreateProduct(r.Context(), db, req)
		if err != nil {
			log.Printf("create product error: %v", err)
			http.Error(w, "could not create product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

// GET /products/categories — returns distinct category names
func ListCategoriesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cats, err := models.GetDistinctCategories(r.Context(), db)
		if err != nil {
			log.Printf("list categories error: %v", err)
			http.Error(w, "could not fetch categories", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cats)
	}
}

// GET /products and GET /admin/products
// Query params: ?page=1&limit=20&search=&category=
func ListProductsHandler(db *pgxpool.Pool, activeOnly bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		search := r.URL.Query().Get("search")
		category := r.URL.Query().Get("category")
		offset := (page - 1) * limit

		products, total, err := models.GetAllProducts(r.Context(), db, activeOnly, search, category, limit, offset)
		if err != nil {
			log.Printf("list products error: %v", err)
			http.Error(w, "could not fetch products", http.StatusInternalServerError)
			return
		}

		loadProductRelationsBatch(r, db, products)

		totalPages := int(math.Ceil(float64(total) / float64(limit)))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"products":    products,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		})
	}
}

// GET /products/{id}
func GetProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		product, err := models.GetProductByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}

		loadProductRelations(r, db, product)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(product)
	}
}

// PUT /admin/products/{id}
func UpdateProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req models.UpdateProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateProduct(r.Context(), db, id, req); err != nil {
			log.Printf("update product error: %v", err)
			http.Error(w, "could not update product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /admin/products/{id}
func DeleteProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteProduct(r.Context(), db, id); err != nil {
			log.Printf("delete product error: %v", err)
			http.Error(w, "could not delete product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/products/upload-url (for images)
func UploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
			http.Error(w, "filename is required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedUploadURL(req.Filename)
		if err != nil {
			log.Printf("presign error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}

// POST /admin/products/{id}/images — add image to product
func AddImageHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			ImageKey  string `json:"image_key"`
			SortOrder int    `json:"sort_order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ImageKey == "" {
			http.Error(w, "image_key is required", http.StatusBadRequest)
			return
		}

		imgID, err := models.AddProductImage(r.Context(), db, productID, req.ImageKey, req.SortOrder)
		if err != nil {
			log.Printf("add image error: %v", err)
			http.Error(w, "could not add image", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": imgID})
	}
}

// DELETE /admin/products/images/{imgId} — remove image
func DeleteImageHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imgID, err := uuid.Parse(mux.Vars(r)["imgId"])
		if err != nil {
			http.Error(w, "invalid image id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteProductImage(r.Context(), db, imgID); err != nil {
			log.Printf("delete image error: %v", err)
			http.Error(w, "could not delete image", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/products/{id}/documents — add a document to a product
func AddDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Name    string `json:"name"`
			FileKey string `json:"file_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.Name == "" || req.FileKey == "" {
			http.Error(w, "name and file_key are required", http.StatusBadRequest)
			return
		}

		docID, err := models.AddProductDocument(r.Context(), db, productID, req.Name, req.FileKey)
		if err != nil {
			log.Printf("add document error: %v", err)
			http.Error(w, "could not add document", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": docID})
	}
}

// DELETE /admin/products/documents/{docId} — remove a document
func DeleteDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID, err := uuid.Parse(mux.Vars(r)["docId"])
		if err != nil {
			http.Error(w, "invalid document id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteProductDocument(r.Context(), db, docID); err != nil {
			log.Printf("delete document error: %v", err)
			http.Error(w, "could not delete document", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/products/document-upload-url — presigned URL for PDF upload
func DocumentUploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
			http.Error(w, "filename is required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedDocUploadURL(req.Filename)
		if err != nil {
			log.Printf("presign doc error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}
