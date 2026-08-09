package payments

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

func getUserID(r *http.Request) (uuid.UUID, bool) {
	idStr, ok := r.Context().Value("user_id").(string)
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(idStr)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

// POST /payments/upload-url — presigned S3 URL for a payment screenshot
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

		uploadURL, key, err := utils.GeneratePresignedPaymentUploadURL(req.Filename)
		if err != nil {
			log.Printf("presign error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}

// POST /payments — partner submits a payment (amount + screenshot)
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := getUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Amount        float64 `json:"amount"`
			ScreenshotKey string  `json:"screenshot_key"`
			Notes         *string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Amount <= 0 {
			http.Error(w, "amount must be greater than 0", http.StatusBadRequest)
			return
		}
		if req.ScreenshotKey == "" {
			http.Error(w, "screenshot_key is required", http.StatusBadRequest)
			return
		}

		id, err := models.CreatePayment(r.Context(), db, userID, req.Amount, req.ScreenshotKey, req.Notes)
		if err != nil {
			log.Printf("create payment error: %v", err)
			http.Error(w, "could not submit payment", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// GET /payments — the current partner's own payment submissions
func ListMineHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := getUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		list, err := models.GetPaymentsByUser(r.Context(), db, userID)
		if err != nil {
			log.Printf("list payments error: %v", err)
			http.Error(w, "could not fetch payments", http.StatusInternalServerError)
			return
		}
		for i := range list {
			list[i].ScreenshotURL = utils.GetPublicURL(list[i].ScreenshotKey)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/payments — every partner's payment submissions (staff, "payments" permission)
func ListAllHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 100 {
			limit = 20
		}

		filters := models.PaymentFilters{
			Status: r.URL.Query().Get("status"),
			Search: r.URL.Query().Get("search"),
		}

		list, total, err := models.GetAllPayments(r.Context(), db, limit, (page-1)*limit, filters)
		if err != nil {
			log.Printf("list all payments error: %v", err)
			http.Error(w, "could not fetch payments", http.StatusInternalServerError)
			return
		}
		for i := range list {
			list[i].ScreenshotURL = utils.GetPublicURL(list[i].ScreenshotKey)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"payments": list,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}

// GET /admin/payments/{id} — a single payment (staff)
func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		p, err := models.GetPaymentByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		p.ScreenshotURL = utils.GetPublicURL(p.ScreenshotKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(p)
	}
}

// PUT /admin/payments/{id}/verify — approve or reject a payment (staff)
func VerifyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		adminID, ok := getUserID(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			IsVerified      bool    `json:"is_verified"`
			RejectionReason *string `json:"rejection_reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.VerifyPayment(r.Context(), db, id, req.IsVerified, req.RejectionReason, adminID); err != nil {
			log.Printf("verify payment error: %v", err)
			http.Error(w, "could not update payment", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}
