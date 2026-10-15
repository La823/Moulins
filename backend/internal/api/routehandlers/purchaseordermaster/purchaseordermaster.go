// Package purchaseordermaster serves the master purchase-order list —
// originally a one-off import of the old "Moulins" tracking sheet
// (migration 108), and now also where new POs are created directly
// (CreateHandler), continuing the same sr_no/po_number sequence.
package purchaseordermaster

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/mailer"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

const defaultPageSize = 40

// GET /admin/purchase-order-master?page=1&pageSize=40
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
		if pageSize < 1 || pageSize > 200 {
			pageSize = defaultPageSize
		}
		sortColumn := r.URL.Query().Get("sortBy")
		sortDir := r.URL.Query().Get("sortDir")
		search := r.URL.Query().Get("search")
		poNumber := r.URL.Query().Get("poNumber")
		hasProductCode := r.URL.Query().Get("hasProductCode")
		status := r.URL.Query().Get("status")

		rows, total, err := models.ListPurchaseOrderMaster(r.Context(), db, pageSize, (page-1)*pageSize, sortColumn, sortDir, search, poNumber, hasProductCode, status)
		if err != nil {
			log.Printf("list purchase order master error: %v", err)
			http.Error(w, "could not fetch purchase order master list", http.StatusInternalServerError)
			return
		}

		missingProductCode, err := models.CountMissingProductCode(r.Context(), db)
		if err != nil {
			log.Printf("count missing product code error: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"rows":               rows,
			"total":              total,
			"page":               page,
			"pageSize":           pageSize,
			"missingProductCode": missingProductCode,
		})
	}
}

// GET /admin/purchase-order-master/specifications?page=1&pageSize=40&search=
// Backs the PO Specifications page — a trimmed row set (id/po_number/
// product_name/company/pms_type_id/specifications) rather than the full
// master-list columns.
func ListSpecificationsHandler(db *pgxpool.Pool) http.HandlerFunc {
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

		rows, total, err := models.ListPOSpecifications(r.Context(), db, pageSize, (page-1)*pageSize, search)
		if err != nil {
			log.Printf("list PO specifications error: %v", err)
			http.Error(w, "could not fetch PO specifications", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"rows":     rows,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		})
	}
}

// PATCH /admin/purchase-order-master/{id}/specifications
// { "pms_type_id": 1, "specifications": { "3": "Red", "4": true } }
// specifications is keyed by pms_fields.id (as a string, since JSON object
// keys are always strings) — the frontend renders whichever fields belong
// to the chosen pms_type_id and reads/writes this blob by field id.
func UpdateSpecificationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
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
		// the field rules apply to a PO's own specifications too: mandatory
		// fields filled, hidden fields' values dropped
		specs, err := models.NormalizeSpecs(r.Context(), db, req.PMSTypeID, req.Specifications)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := models.UpdatePOSpecifications(r.Context(), db, id, req.PMSTypeID, specs); err != nil {
			log.Printf("update PO specifications error: %v", err)
			http.Error(w, "could not save specifications", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/purchase-order-master/active?limit=10
// Used by the /panel/purchase-orders overview page to show what's currently
// open — every PO defaults to status "Active" on creation.
func ListActiveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 100 {
			limit = 10
		}

		rows, total, err := models.ListActivePurchaseOrders(r.Context(), db, limit)
		if err != nil {
			log.Printf("list active purchase orders error: %v", err)
			http.Error(w, "could not fetch active purchase orders", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"rows":  rows,
			"total": total,
		})
	}
}

