package purchaseorders

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// LastByProductHandler returns the most recent PO for a given product so the
// new-PO form can prefill rate, MRP, manufacturer, specifications, etc.
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
		if err != nil {
			// Not found is fine — return null
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("null"))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(po)
	}
}

func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		po, err := models.GetPurchaseOrderByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if po.DocumentKey != nil && *po.DocumentKey != "" {
			po.DocumentURL = utils.GetPublicURL(*po.DocumentKey)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(po)
	}
}

func generateAndUploadPDF(db *pgxpool.Pool, poID uuid.UUID, poNumber string, req models.CreatePORequest) {
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
	}

	log.Printf("PO %s PDF generated and uploaded", poNumber)
}

func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
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

		go generateAndUploadPDF(db, poID, poNumber, req)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"id":        poID.String(),
			"po_number": poNumber,
		})
	}
}

func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

func UpdateStatusHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "status updated"})
	}
}

func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}
