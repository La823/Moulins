package purchaseorders

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

func poCacheKey(id uuid.UUID) string { return fmt.Sprintf("po:%s", id) }
const poListKey = "po:list"
const poTTL = 10 * time.Minute

func invalidatePO(rdb *cache.Client, r *http.Request, id uuid.UUID) {
	rdb.Del(r.Context(), poCacheKey(id), poListKey)
}

// LastByProductHandler — prefills new-PO form with last PO for that product
func LastByProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productIDStr := r.URL.Query().Get("product_id")
		productName := r.URL.Query().Get("product_name")

		var productID *uuid.UUID
		if productIDStr != "" {
			id, err := uuid.Parse(productIDStr)
			if err == nil {
				productID = &id
			}
		}

		po, err := models.GetLastPOByProduct(r.Context(), db, productID, productName)
		w.Header().Set("Content-Type", "application/json")
		if err != nil || po == nil {
			w.Write([]byte("null"))
			return
		}
		json.NewEncoder(w).Encode(po)
	}
}

func ListHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var list []models.PurchaseOrder
		if rdb.GetJSON(r.Context(), poListKey, &list) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(list)
			return
		}

		list, err := models.GetAllPurchaseOrders(r.Context(), db)
		if err != nil {
			log.Printf("list POs error: %v", err)
			http.Error(w, "could not fetch purchase orders", http.StatusInternalServerError)
			return
		}
		for i := range list {
			if list[i].DocumentKey != nil && *list[i].DocumentKey != "" {
				list[i].DocumentURL = utils.GetPublicURL(*list[i].DocumentKey)
			}
		}

		rdb.SetJSON(r.Context(), poListKey, list, poTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

func GetHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var po models.PurchaseOrder
		if rdb.GetJSON(r.Context(), poCacheKey(id), &po) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(po)
			return
		}

		p, err := models.GetPurchaseOrderByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if p.DocumentKey != nil && *p.DocumentKey != "" {
			p.DocumentURL = utils.GetPublicURL(*p.DocumentKey)
		}

		rdb.SetJSON(r.Context(), poCacheKey(id), p, poTTL)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(p)
	}
}

func generateAndUploadPDF(db *pgxpool.Pool, rdb *cache.Client, poID uuid.UUID, poNumber string, req models.CreatePORequest) {
	ctx := context.Background()

	mfr, err := models.GetManufacturerByID(ctx, db, req.ManufacturerID)
	if err != nil {
		log.Printf("PDF gen: manufacturer fetch error: %v", err)
		return
	}

	derefStr := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	derefF := func(f *float64) float64 {
		if f == nil {
			return 0
		}
		return *f
	}

	pdfData, err := utils.GeneratePOPDF(utils.POPDFData{
		PONumber:         poNumber,
		Date:             req.PODate,
		ManufacturerName: mfr.Name,
		CompanyName:      "MOULINS PHARMACEUTICALS PVT LTD",
		ProductName:      req.ProductName,
		Specifications:   derefStr(req.Specifications),
		Type:             derefStr(req.Type),
		Quantity:         req.Quantity,
		MRP:              derefF(req.MRP),
		Rate:             derefF(req.Rate),
		Category:         derefStr(req.Category),
		Remarks:          derefStr(req.Remarks),
	})
	if err != nil {
		log.Printf("PDF gen error: %v", err)
		return
	}

	s3Key := fmt.Sprintf("purchase-orders/%s.pdf", poNumber)
	if err := utils.UploadToS3(s3Key, pdfData, "application/pdf"); err != nil {
		log.Printf("S3 upload error: %v", err)
		return
	}

	if err := models.SetPODocumentKey(ctx, db, poID, s3Key); err != nil {
		log.Printf("set document key error: %v", err)
		return
	}

	// Bust cache after PDF URL is set so next fetch gets the document URL
	rdb.Del(ctx, poCacheKey(poID), poListKey)

	log.Printf("PO %s PDF generated and uploaded", poNumber)
}

func CreateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreatePORequest
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

		poNumber, err := models.GeneratePONumber(r.Context(), db)
		if err != nil {
			log.Printf("generate PO number error: %v", err)
			http.Error(w, "could not generate PO number", http.StatusInternalServerError)
			return
		}

		poID, err := models.CreatePurchaseOrder(r.Context(), db, req, getUserID(r), poNumber)
		if err != nil {
			log.Printf("create PO error: %v", err)
			http.Error(w, "could not create purchase order", http.StatusInternalServerError)
			return
		}

		rdb.Del(r.Context(), poListKey)

		go generateAndUploadPDF(db, rdb, poID, poNumber, req)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"id":        poID.String(),
			"po_number": poNumber,
		})
	}
}

func UpdateHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req models.UpdatePORequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := models.UpdatePurchaseOrder(r.Context(), db, id, req); err != nil {
			log.Printf("update PO error: %v", err)
			http.Error(w, "could not update", http.StatusInternalServerError)
			return
		}

		invalidatePO(rdb, r, id)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

func UpdateStatusHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		req := models.UpdatePORequest{Status: &body.Status}
		if err := models.UpdatePurchaseOrder(r.Context(), db, id, req); err != nil {
			log.Printf("update PO status error: %v", err)
			http.Error(w, "could not update", http.StatusInternalServerError)
			return
		}

		invalidatePO(rdb, r, id)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "status updated"})
	}
}

func DeleteHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if err := models.DeletePurchaseOrder(r.Context(), db, id); err != nil {
			log.Printf("delete PO error: %v", err)
			http.Error(w, "could not delete", http.StatusInternalServerError)
			return
		}

		invalidatePO(rdb, r, id)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}
