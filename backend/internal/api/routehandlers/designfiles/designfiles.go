package designfiles

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

// GET /admin/design-files/counts — file count per product, for the folder list view
func CountsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		counts, err := models.GetProductDesignFileCounts(r.Context(), db)
		if err != nil {
			log.Printf("design file counts error: %v", err)
			http.Error(w, "could not fetch counts", http.StatusInternalServerError)
			return
		}

		out := make(map[string]models.ProductDesignFileCount, len(counts))
		for id, c := range counts {
			out[id.String()] = c
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

// GET /admin/products/{id}/design-files
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		files, err := models.GetProductDesignFiles(r.Context(), db, productID)
		if err != nil {
			log.Printf("list design files error: %v", err)
			http.Error(w, "could not fetch files", http.StatusInternalServerError)
			return
		}
		for i := range files {
			files[i].FileURL = utils.GetPublicURL(files[i].FileKey)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(files)
	}
}

// POST /admin/products/{id}/design-files
func AddHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Name     string `json:"name"`
			FileKey  string `json:"file_key"`
			FileSize *int64 `json:"file_size"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" || req.FileKey == "" {
			http.Error(w, "name and file_key are required", http.StatusBadRequest)
			return
		}

		id, err := models.AddProductDesignFile(r.Context(), db, productID, req.Name, req.FileKey, req.FileSize)
		if err != nil {
			log.Printf("add design file error: %v", err)
			http.Error(w, "could not add file", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

// DELETE /admin/products/design-files/{fileId}
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fileID, err := uuid.Parse(mux.Vars(r)["fileId"])
		if err != nil {
			http.Error(w, "invalid file id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteProductDesignFile(r.Context(), db, fileID); err != nil {
			log.Printf("delete design file error: %v", err)
			http.Error(w, "could not delete file", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /admin/design-files/upload-url
func UploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req struct {
			ProductID string `json:"product_id"`
			Filename  string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" || req.ProductID == "" {
			http.Error(w, "product_id and filename are required", http.StatusBadRequest)
			return
		}
		if _, err := uuid.Parse(req.ProductID); err != nil {
			http.Error(w, "invalid product_id", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedDesignFileUploadURL(req.ProductID, req.Filename)
		if err != nil {
			log.Printf("presign design file error: %v", err)
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
