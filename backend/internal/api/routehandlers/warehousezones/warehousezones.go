// Package warehousezones exposes CRUD for warehouse_zones (the four physical
// picking zones from the WMS SKU spec) and the form-to-zone assignment.
package warehousezones

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// badRequest maps the model's validation errors and Postgres' unique
// violations onto messages an admin can act on, rather than a bare 500.
func badRequest(w http.ResponseWriter, err error) bool {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "warehouse_zones_code_key"):
		http.Error(w, "a zone with that code already exists", http.StatusConflict)
	case strings.Contains(msg, "idx_product_forms_form_code"):
		http.Error(w, "another form already uses that form code", http.StatusConflict)
	case strings.Contains(msg, "not found"):
		http.Error(w, msg, http.StatusNotFound)
	case strings.Contains(msg, "is required"),
		strings.Contains(msg, "should be short"),
		strings.Contains(msg, "must be exactly 3 letters"):
		http.Error(w, msg, http.StatusBadRequest)
	default:
		return false
	}
	return true
}

// GET /admin/warehouse-zones — zones plus every form and its assignment, so
// the screen renders from one call.
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		zones, err := models.ListWarehouseZones(r.Context(), db)
		if err != nil {
			log.Printf("list warehouse zones: %v", err)
			http.Error(w, "could not load zones", http.StatusInternalServerError)
			return
		}
		forms, err := models.ListFormsWithZones(r.Context(), db)
		if err != nil {
			log.Printf("list forms with zones: %v", err)
			http.Error(w, "could not load product forms", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"zones": zones, "forms": forms})
	}
}

type zoneRequest struct {
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Scope       *string `json:"scope"`
	SortOrder   int     `json:"sort_order"`
}

// POST /admin/warehouse-zones
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req zoneRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		id, err := models.CreateWarehouseZone(r.Context(), db, req.Code, req.Name, req.Description, req.Scope, req.SortOrder)
		if err != nil {
			if badRequest(w, err) {
				return
			}
			log.Printf("create warehouse zone: %v", err)
			http.Error(w, "could not create zone", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

// PUT /admin/warehouse-zones/{id}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req zoneRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := models.UpdateWarehouseZone(r.Context(), db, id, req.Code, req.Name, req.Description, req.Scope, req.SortOrder); err != nil {
			if badRequest(w, err) {
				return
			}
			log.Printf("update warehouse zone: %v", err)
			http.Error(w, "could not update zone", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/warehouse-zones/{id} — forms are kept and become unassigned.
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		unassigned, err := models.DeleteWarehouseZone(r.Context(), db, id)
		if err != nil {
			if badRequest(w, err) {
				return
			}
			log.Printf("delete warehouse zone: %v", err)
			http.Error(w, "could not delete zone", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"forms_unassigned": unassigned})
	}
}

// PUT /admin/product-forms/{id}/zone — body {"zone_id": 2, "form_code": "TAB"}.
// A null zone_id unassigns the form; a null/blank form_code clears the code.
func SetFormZoneHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		formID, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product form id", http.StatusBadRequest)
			return
		}
		var req struct {
			ZoneID   *int    `json:"zone_id"`
			FormCode *string `json:"form_code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := models.SetFormZone(r.Context(), db, formID, req.ZoneID, req.FormCode); err != nil {
			if badRequest(w, err) {
				return
			}
			log.Printf("set form zone: %v", err)
			http.Error(w, "could not save zone assignment", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
