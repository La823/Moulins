// Package productspec implements the config UI backend for Product
// Manufacturer Specifications (PMS): defining, per product type, a set of
// specification fields (text/boolean/dropdown) and — for dropdown fields —
// their persisted option lists.
package productspec

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

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
		if req.FieldType != "text" && req.FieldType != "boolean" && req.FieldType != "dropdown" {
			http.Error(w, `field_type must be "text", "boolean", or "dropdown"`, http.StatusBadRequest)
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
