package products

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

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

	cats, _ := models.GetProductCategories(r.Context(), db, p.ID)
	if cats == nil {
		cats = []string{}
	}
	p.Categories = cats
}

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
	catsMap, _ := models.GetProductCategoriesBatch(r.Context(), db, ids)

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

		cats := catsMap[products[i].ID]
		if cats == nil {
			cats = []string{}
		}
		products[i].Categories = cats
	}
}

func invalidateProduct(rdb *cache.Client, r *http.Request, id uuid.UUID) {
	rdb.Del(r.Context(), fmt.Sprintf("product:%s", id), "categories")
	rdb.DelPattern(r.Context(), "products:*")
}

// POST /admin/products
func CreateProductHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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
			if strings.HasPrefix(err.Error(), "unknown categories:") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			log.Printf("create product error: %v", err)
			http.Error(w, "could not create product", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), "categories")
		rdb.DelPattern(r.Context(), "products:*")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

type productListResult struct {
	Products   []models.Product `json:"products"`
	Total      int              `json:"total"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
	TotalPages int              `json:"total_pages"`
}

// GET /products and GET /admin/products
func ListProductsHandler(db *pgxpool.Pool, activeOnly bool, rdb ...*cache.Client) http.HandlerFunc {
	var c *cache.Client
	if len(rdb) > 0 {
		c = rdb[0]
	}
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 0 {
			limit = 20
		} else if limit > 100 {
			limit = 0 // treat "more than 100" as "no limit" rather than silently shrinking to 20
		}
		search := r.URL.Query().Get("search")
		category := r.URL.Query().Get("category")
		nameOnly := r.URL.Query().Get("name_only") == "true"
		offset := (page - 1) * limit

		cacheKey := fmt.Sprintf("products:active=%v:p=%d:l=%d:s=%s:cat=%s:no=%v", activeOnly, page, limit, search, category, nameOnly)
		var cached productListResult
		if c.GetJSON(r.Context(), cacheKey, &cached) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(cached)
			return
		}

		products, total, err := models.GetAllProducts(r.Context(), db, activeOnly, search, category, limit, offset, nameOnly)
		if err != nil {
			log.Printf("list products error: %v", err)
			http.Error(w, "could not fetch products", http.StatusInternalServerError)
			return
		}

		loadProductRelationsBatch(r, db, products)

		totalPages := 1
		if limit > 0 {
			totalPages = int(math.Ceil(float64(total) / float64(limit)))
		}

		result := productListResult{
			Products:   products,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		}

		c.SetJSON(r.Context(), cacheKey, result, 5*time.Minute)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// GET /products/{id}
func GetProductHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		cacheKey := fmt.Sprintf("product:%s", id)
		var product models.Product
		if rdb.GetJSON(r.Context(), cacheKey, &product) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&product)
			return
		}

		p, err := models.GetProductByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}

		loadProductRelations(r, db, p)

		rdb.SetJSON(r.Context(), cacheKey, p, 10*time.Minute)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(p)
	}
}

// PUT /admin/products/{id}
func UpdateProductHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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
			if strings.HasPrefix(err.Error(), "unknown categories:") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			log.Printf("update product error: %v", err)
			http.Error(w, "could not update product", http.StatusInternalServerError)
			return
		}

		invalidateProduct(rdb, r, id)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /admin/products/{id}
func DeleteProductHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		invalidateProduct(rdb, r, id)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/products/upload-url
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

// POST /admin/products/{id}/images
func AddImageHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		rdb.Del(r.Context(), fmt.Sprintf("product:%s", productID))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": imgID})
	}
}

// DELETE /admin/products/images/{imgId}
func DeleteImageHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imgID, err := uuid.Parse(mux.Vars(r)["imgId"])
		if err != nil {
			http.Error(w, "invalid image id", http.StatusBadRequest)
			return
		}

		// Get product ID before deletion for cache invalidation
		productID, _ := models.GetProductIDByImageID(r.Context(), db, imgID)

		if err := models.DeleteProductImage(r.Context(), db, imgID); err != nil {
			log.Printf("delete image error: %v", err)
			http.Error(w, "could not delete image", http.StatusInternalServerError)
			return
		}

		if productID != uuid.Nil {
			rdb.Del(r.Context(), fmt.Sprintf("product:%s", productID))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/products/{id}/documents
func AddDocumentHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
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

		rdb.Del(r.Context(), fmt.Sprintf("product:%s", productID))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": docID})
	}
}

// DELETE /admin/products/documents/{docId}
func DeleteDocumentHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID, err := uuid.Parse(mux.Vars(r)["docId"])
		if err != nil {
			http.Error(w, "invalid document id", http.StatusBadRequest)
			return
		}

		productID, _ := models.GetProductIDByDocumentID(r.Context(), db, docID)

		if err := models.DeleteProductDocument(r.Context(), db, docID); err != nil {
			log.Printf("delete document error: %v", err)
			http.Error(w, "could not delete document", http.StatusInternalServerError)
			return
		}

		if productID != uuid.Nil {
			rdb.Del(r.Context(), fmt.Sprintf("product:%s", productID))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/products/document-upload-url
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
