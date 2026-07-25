package specialproducts

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func loadSpecialProductRelations(r *http.Request, db *pgxpool.Pool, p *models.SpecialProduct) {
	images, _ := models.GetSpecialProductImages(r.Context(), db, p.ID)
	if images == nil {
		images = []models.SpecialProductImage{}
	}
	for i := range images {
		images[i].ImageURL = utils.GetPublicURL(images[i].ImageKey)
	}
	p.Images = images

	docs, _ := models.GetSpecialProductDocuments(r.Context(), db, p.ID)
	if docs == nil {
		docs = []models.SpecialProductDocument{}
	}
	for i := range docs {
		docs[i].FileURL = utils.GetPublicURL(docs[i].FileKey)
	}
	p.Documents = docs

	if p.AudioKey != nil {
		p.AudioURL = utils.GetPublicURL(*p.AudioKey)
	}
}

func loadSpecialProductRelationsBatch(r *http.Request, db *pgxpool.Pool, products []models.SpecialProduct) {
	if len(products) == 0 {
		return
	}

	ids := make([]uuid.UUID, len(products))
	for i := range products {
		ids[i] = products[i].ID
	}

	imagesMap, _ := models.GetSpecialProductImagesBatch(r.Context(), db, ids)
	docsMap, _ := models.GetSpecialProductDocumentsBatch(r.Context(), db, ids)

	for i := range products {
		images := imagesMap[products[i].ID]
		if images == nil {
			images = []models.SpecialProductImage{}
		}
		for j := range images {
			images[j].ImageURL = utils.GetPublicURL(images[j].ImageKey)
		}
		products[i].Images = images

		docs := docsMap[products[i].ID]
		if docs == nil {
			docs = []models.SpecialProductDocument{}
		}
		for j := range docs {
			docs[j].FileURL = utils.GetPublicURL(docs[j].FileKey)
		}
		products[i].Documents = docs

		if products[i].AudioKey != nil {
			products[i].AudioURL = utils.GetPublicURL(*products[i].AudioKey)
		}
	}
}

// requesterID pulls the authenticated user's id from the request context,
// populated by the Auth middleware.
func requesterID(r *http.Request) (uuid.UUID, bool) {
	idStr, ok := r.Context().Value("user_id").(string)
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(idStr)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

// ------------------------------------------------------------------
// Admin handlers
// ------------------------------------------------------------------

// GET /admin/special-products?customer_id=
func AdminListSpecialProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		customerID, err := uuid.Parse(r.URL.Query().Get("customer_id"))
		if err != nil {
			http.Error(w, "customer_id is required", http.StatusBadRequest)
			return
		}

		products, err := models.GetSpecialProductsByCustomer(r.Context(), db, customerID, false)
		if err != nil {
			log.Printf("list special products error: %v", err)
			http.Error(w, "could not fetch special products", http.StatusInternalServerError)
			return
		}

		loadSpecialProductRelationsBatch(r, db, products)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(products)
	}
}

// POST /admin/special-products
func AdminCreateSpecialProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req models.CreateSpecialProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.CustomerID == uuid.Nil {
			http.Error(w, "customer_id is required", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		id, err := models.CreateSpecialProduct(r.Context(), db, req.CustomerID, req)
		if err != nil {
			log.Printf("create special product error: %v", err)
			http.Error(w, "could not create special product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

// PUT /admin/special-products/{id}
func AdminUpdateSpecialProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid special product id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req models.UpdateSpecialProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateSpecialProduct(r.Context(), db, id, req); err != nil {
			log.Printf("update special product error: %v", err)
			http.Error(w, "could not update special product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /admin/special-products/{id}
func AdminDeleteSpecialProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid special product id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteSpecialProduct(r.Context(), db, id); err != nil {
			log.Printf("delete special product error: %v", err)
			http.Error(w, "could not delete special product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/special-products/upload-url
// body: { "customer_id": "...", "filename": "..." }
func AdminUploadURLHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			CustomerID string `json:"customer_id"`
			Filename   string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" || req.CustomerID == "" {
			http.Error(w, "customer_id and filename are required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedSpecialProductImageUploadURL(req.CustomerID, req.Filename)
		if err != nil {
			log.Printf("presign special image error: %v", err)
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

// POST /admin/special-products/document-upload-url
// body: { "customer_id": "...", "filename": "..." }
func AdminDocUploadURLHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			CustomerID string `json:"customer_id"`
			Filename   string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" || req.CustomerID == "" {
			http.Error(w, "customer_id and filename are required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedSpecialProductDocUploadURL(req.CustomerID, req.Filename)
		if err != nil {
			log.Printf("presign special doc error: %v", err)
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

// POST /admin/special-products/{id}/images
func AdminAddImageHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid special product id", http.StatusBadRequest)
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

		imgID, err := models.AddSpecialProductImage(r.Context(), db, productID, req.ImageKey, req.SortOrder)
		if err != nil {
			log.Printf("add special image error: %v", err)
			http.Error(w, "could not add image", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": imgID})
	}
}

// DELETE /admin/special-products/images/{imgId}
func AdminDeleteImageHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imgID, err := uuid.Parse(mux.Vars(r)["imgId"])
		if err != nil {
			http.Error(w, "invalid image id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteSpecialProductImage(r.Context(), db, imgID); err != nil {
			log.Printf("delete special image error: %v", err)
			http.Error(w, "could not delete image", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/special-products/{id}/documents
func AdminAddDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid special product id", http.StatusBadRequest)
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

		docID, err := models.AddSpecialProductDocument(r.Context(), db, productID, req.Name, req.FileKey)
		if err != nil {
			log.Printf("add special document error: %v", err)
			http.Error(w, "could not add document", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": docID})
	}
}

// DELETE /admin/special-products/documents/{docId}
func AdminDeleteDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID, err := uuid.Parse(mux.Vars(r)["docId"])
		if err != nil {
			http.Error(w, "invalid document id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteSpecialProductDocument(r.Context(), db, docID); err != nil {
			log.Printf("delete special document error: %v", err)
			http.Error(w, "could not delete document", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// ------------------------------------------------------------------
// Customer-facing handlers — always scoped to the authenticated
// requester's own id. A client-supplied customer id is never trusted.
// ------------------------------------------------------------------

// GET /special-products
func ListMySpecialProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requesterID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		user, err := models.GetUserByID(r.Context(), db, userID)
		if err != nil {
			log.Printf("list my special products lookup error: %v", err)
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		if user.CustomerType != "special" {
			http.Error(w, "special products are not available for this account", http.StatusForbidden)
			return
		}

		products, err := models.GetSpecialProductsByCustomer(r.Context(), db, userID, true)
		if err != nil {
			log.Printf("list my special products error: %v", err)
			http.Error(w, "could not fetch special products", http.StatusInternalServerError)
			return
		}

		loadSpecialProductRelationsBatch(r, db, products)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(products)
	}
}

// GET /special-products/{id}
func GetMySpecialProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requesterID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		user, err := models.GetUserByID(r.Context(), db, userID)
		if err != nil {
			log.Printf("get my special product lookup error: %v", err)
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		if user.CustomerType != "special" {
			http.Error(w, "special products are not available for this account", http.StatusForbidden)
			return
		}

		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid special product id", http.StatusBadRequest)
			return
		}

		p, err := models.GetSpecialProductByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "special product not found", http.StatusNotFound)
			return
		}

		// Never leak existence of another customer's product — 404, not 403.
		if p.CustomerID != userID {
			http.Error(w, "special product not found", http.StatusNotFound)
			return
		}

		loadSpecialProductRelations(r, db, p)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(p)
	}
}
