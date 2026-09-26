// Package licencetypes exposes CRUD for product_licence_types (the
// Drug / Food / Cosmetic classification) plus the dashboard breakdown.
package licencetypes

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// duplicateName maps Postgres' unique-violation on name to a message that
// tells the admin what to do, instead of a bare 500.
func duplicateName(err error) bool {
	return err != nil && strings.Contains(err.Error(), "product_licence_types_name_key")
}

// GET /admin/product-licence-types
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		types, err := models.ListProductLicenceTypes(r.Context(), db)
		if err != nil {
			log.Printf("list licence types: %v", err)
			http.Error(w, "could not load licence types", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, types)
	}
}

// GET /admin/product-licence-types/breakdown — dashboard table.
func BreakdownHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := models.GetLicenceTypeBreakdown(r.Context(), db)
		if err != nil {
			log.Printf("licence type breakdown: %v", err)
			http.Error(w, "could not load breakdown", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

type upsertRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

// POST /admin/product-licence-types
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req upsertRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		id, err := models.CreateProductLicenceType(r.Context(), db, req.Name, req.Description)
		if err != nil {
			if duplicateName(err) {
				http.Error(w, "a licence type with that name already exists", http.StatusConflict)
				return
			}
			if strings.Contains(err.Error(), "name is required") {
				http.Error(w, "name is required", http.StatusBadRequest)
				return
			}
			log.Printf("create licence type: %v", err)
			http.Error(w, "could not create licence type", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

// PUT /admin/product-licence-types/{id}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req upsertRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := models.UpdateProductLicenceType(r.Context(), db, id, req.Name, req.Description); err != nil {
			if duplicateName(err) {
				http.Error(w, "a licence type with that name already exists", http.StatusConflict)
				return
			}
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "licence type not found", http.StatusNotFound)
				return
			}
			if strings.Contains(err.Error(), "name is required") {
				http.Error(w, "name is required", http.StatusBadRequest)
				return
			}
			log.Printf("update licence type: %v", err)
			http.Error(w, "could not update licence type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/product-licence-types/{id} — products keep existing, they
// just become unclassified (FK is ON DELETE SET NULL).
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		unlinked, err := models.DeleteProductLicenceType(r.Context(), db, id)
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "licence type not found", http.StatusNotFound)
				return
			}
			log.Printf("delete licence type: %v", err)
			http.Error(w, "could not delete licence type", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"products_unlinked": unlinked})
	}
}

// PUT /admin/products/{id}/licence-type — body {"licence_type_id": 2} or
// {"licence_type_id": null} to clear. Separate from the main product update
// so the dropdown saves on its own.
func SetForProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		var req struct {
			LicenceTypeID *int    `json:"licence_type_id"`
			FoodType      *string `json:"food_type"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := models.SetProductLicenceType(r.Context(), db, productID.String(), req.LicenceTypeID, req.FoodType); err != nil {
			if strings.Contains(err.Error(), "food_type must be") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "product not found", http.StatusNotFound)
				return
			}
			log.Printf("set product licence type: %v", err)
			http.Error(w, "could not save licence type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
