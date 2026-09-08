// Package warehouse serves the ported warehouse-layout-editor's persistence
// API — a thin CRUD layer over whole layouts stored as JSONB, mirroring the
// standalone editor's server/persistence.py one-for-one (see
// backend/internal/models/warehouseLayoutModel.go). The editor's own
// client-side validateLayout() is trusted on write, same as other endpoints.
package warehouse

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// GET /admin/warehouse/layouts
func ListLayoutsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		layouts, err := models.ListWarehouseLayouts(r.Context(), db)
		if err != nil {
			log.Printf("list warehouse layouts error: %v", err)
			http.Error(w, "could not fetch layouts", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(layouts)
	}
}

// GET /admin/warehouse/layouts/{name}
func GetLayoutHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		data, err := models.GetWarehouseLayout(r.Context(), db, name)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "layout not found", http.StatusNotFound)
				return
			}
			log.Printf("get warehouse layout error: %v", err)
			http.Error(w, "could not fetch layout", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	}
}

// PUT /admin/warehouse/layouts/{name} — body is the raw db_connect JSON the
// editor already exports; schema_version comes from body.editor.schemaVersion,
// same field persistence.py's save() reads it from.
func SaveLayoutHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "could not read request body", http.StatusBadRequest)
			return
		}

		var meta struct {
			Editor struct {
				SchemaVersion int `json:"schemaVersion"`
			} `json:"editor"`
		}
		if err := json.Unmarshal(body, &meta); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.SaveWarehouseLayout(r.Context(), db, name, meta.Editor.SchemaVersion, body); err != nil {
			log.Printf("save warehouse layout error: %v", err)
			http.Error(w, "could not save layout", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/warehouse/layouts/{name}
func DeleteLayoutHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		if err := models.DeleteWarehouseLayout(r.Context(), db, name); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "layout not found", http.StatusNotFound)
				return
			}
			log.Printf("delete warehouse layout error: %v", err)
			http.Error(w, "could not delete layout", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/warehouse/bin-types — the persistent bin-type library, shared
// across every layout (unlike a layout's own binTypes, which only apply to
// that one layout).
func ListBinTypesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		types, err := models.ListWarehouseBinTypes(r.Context(), db)
		if err != nil {
			log.Printf("list warehouse bin types error: %v", err)
			http.Error(w, "could not fetch bin types", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(types)
	}
}

// PUT /admin/warehouse/bin-types/{name} — body is {w, d, h, color}.
func SaveBinTypeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]

		var body struct {
			Width  float64 `json:"w"`
			Depth  float64 `json:"d"`
			Height float64 `json:"h"`
			Color  string  `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		t := models.WarehouseBinType{Name: name, Width: body.Width, Depth: body.Depth, Height: body.Height, Color: body.Color}
		if err := models.SaveWarehouseBinType(r.Context(), db, t); err != nil {
			log.Printf("save warehouse bin type error: %v", err)
			http.Error(w, "could not save bin type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/warehouse/bin-types/{name}
func DeleteBinTypeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		if err := models.DeleteWarehouseBinType(r.Context(), db, name); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "bin type not found", http.StatusNotFound)
				return
			}
			log.Printf("delete warehouse bin type error: %v", err)
			http.Error(w, "could not delete bin type", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/warehouse/layouts/{name}/assignments — every product assigned
// to a bin or pallet within this one layout.
func ListAssignmentsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		layoutName := mux.Vars(r)["name"]
		assignments, err := models.ListWarehouseBinAssignments(r.Context(), db, layoutName)
		if err != nil {
			log.Printf("list warehouse bin assignments error: %v", err)
			http.Error(w, "could not fetch assignments", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(assignments)
	}
}

// PUT /admin/warehouse/layouts/{name}/assignments/{locationType}/{locationKey}/{slot}
// — body is {product_id}. locationType is "bin" or "pallet"; slot is "L",
// "R", or "A" (pallets always use "A").
func SaveAssignmentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		layoutName := vars["name"]
		locationType := vars["locationType"]
		locationKey := vars["locationKey"]
		slot := vars["slot"]

		if locationType != "bin" && locationType != "pallet" {
			http.Error(w, `location type must be "bin" or "pallet"`, http.StatusBadRequest)
			return
		}
		if slot != "L" && slot != "R" && slot != "A" {
			http.Error(w, `slot must be "L", "R", or "A"`, http.StatusBadRequest)
			return
		}

		var body struct {
			ProductID string `json:"product_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		productID, err := uuid.Parse(body.ProductID)
		if err != nil {
			http.Error(w, "product_id must be a valid UUID", http.StatusBadRequest)
			return
		}

		if err := models.SaveWarehouseBinAssignment(r.Context(), db, layoutName, locationType, locationKey, slot, productID); err != nil {
			log.Printf("save warehouse bin assignment error: %v", err)
			http.Error(w, "could not save assignment", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/warehouse/layouts/{name}/assignments/{locationType}/{locationKey}/{slot}
func DeleteAssignmentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		layoutName := vars["name"]
		locationType := vars["locationType"]
		locationKey := vars["locationKey"]
		slot := vars["slot"]

		if err := models.DeleteWarehouseBinAssignment(r.Context(), db, layoutName, locationType, locationKey, slot); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "no assignment at that location", http.StatusNotFound)
				return
			}
			log.Printf("delete warehouse bin assignment error: %v", err)
			http.Error(w, "could not delete assignment", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