// POST /admin/purchase-order-master — create a new PO directly in the
// master list (see CreatePurchaseOrderInMaster).
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateMasterPORequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ManufacturerID == uuid.Nil {
			http.Error(w, "manufacturer_id is required", http.StatusBadRequest)
			return
		}
		if req.ProductName == "" {
			http.Error(w, "product_name is required", http.StatusBadRequest)
			return
		}
		if req.PODate == "" {
			http.Error(w, "po_date is required", http.StatusBadRequest)
			return
		}

		// a catalog pick is recorded under the product's own name
		if req.CatalogProductID != nil {
			if p, err := models.GetCatalogProductForPO(r.Context(), db, *req.CatalogProductID); err == nil {
				req.ProductName = p.Name
			}
		}

		id, poNumber, err := models.CreatePurchaseOrderInMaster(r.Context(), db, req)
		if err != nil {
			var missing *models.MissingRequiredError
			if errors.As(err, &missing) || errors.Is(err, models.ErrCatalogProductNotFound) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			log.Printf("create master PO error: %v", err)
			http.Error(w, "could not create purchase order", http.StatusInternalServerError)
			return
		}

		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), &poNumber, "created", nil, &req.ProductName, actorID(r))

		resp := map[string]any{
			"id":        id,
			"po_number": poNumber,
		}
		// "Also save as this product's defaults" — after the PO, so a
		// problem here never loses the PO; reported back instead.
		if req.SaveSpecsAsDefault && req.CatalogProductID != nil {
			values := map[string]any{}
			if len(req.PMSSpecifications) > 0 && string(req.PMSSpecifications) != "null" {
				_ = json.Unmarshal(req.PMSSpecifications, &values)
			}
			if err := models.SaveProductDefaultSpecs(r.Context(), db, *req.CatalogProductID, values); err != nil {
				log.Printf("create master PO: save default specs error: %v", err)
				resp["default_specs_saved"] = false
				resp["default_specs_error"] = err.Error()
			} else {
				resp["default_specs_saved"] = true
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(resp)
	}
}

// GET /admin/purchase-order-master/catalog-products?search=&limit=
// The create-PO page's product dropdown: catalog products only.
func CatalogProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		list, err := models.SearchCatalogProductsForPO(r.Context(), db, r.URL.Query().Get("search"), limit)
		if err != nil {
			log.Printf("catalog products for PO error: %v", err)
			http.Error(w, "could not search products", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/purchase-order-master/catalog-products/{productId}
// One catalog product with its specifications (its form's fields and the
// product's default values) for the create-PO page.
func CatalogProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		p, err := models.GetCatalogProductForPO(r.Context(), db, productID)
		if err != nil {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}
		specs, err := models.GetProductDefaultSpecs(r.Context(), db, productID)
		if err != nil {
			log.Printf("catalog product specs for PO error: %v", err)
			http.Error(w, "could not load the product's specifications", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"product": p, "specs": specs})
	}
}

