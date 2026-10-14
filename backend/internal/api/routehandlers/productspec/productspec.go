// Package productspec implements the config UI backend for Product
// Manufacturer Specifications (PMS): defining, per product type, a set of
// specification fields (text/boolean/dropdown) and — for dropdown fields —
// their persisted option lists.
package productspec

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
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

// POST /admin/product-specs/types/{id}/fields  { "field_name": "...", "field_type": "text|boolean|dropdown", "sort_order": 0 }
func CreateFieldHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		typeID, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid type id", http.StatusBadRequest)
			return
		}
		var req struct {
			FieldName  string `json:"field_name"`
			FieldType  string `json:"field_type"`
			SortOrder  int    `json:"sort_order"`
			IsRequired bool   `json:"is_required"`
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
		id, err := models.CreatePMSField(r.Context(), db, typeID, req.FieldName, req.FieldType, req.SortOrder, req.IsRequired)
		if err != nil {
			http.Error(w, "could not create field", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

// PATCH /admin/product-specs/fields/{id}
// Either or both of:
//
//	{ "is_required": true }                                  mandatory or not
//	{ "show_if": { "field_id": 20, "values": [true] } }      show only when…
//	{ "show_if": null }                                      always show
func UpdateFieldHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		rawRequired, hasRequired := req["is_required"]
		rawShowIf, hasShowIf := req["show_if"]
		if !hasRequired && !hasShowIf {
			http.Error(w, "send is_required and/or show_if", http.StatusBadRequest)
			return
		}

		fail := func(err error) {
			var bad *models.ErrBadCondition
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				http.Error(w, "field not found", http.StatusNotFound)
			case errors.As(err, &bad):
				http.Error(w, bad.Msg, http.StatusBadRequest)
			default:
				log.Printf("update pms field error: %v", err)
				http.Error(w, "could not update field", http.StatusInternalServerError)
			}
		}

		if hasRequired {
			var required bool
			if err := json.Unmarshal(rawRequired, &required); err != nil {
				http.Error(w, "is_required must be true or false", http.StatusBadRequest)
				return
			}
			if err := models.SetPMSFieldRequired(r.Context(), db, id, required); err != nil {
				fail(err)
				return
			}
		}
		if hasShowIf {
			var cond *struct {
				FieldID int   `json:"field_id"`
				Values  []any `json:"values"`
			}
			if err := json.Unmarshal(rawShowIf, &cond); err != nil {
				http.Error(w, "show_if must be null or {field_id, values}", http.StatusBadRequest)
				return
			}
			var controller *int
			var values []any
			if cond != nil {
				controller, values = &cond.FieldID, cond.Values
			}
			if err := models.SetPMSFieldCondition(r.Context(), db, id, controller, values); err != nil {
				fail(err)
				return
			}
		}
		w.WriteHeader(http.StatusNoContent)
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
		// mandatory fields must be filled; values of hidden fields are dropped
		specs, err := models.NormalizeSpecs(r.Context(), db, req.PMSTypeID, req.Specifications)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := models.UpdateProductSpecifications(r.Context(), db, id, req.PMSTypeID, specs); err != nil {
			http.Error(w, "could not save specifications", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/products/{id}/specifications — the product page's default
// specifications: the fields of the product form's type, and saved values.
func GetProductDefaultSpecsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		d, err := models.GetProductDefaultSpecs(r.Context(), db, id)
		if err != nil {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, d)
	}
}

// PUT /admin/products/{id}/specifications
// { "specifications": { "19": "Red", "20": true } } — keyed by field id.
// The type is taken from the product's form on the server.
func SaveProductDefaultSpecsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req struct {
			Specifications map[string]any `json:"specifications"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		err = models.SaveProductDefaultSpecs(r.Context(), db, id, req.Specifications)
		var missing *models.MissingRequiredError
		if errors.Is(err, models.ErrNoSpecTypeForForm) || errors.As(err, &missing) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Printf("save product default specs error: %v", err)
			http.Error(w, "could not save specifications", http.StatusInternalServerError)
			return
		}
		d, err := models.GetProductDefaultSpecs(r.Context(), db, id)
		if err != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, http.StatusOK, d)
	}
}
