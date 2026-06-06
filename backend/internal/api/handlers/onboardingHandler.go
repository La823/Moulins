package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

type OnboardingHandler struct {
	db *pgxpool.Pool
}

func NewOnboardingHandler(db *pgxpool.Pool) *OnboardingHandler {
	return &OnboardingHandler{db: db}
}

// POST /api/onboarding/upload-url - Get presigned S3 URL for document photo upload
func (h *OnboardingHandler) GetUploadURL(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Filename == "" {
		http.Error(w, "filename required", http.StatusBadRequest)
		return
	}

	uploadURL, key, err := utils.GeneratePresignedDocUploadURL(body.Filename)
	if err != nil {
		http.Error(w, "failed to generate upload URL", http.StatusInternalServerError)
		return
	}

	publicURL := utils.GetPublicURL(key)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"upload_url": uploadURL,
		"public_url": publicURL,
		"key":        key,
	})
}

// POST /api/onboarding/documents - Upload a document (license or GST)
func (h *OnboardingHandler) UploadDocument(w http.ResponseWriter, r *http.Request) {
	userIDStr, _ := r.Context().Value("user_id").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req models.UploadDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.DocType != "LICENSE" && req.DocType != "GST" {
		http.Error(w, "Invalid document type", http.StatusBadRequest)
		return
	}

	if req.DocNumber == "" || req.PhotoURL == "" {
		http.Error(w, "Doc number and photo URL are required", http.StatusBadRequest)
		return
	}

	if req.DocType == "LICENSE" && req.ExpiryDate == nil {
		http.Error(w, "Expiry date is required for license documents", http.StatusBadRequest)
		return
	}

	doc, err := models.CreateOrUpdateDocument(
		r.Context(),
		h.db,
		userID,
		req.DocType,
		req.DocNumber,
		req.ExpiryDate,
		req.PhotoURL,
	)
	if err != nil {
		http.Error(w, "Failed to upload document", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"document": doc,
	})
}

// GET /api/onboarding/status - Get user's onboarding status
func (h *OnboardingHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	userIDStr, _ := r.Context().Value("user_id").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	status, err := models.GetOnboardingStatus(r.Context(), h.db, userID)
	if err != nil {
		http.Error(w, "Failed to fetch status", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// GET /api/admin/onboarding - List pending onboarding customers (admin only)
func (h *OnboardingHandler) GetPendingCustomers(w http.ResponseWriter, r *http.Request) {
	userIDStr, _ := r.Context().Value("user_id").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Verify admin
	user, err := models.GetUserByID(r.Context(), h.db, userID)
	if err != nil || user.Role != "admin" {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	limit := 20
	offset := 0
	if q := r.URL.Query().Get("limit"); q != "" {
		if l, err := strconv.Atoi(q); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	if q := r.URL.Query().Get("offset"); q != "" {
		if o, err := strconv.Atoi(q); err == nil && o >= 0 {
			offset = o
		}
	}

	customers, total, err := models.GetPendingOnboardingCustomers(r.Context(), h.db, limit, offset)
	if err != nil {
		http.Error(w, "Failed to fetch customers", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"customers": customers,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
	})
}

// PATCH /api/admin/onboarding/verify - Verify or reject a document (admin only)
func (h *OnboardingHandler) VerifyDocument(w http.ResponseWriter, r *http.Request) {
	adminIDStr, _ := r.Context().Value("user_id").(string)
	adminID, err := uuid.Parse(adminIDStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Verify admin
	admin, err := models.GetUserByID(r.Context(), h.db, adminID)
	if err != nil || admin.Role != "admin" {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	var req models.VerifyDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.DocType != "LICENSE" && req.DocType != "GST" {
		http.Error(w, "Invalid document type", http.StatusBadRequest)
		return
	}

	err = models.VerifyDocument(
		r.Context(),
		h.db,
		req.UserID,
		req.DocType,
		req.IsVerified,
		req.RejectionReason,
		adminID,
	)
	if err != nil {
		http.Error(w, "Failed to verify document", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Document verification updated",
	})
}

// GET /api/admin/onboarding/customer/{userID} - Get customer's onboarding details (admin only)
func (h *OnboardingHandler) GetCustomerOnboarding(w http.ResponseWriter, r *http.Request) {
	adminIDStr, _ := r.Context().Value("user_id").(string)
	adminID, err := uuid.Parse(adminIDStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Verify admin
	admin, err := models.GetUserByID(r.Context(), h.db, adminID)
	if err != nil || admin.Role != "admin" {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	userIDStr := mux.Vars(r)["userID"]
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	status, err := models.GetOnboardingStatus(r.Context(), h.db, userID)
	if err != nil {
		http.Error(w, "Failed to fetch customer details", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}