// PUT /admin/purchase-order-master/catalog-products/{productId}/specifications
// { "specifications": { "28": true, "30": "Bottle" } } — the create-PO
// page's "Save as product's default": updates the product's default
// specifications straight away (same rules as the product page: its form's
// fields only, mandatory ones filled, hidden ones dropped).
func SaveCatalogProductSpecsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		var req struct {
			Specifications map[string]any `json:"specifications"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		err = models.SaveProductDefaultSpecs(r.Context(), db, productID, req.Specifications)
		var missing *models.MissingRequiredError
		if errors.Is(err, models.ErrNoSpecTypeForForm) || errors.As(err, &missing) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Printf("save catalog product specs from PO page error: %v", err)
			http.Error(w, "could not save the product's default specifications", http.StatusInternalServerError)
			return
		}
		specs, err := models.GetProductDefaultSpecs(r.Context(), db, productID)
		if err != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(specs)
	}
}

// POST /admin/purchase-order-master/{id}/revise — create a revised PO that
// supersedes {id}, keeping the same po_number but bumping revision_number,
// instead of editing the row in place. Any field omitted from the body
// carries over unchanged from the row being revised.
func ReviseHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req models.ReviseMasterPORequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		newID, poNumber, revisionNumber, err := models.CreatePORevision(r.Context(), db, id, req, actorID(r))
		if err != nil {
			log.Printf("create PO revision error: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(newID), &poNumber, "revised", strPtr(fmt.Sprintf("revision %d (id %d)", revisionNumber-1, id)), strPtr(fmt.Sprintf("revision %d (id %d)", revisionNumber, newID)), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]any{
			"id":              newID,
			"po_number":       poNumber,
			"revision_number": revisionNumber,
		})
	}
}

// GET /admin/purchase-order-master/{id}/revisions — every row sharing this
// PO's po_number (oldest first), for a "Revision History" panel.
func RevisionsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var poNumber *string
		if err := db.QueryRow(r.Context(), "SELECT po_number FROM purchase_order_master WHERE id = $1", id).Scan(&poNumber); err != nil {
			http.Error(w, "purchase order not found", http.StatusNotFound)
			return
		}
		if poNumber == nil || *poNumber == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]models.PurchaseOrderMasterRow{})
			return
		}

		rows, err := models.GetPORevisionHistory(r.Context(), db, *poNumber)
		if err != nil {
			log.Printf("get PO revision history error: %v", err)
			http.Error(w, "could not fetch revision history", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rows)
	}
}

// GET /admin/purchase-order-master/product-names?search=para&limit=15
func SearchProductNamesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := r.URL.Query().Get("search")
		if search == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]string{})
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 50 {
			limit = 15
		}

		names, err := models.SearchMasterProductNames(r.Context(), db, search, limit)
		if err != nil {
			log.Printf("search master product names error: %v", err)
			http.Error(w, "could not search product names", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(names)
	}
}

func actorID(r *http.Request) *uuid.UUID {
	id, err := uuid.Parse(r.Context().Value("user_id").(string))
	if err != nil {
		return nil
	}
	return &id
}

// unitName looks up a unit's display name for a readable log entry;
// returns the raw id string if the lookup fails so nothing is lost.
func unitName(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) string {
	var name string
	if err := db.QueryRow(ctx, "SELECT name FROM units WHERE id = $1", id).Scan(&name); err != nil {
		return id.String()
	}
	return name
}

// PATCH /admin/purchase-order-master/{id}/mrp-unit
// Body: {"mrp_unit_id": "<uuid>" | null}
func UpdateMrpUnitHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			MrpUnitID *string `json:"mrp_unit_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var unitID *uuid.UUID
		if req.MrpUnitID != nil && *req.MrpUnitID != "" {
			parsed, err := uuid.Parse(*req.MrpUnitID)
			if err != nil {
				http.Error(w, "invalid mrp_unit_id", http.StatusBadRequest)
				return
			}
			unitID = &parsed
		}

		var oldUnitID *uuid.UUID
		var poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT mrp_unit_id, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldUnitID, &poNumber)

		if err := models.UpdatePurchaseOrderMasterMrpUnit(r.Context(), db, id, unitID); err != nil {
			log.Printf("update purchase order master mrp unit error: %v", err)
			http.Error(w, "could not update mrp unit", http.StatusInternalServerError)
			return
		}

		if (oldUnitID == nil) != (unitID == nil) || (oldUnitID != nil && unitID != nil && *oldUnitID != *unitID) {
			var oldName, newName *string
			if oldUnitID != nil {
				n := unitName(r.Context(), db, *oldUnitID)
				oldName = &n
			}
			if unitID != nil {
				n := unitName(r.Context(), db, *unitID)
				newName = &n
			}
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "mrp_unit", oldName, newName, actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PATCH /admin/purchase-order-master/{id}/product-code
// Body: {"product_code": "ABC123" | null}
func UpdateProductCodeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			ProductCode *string `json:"product_code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var oldCode, oldName, oldComposition, poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT product_code, product_name, composition, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldCode, &oldName, &oldComposition, &poNumber)

		if err := models.UpdatePurchaseOrderMasterProductCode(r.Context(), db, id, req.ProductCode); err != nil {
			log.Printf("update purchase order master product code error: %v", err)
			http.Error(w, "could not update product code", http.StatusInternalServerError)
			return
		}

		newCode := req.ProductCode
		if newCode != nil && *newCode == "" {
			newCode = nil
		}
		oldVal := ""
		if oldCode != nil {
			oldVal = *oldCode
		}
		newVal := ""
		if newCode != nil {
			newVal = *newCode
		}
		if oldVal != newVal {
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "product_code", oldCode, newCode, actorID(r))
		}

		resp := map[string]any{"status": "updated"}

		// A code that matches a catalog product auto-fills the product's name
		// and composition onto this row too — that's the point of tagging a
		// code in the first place, so the two stay in sync with the catalog.
		if newVal != "" {
			matched, err := models.LookupProductByMargCode(r.Context(), db, newVal)
			if err != nil {
				log.Printf("lookup product by marg code error: %v", err)
			} else if matched != nil {
				if err := models.UpdatePurchaseOrderMasterProductName(r.Context(), db, id, matched.Name); err != nil {
					log.Printf("auto-update product name from code error: %v", err)
				} else {
					oldNameVal := ""
					if oldName != nil {
						oldNameVal = *oldName
					}
					if oldNameVal != matched.Name {
						models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "product_name", oldName, &matched.Name, actorID(r))
					}
					resp["product_name"] = matched.Name
				}

				if err := models.UpdatePurchaseOrderMasterComposition(r.Context(), db, id, matched.KeyIngredients); err != nil {
					log.Printf("auto-update composition from code error: %v", err)
				} else {
					oldCompVal := ""
					if oldComposition != nil {
						oldCompVal = *oldComposition
					}
					newCompVal := ""
					if matched.KeyIngredients != nil {
						newCompVal = *matched.KeyIngredients
					}
					if oldCompVal != newCompVal {
						models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "composition", oldComposition, matched.KeyIngredients, actorID(r))
					}
					resp["composition"] = matched.KeyIngredients
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// PATCH /admin/purchase-order-master/{id}/composition
// Body: {"composition": "..." | null}
func UpdateCompositionHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			Composition *string `json:"composition"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var oldComposition, poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT composition, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldComposition, &poNumber)

		if err := models.UpdatePurchaseOrderMasterComposition(r.Context(), db, id, req.Composition); err != nil {
			log.Printf("update purchase order master composition error: %v", err)
			http.Error(w, "could not update composition", http.StatusInternalServerError)
			return
		}

		newComposition := req.Composition
		if newComposition != nil && *newComposition == "" {
			newComposition = nil
		}
		oldVal := ""
		if oldComposition != nil {
			oldVal = *oldComposition
		}
		newVal := ""
		if newComposition != nil {
			newVal = *newComposition
		}
		if oldVal != newVal {
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "composition", oldComposition, newComposition, actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PATCH /admin/purchase-order-master/{id}/product-name
// Body: {"product_name": "..."}
func UpdateProductNameHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			ProductName string `json:"product_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ProductName == "" {
			http.Error(w, "product_name is required", http.StatusBadRequest)
			return
		}

		var oldName, poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT product_name, po_number FROM purchase_order_master WHERE id = $1", id).Scan(&oldName, &poNumber)

		if err := models.UpdatePurchaseOrderMasterProductName(r.Context(), db, id, req.ProductName); err != nil {
			log.Printf("update purchase order master product name error: %v", err)
			http.Error(w, "could not update product name", http.StatusInternalServerError)
			return
		}

		if oldName == nil || *oldName != req.ProductName {
			models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "product_name", oldName, &req.ProductName, actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// GET /admin/purchase-order-master/{id}/logs
func LogsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		if _, err := strconv.Atoi(id); err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		entries, err := models.ListPOLogsForOrder(r.Context(), db, models.POSourceMaster, id)
		if err != nil {
			log.Printf("list purchase order master logs error: %v", err)
			http.Error(w, "could not fetch logs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(entries)
	}
}

// poDoc is one manufacturer PO as it reads on paper — every value already
// resolved to the text that goes on the PDF and in the email, so the two
// can never disagree.
type poDoc struct {
	PoNumber     string
	PoDate       string // "2026-10-13"
	ProductName  string
	Composition  string // salts and strength
	Packing      string // e.g. "10*10 Blister" (the row's specifications)
	Type         string
	Company      string
	Quantity     int
	QuantityText string
	MRPText      string // "Rs. 161.84 Per Strip", "Rs. 225/STRIP", "DPCO"
	RateText     string // "Rs. 52.00", "" when not set
}

// loadPODoc reads a master row and resolves it for print.
//
// Composition: the row's own when filled in; otherwise the catalogue
// product's, found by the row's product code. Never guessed from the name —
// a wrong composition on a PO is worse than a blank one. Packing is never
// used in its place (that was the bug that printed "10*10 Blister" as the
// composition).
func loadPODoc(ctx context.Context, db *pgxpool.Pool, id int) (*poDoc, error) {
	var (
		poNumber, poDate, productName, productCode, composition *string
		mrp, specifications, typ, company                       *string
		unit                                                    *string
		quantity, rate                                          *float64
	)
	err := db.QueryRow(ctx,
		`SELECT po_number, po_date::text, product_name, product_code, composition, quantity, mrp, rate,
		        specifications, type, company,
		        (SELECT name FROM units WHERE id = pom.mrp_unit_id)
		 FROM purchase_order_master pom WHERE id = $1`, id,
	).Scan(&poNumber, &poDate, &productName, &productCode, &composition, &quantity, &mrp, &rate,
		&specifications, &typ, &company, &unit)
	if err != nil {
		return nil, err
	}

	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return strings.TrimSpace(*p)
	}
	d := &poDoc{
		PoNumber:    str(poNumber),
		PoDate:      str(poDate),
		ProductName: str(productName),
		Composition: str(composition),
		Packing:     str(specifications),
		Type:        str(typ),
		Company:     str(company),
	}

	if d.Composition == "" && str(productCode) != "" {
		if p, err := models.LookupProductByMargCode(ctx, db, str(productCode)); err != nil {
			log.Printf("po doc: composition lookup by code error: %v", err)
		} else if p != nil && p.KeyIngredients != nil {
			d.Composition = strings.TrimSpace(*p.KeyIngredients)
		}
	}

	if quantity != nil {
		d.Quantity = int(*quantity)
		d.QuantityText = strconv.FormatFloat(*quantity, 'f', -1, 64)
	}
	if rate != nil {
		d.RateText = fmt.Sprintf("Rs. %.2f", *rate)
	}
	d.MRPText = mrpText(str(mrp), str(unit))
	return d, nil
}

// mrpText renders a stored MRP for print. Stored MRPs are free text —
// "161.84", "225/STRIP", "45/sachet", "DPCO" — so a number gets "Rs." and
// two decimals plus its unit when one is set, anything else is kept as
// written (with "Rs." in front when it starts with an amount). Parsing
// failures used to print "Rs. 0.00".
func mrpText(raw, unit string) string {
	if raw == "" {
		return ""
	}
	if v, err := strconv.ParseFloat(raw, 64); err == nil {
		if unit != "" {
			return fmt.Sprintf("Rs. %.2f %s", v, unit)
		}
		return fmt.Sprintf("Rs. %.2f", v)
	}
	if raw[0] >= '0' && raw[0] <= '9' {
		return "Rs. " + raw
	}
	return raw
}

func (d *poDoc) pdf() ([]byte, error) {
	return utils.GeneratePOPDF(utils.POPDFData{
		PONumber:         d.PoNumber,
		Date:             d.PoDate,
		ManufacturerName: d.Company,
		CompanyName:      d.Company,
		ProductName:      d.ProductName,
		Composition:      d.Composition,
		Packing:          d.Packing,
		Type:             d.Type,
		Quantity:         d.Quantity,
		MRPText:          d.MRPText,
		RateText:         d.RateText,
		// Category ("3rd Party", "Ortho") and Remarks ("OK PROCEED", "HOLD",
		// "Track final design") are internal tracking, not for the
		// manufacturer — this PDF is the one they receive.
	})
}

func (d *poDoc) pdfFileName() string {
	name := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, d.PoNumber)
	if name == "" {
		name = "purchase-order"
	}
	return "PO-" + name + ".pdf"
}

// GET /admin/purchase-order-master/{id}/pdf — printable PDF of this
// manufacturer PO; the same file the send-mail action attaches.
func PDFHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		doc, err := loadPODoc(r.Context(), db, id)
		if err != nil {
			http.Error(w, "purchase order not found", http.StatusNotFound)
			return
		}
		pdfBytes, err := doc.pdf()
		if err != nil {
			log.Printf("po pdf generation error: %v", err)
			http.Error(w, "could not generate PDF", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%s", doc.pdfFileName()))
		w.Write(pdfBytes)
	}
}

// formatPODate turns "2026-10-13" into "13 Oct 2026" for the email.
func formatPODate(d string) string {
	t, err := time.Parse("2006-01-02", d)
	if err != nil {
		return d
	}
	return t.Format("2 Jan 2006")
}

// buildPOMailBody writes the manufacturer email: a short covering letter
// pointing at the attached PO, the order at a glance, what to reply with,
// the standing notes from the PO, and a proper signature. Inline styles and
// a table layout only — mail clients ignore stylesheets.
func buildPOMailBody(d *poDoc, attachmentName string) (subject, body string) {
	subject = "Purchase Order " + d.PoNumber
	if d.ProductName != "" {
		subject += " - " + d.ProductName
	}
	subject += " | Moulins Pharmaceuticals"

	e := html.EscapeString
	row := func(label, value string) string {
		if strings.TrimSpace(value) == "" {
			return ""
		}
		return fmt.Sprintf(`<tr>
  <td style="padding:9px 14px;border-bottom:1px solid #eef0f3;color:#6b7280;font-size:13px;width:150px;vertical-align:top;">%s</td>
  <td style="padding:9px 14px;border-bottom:1px solid #eef0f3;color:#111827;font-size:14px;vertical-align:top;">%s</td>
</tr>`, e(label), e(value))
	}

	var rows strings.Builder
	rows.WriteString(row("Product", d.ProductName))
	rows.WriteString(row("Composition", d.Composition))
	rows.WriteString(row("Packing", d.Packing))
	rows.WriteString(row("Type", d.Type))
	rows.WriteString(row("Quantity", d.QuantityText))
	rows.WriteString(row("M.R.P", d.MRPText))
	rows.WriteString(row("Rate", d.RateText))
	// no Category / Remarks: internal tracking, see poDoc.pdf
	dated := ""
	if d.PoDate != "" {
		dated = " dated <strong>" + e(formatPODate(d.PoDate)) + "</strong>"
	}
	greeting := "Dear Sir/Madam,"
	if d.Company != "" {
		greeting = "Dear " + e(d.Company) + " team,"
	}

	body = fmt.Sprintf(`<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.55;max-width:640px;">
<p style="margin:0 0 14px;font-size:14px;">%s</p>
<p style="margin:0 0 14px;font-size:14px;">Please find attached our Purchase Order <strong>%s</strong>%s. The details are summarised below for your reference.</p>

<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%%;max-width:600px;border:1px solid #e5e7eb;border-radius:6px;">
<tr><td colspan="2" style="padding:10px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:bold;color:#374151;">P.O. %s</td></tr>
%s
</table>

<p style="margin:18px 0 6px;font-size:14px;">Kindly:</p>
<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;">
  <li>confirm receipt of this order, and</li>
  <li>share the expected dispatch date.</li>
</ul>

<p style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>Please note:</strong></p>
<ul style="margin:0 0 18px;padding-left:20px;font-size:13px;color:#374151;">
  <li>No change in the design or colour of the artwork will be accepted for repeat orders.</li>
  <li>No variation will be accepted in the strength of the carton or foil.</li>
  <li>Any change in MRP or rate must be informed before the order is processed.</li>
</ul>

<p style="margin:0 0 2px;font-size:14px;">Thanks &amp; regards,</p>
<p style="margin:0;font-size:14px;"><strong>Moulins Pharmaceuticals Pvt. Ltd.</strong></p>
<p style="margin:0;font-size:13px;color:#4b5563;">Plot No. 363, 1st Floor, Industrial Area, Phase II, Panchkula, Haryana 134113</p>
<p style="margin:0;font-size:13px;color:#4b5563;">Contact: 98155 35304, 98780 20363</p>

<p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">Attachment: %s</p>
</div>`,
		greeting, e(d.PoNumber), dated, e(d.PoNumber), rows.String(), e(attachmentName))
	return subject, body
}

// POST /admin/purchase-order-master/{id}/send-mail
// Emails the PO — a covering letter with the PO PDF attached — to every
// address on file for the manufacturer named in the row's `company` column. 400 if there's no manufacturer match
// or it has no emails; the send itself is logged like any other field
// change for an audit trail.
func SendMailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		doc, err := loadPODoc(r.Context(), db, id)
		if err != nil {
			http.Error(w, "purchase order not found", http.StatusNotFound)
			return
		}
		if doc.Company == "" {
			http.Error(w, "this purchase order has no manufacturer set", http.StatusBadRequest)
			return
		}

		mfr, err := models.GetManufacturerByName(r.Context(), db, doc.Company)
		if err != nil {
			log.Printf("send PO mail: manufacturer lookup error: %v", err)
			http.Error(w, "could not look up manufacturer", http.StatusInternalServerError)
			return
		}
		if mfr == nil {
			http.Error(w, fmt.Sprintf("no manufacturer record matches %q", doc.Company), http.StatusBadRequest)
			return
		}
		emails := make([]string, 0, len(mfr.Emails))
		for _, e := range mfr.Emails {
			if strings.TrimSpace(e) != "" {
				emails = append(emails, strings.TrimSpace(e))
			}
		}
		if len(emails) == 0 {
			http.Error(w, fmt.Sprintf("%s has no email address on file", mfr.Name), http.StatusBadRequest)
			return
		}

		// The PO itself goes with the email — the same PDF the PDF button
		// downloads. No PDF, no send: a PO email without its PO is the
		// thing this replaced.
		pdfBytes, err := doc.pdf()
		if err != nil {
			log.Printf("send PO mail: pdf generation error: %v", err)
			http.Error(w, "could not generate the PO PDF to attach", http.StatusInternalServerError)
			return
		}
		attachment := mailer.Attachment{Name: doc.pdfFileName(), ContentType: "application/pdf", Content: pdfBytes}

		subject, body := buildPOMailBody(doc, attachment.Name)
		messageID, conversationID, internetMessageID, err := mailer.SendMultipleTracked(r.Context(), mailer.ConfigFromEnv(), emails, subject, body, attachment)
		if err != nil {
			log.Printf("send PO mail: send failed: %v", err)
			http.Error(w, "could not send email", http.StatusInternalServerError)
			return
		}

		poNumber := &doc.PoNumber
		if doc.PoNumber == "" {
			poNumber = nil
		}
		if err := models.RecordPurchaseOrderEmail(r.Context(), db, id, poNumber, messageID, conversationID, internetMessageID, emails, subject, body, actorID(r)); err != nil {
			log.Printf("send PO mail: record email error: %v", err)
		}
		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "email_sent", nil, strPtr(strings.Join(emails, ", ")), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"status": "sent", "sent_to": emails})
	}
}

// GET /admin/purchase-order-master/{id}/emails
// Returns every email recorded as sent for this PO, each with any replies
// found live in the mailbox for its conversation (if the send was tracked
// and mail reading is configured). A per-email reply lookup failure doesn't
// fail the whole request — it's reported inline on that email instead, so
// one broken conversation lookup doesn't hide the others.
func GetEmailsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		sent, err := models.ListPurchaseOrderEmails(r.Context(), db, id)
		if err != nil {
			log.Printf("list purchase order emails error: %v", err)
			http.Error(w, "could not fetch emails", http.StatusInternalServerError)
			return
		}

		outgoingReplies, err := models.ListOutgoingRepliesForPO(r.Context(), db, id)
		if err != nil {
			log.Printf("list outgoing PO replies error: %v", err)
		}
		// Keyed by the Graph message id each outgoing reply answered, so it
		// can be merged into the right inbound reply's thread below.
		outgoingByMessageID := map[string][]models.PurchaseOrderEmail{}
		for _, o := range outgoingReplies {
			if o.InReplyToMessageID == nil {
				continue
			}
			outgoingByMessageID[*o.InReplyToMessageID] = append(outgoingByMessageID[*o.InReplyToMessageID], o)
		}

		cfg := mailer.ConfigFromEnv()
		type emailWithReplies struct {
			models.PurchaseOrderEmail
			Replies    []mailer.ConversationMessage `json:"replies"`
			ReplyError string                       `json:"reply_error,omitempty"`
		}
		// sent is ordered most-recent-first; the subject/timing fallback only
		// looks for replies received between its own send time and the next
		// (more recent) send, so a reply gets attributed to the send it was
		// actually answering rather than showing up under every prior send
		// to the same PO too — the internet_message_id path doesn't need
		// that windowing since it's a hard match.
		result := make([]emailWithReplies, 0, len(sent))
		for i, e := range sent {
			item := emailWithReplies{PurchaseOrderEmail: e}

			if e.InternetMessageID != nil && *e.InternetMessageID != "" {
				messages, err := mailer.FetchRepliesByInReplyTo(r.Context(), cfg, *e.InternetMessageID)
				if err != nil {
					item.ReplyError = err.Error()
				} else {
					item.Replies = messages
				}
			} else if e.Subject != nil && *e.Subject != "" {
				// Fallback for emails sent before internet_message_id
				// tracking was added.
				var before time.Time
				if i > 0 {
					before = sent[i-1].SentAt
				}
				messages, err := mailer.FetchRepliesBySubject(r.Context(), cfg, *e.Subject, e.SentAt, before)
				if err != nil {
					item.ReplyError = err.Error()
				} else {
					item.Replies = messages
				}
			}

			// Merge in our own persisted replies to whichever inbound
			// messages we just found — each one answered a specific Graph
			// message id, so it slots in after that message rather than
			// anywhere else in the thread.
			for _, inbound := range item.Replies {
				for _, o := range outgoingByMessageID[inbound.ID] {
					body := ""
					if o.Body != nil {
						body = *o.Body
					}
					item.Replies = append(item.Replies, mailer.ConversationMessage{
						ID:               fmt.Sprintf("reply-%d", o.ID),
						From:             cfg.Sender,
						ReceivedDateTime: o.SentAt,
						BodyPreview:      body,
						IsFromSender:     true,
					})
				}
			}
			sort.Slice(item.Replies, func(a, b int) bool {
				return item.Replies[a].ReceivedDateTime.Before(item.Replies[b].ReceivedDateTime)
			})

			result = append(result, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func strPtr(s string) *string { return &s }

// POST /admin/purchase-order-master/{id}/emails/reply
// Body: {"message_id": "<Graph id of the reply being answered>", "body": "..."}
// Sends via Graph's /reply action against that specific message, which
// keeps it correctly threaded (In-Reply-To/References set by Graph itself)
// without any tracking-token juggling on our side.
func ReplyToEmailHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			MessageID string `json:"message_id"`
			Body      string `json:"body"`
			To        string `json:"to"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.MessageID == "" {
			http.Error(w, "message_id is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Body) == "" {
			http.Error(w, "body is required", http.StatusBadRequest)
			return
		}

		if err := mailer.ReplyToMessage(r.Context(), mailer.ConfigFromEnv(), req.MessageID, req.Body); err != nil {
			log.Printf("reply to PO email error: %v", err)
			http.Error(w, "could not send reply", http.StatusInternalServerError)
			return
		}

		var poNumber *string
		_ = db.QueryRow(r.Context(), "SELECT po_number FROM purchase_order_master WHERE id = $1", id).Scan(&poNumber)

		if err := models.RecordPurchaseOrderReply(r.Context(), db, id, poNumber, req.MessageID, req.To, req.Body, actorID(r)); err != nil {
			log.Printf("record PO reply error: %v", err)
		}
		models.LogPOFieldChange(r.Context(), db, models.POSourceMaster, strconv.Itoa(id), poNumber, "email_replied", nil, strPtr(req.Body), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "sent"})
	}
}
