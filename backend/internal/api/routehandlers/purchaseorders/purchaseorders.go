package purchaseorders

import (
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

func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := models.GetAllPurchaseOrders(r.Context(), db)
		if err != nil {
			log.Printf("list POs error: %v", err)
			http.Error(w, "could not fetch purchase orders", http.StatusInternalServerError)
			return
		}
		// Attach document URLs
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

func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreatePORequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ManufacturerID == uuid.Nil || len(req.Items) == 0 {
			http.Error(w, "manufacturer_id and at least one item are required", http.StatusBadRequest)
			return
		}
		if req.Date == "" {
			http.Error(w, "date is required", http.StatusBadRequest)
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

		// Generate PDF and upload to S3
		go func() {
			mfr, err := models.GetManufacturerByID(r.Context(), db, req.ManufacturerID)
			if err != nil {
				log.Printf("PDF gen: manufacturer fetch error: %v", err)
				return
			}

			pdfItems := make([]utils.POPDFItem, len(req.Items))
			for i, item := range req.Items {
				packing := ""
				if item.Packing != nil {
					packing = *item.Packing
				}
				pdfItems[i] = utils.POPDFItem{
					SrNo:        i + 1,
					ProductName: item.ProductName,
					Packing:     packing,
					Quantity:    item.Quantity,
					MRP:         item.MRP,
					Rate:        item.Rate,
				}
			}

			pdfData, err := utils.GeneratePOPDF(utils.POPDFData{
				PONumber:         poNumber,
				Date:             req.Date,
				ManufacturerName: mfr.Name,
				CompanyName:      "MOULINS PHARMACEUTICALS PVT LTD",
				Items:            pdfItems,
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

			if err := models.SetPODocumentKey(r.Context(), db, poID, s3Key); err != nil {
				log.Printf("set document key error: %v", err)
			}

			log.Printf("PO %s PDF generated and uploaded to S3", poNumber)
		}()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"id":        poID.String(),
			"po_number": poNumber,
		})
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
		if err := models.UpdatePOStatus(r.Context(), db, id, body.Status); err != nil {
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
