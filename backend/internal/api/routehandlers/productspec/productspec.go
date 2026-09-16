// Package productspec implements the config UI backend for Product
// Manufacturer Specifications (PMS): defining, per product type, a set of
// specification fields (text/boolean/dropdown) and — for dropdown fields —
// their persisted option lists.
package productspec

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

const defaultPageSize = 40

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// GET /admin/product-specs/types
func ListTypesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		types, err := models.ListPMSTypes(r.Context(), db)
		if err != nil {
			http.Error(w, "could not fetch product types", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, types)
	}
}

// POST /admin/product-specs/types  { "name": "Capsule" }
func CreateTypeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		id, err := models.CreatePMSType(r.Context(), db, req.Name)
		if err != nil {
			http.Error(w, "could not create product type — it may already exist", http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

// DELETE /admin/product-specs/types/{id}
func DeleteTypeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if err := models.DeletePMSType(r.Context(), db, id); err != nil {
			http.Error(w, "could not delete product type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// POST /admin/product-specs/types/{id}/fields  { "field_name": "...", "field_type": "text|boolean|dropdown", "sort_order": 0 }
func CreateFieldHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		typeID, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid type id", http.StatusBadRequest)
			return
		}
		var req struct {
			FieldName string `json:"field_name"`
			FieldType string `json:"field_type"`
			SortOrder int    `json:"sort_order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.FieldName == "" {
			http.Error(w, "field_name is required", http.StatusBadRequest)
			return
		}
		if req.FieldType != "text" && req.FieldType != "boolean" && req.FieldType != "dropdown" && req.FieldType != "image" {
			http.Error(w, `field_type must be "text", "boolean", "dropdown", or "image"`, http.StatusBadRequest)
			return
		}
		id, err := models.CreatePMSField(r.Context(), db, typeID, req.FieldName, req.FieldType, req.SortOrder)
		if err != nil {
			http.Error(w, "could not create field", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

// DELETE /admin/product-specs/fields/{id}
func DeleteFieldHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if err := models.DeletePMSField(r.Context(), db, id); err != nil {
			http.Error(w, "could not delete field", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// POST /admin/product-specs/fields/{id}/options  { "option_value": "...", "sort_order": 0 }
func CreateFieldOptionHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fieldID, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid field id", http.StatusBadRequest)
			return
		}
		var req struct {
			OptionValue string `json:"option_value"`
			SortOrder   int    `json:"sort_order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.OptionValue == "" {
			http.Error(w, "option_value is required", http.StatusBadRequest)
			return
		}
		id, err := models.CreatePMSFieldOption(r.Context(), db, fieldID, req.OptionValue, req.SortOrder)
		if err != nil {
			http.Error(w, "could not create option", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

// DELETE /admin/product-specs/options/{id}
func DeleteFieldOptionHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if err := models.DeletePMSFieldOption(r.Context(), db, id); err != nil {
			http.Error(w, "could not delete option", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/product-specs/products?page=1&pageSize=40&search=
// Backs the "assign specs to products" page — every catalog product, with
// whatever PMS type/values are already assigned.
func ListProductSpecificationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
		if pageSize < 1 || pageSize > 200 {
			pageSize = defaultPageSize
		}
		search := r.URL.Query().Get("search")
		hasSpec := r.URL.Query().Get("hasSpec")
		sortDir := r.URL.Query().Get("sortDir")

		rows, total, err := models.ListProductSpecifications(r.Context(), db, pageSize, (page-1)*pageSize, search, hasSpec, sortDir)
		if err != nil {
			http.Error(w, "could not fetch product specifications", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"rows":     rows,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		})
	}
}

// GET /admin/product-specs/products/by-name?name=...
// Exact (case/whitespace-insensitive) name lookup — used by the "New
// Purchase Order" form to preview a product's assigned spec before it's
// snapshotted onto the PO. Returns null if there's no matching product or
// it has no spec assigned, not a 404 — that's the normal case for most
// typed-in product names.
func GetProductSpecByNameHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}
		row, err := models.GetProductSpecByName(r.Context(), db, name)
		if err != nil {
			http.Error(w, "could not look up product specification", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, row)
	}
}

// POST /admin/product-specs/upload-url  { "filename": "..." }
// Presigned S3 URL for an "image" type specification field's value. The
// client PUTs the file directly to S3 and stores the returned key as the
// field's value (same JSON shape as any other field type).
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

		writeJSON(w, http.StatusOK, map[string]string{
			"upload_url": uploadURL,
			"key":        key,
			"image_url":  utils.GetPublicURL(key),
		})
	}
}

// PATCH /admin/product-specs/products/{id}
// { "pms_type_id": 1, "specifications": { "3": "Red", "4": true } }
// specifications is keyed by pms_fields.id (as a string).
func UpdateProductSpecificationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req struct {
			PMSTypeID      *int            `json:"pms_type_id"`
			Specifications json.RawMessage `json:"specifications"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if err := models.UpdateProductSpecifications(r.Context(), db, id, req.PMSTypeID, req.Specifications); err != nil {
			http.Error(w, "could not save specifications", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
