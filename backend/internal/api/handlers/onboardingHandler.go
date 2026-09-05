package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

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

	if !models.ValidDocumentTypes[req.DocType] {
		http.Error(w, "Invalid document type", http.StatusBadRequest)
		return
	}

	if req.DocNumber == "" || req.PhotoURL == "" {
		http.Error(w, "Doc number and photo URL are required", http.StatusBadRequest)
		return
	}

	// Parse expiry date string into time.Time
	var expiryDate *time.Time
	if models.IsLicenseDocType(req.DocType) {
		if req.ExpiryDate == nil || *req.ExpiryDate == "" {
			http.Error(w, "Expiry date is required for license documents", http.StatusBadRequest)
			return
		}
		parsed, err := time.Parse("2006-01-02", *req.ExpiryDate)
		if err != nil {
			http.Error(w, "Invalid expiry date format, use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		expiryDate = &parsed
	}

	// The optional scraped-field dates come as plain "YYYY-MM-DD" strings —
	// parse failures are ignored rather than rejected, since these fields are
	// a convenience, not required for the upload to succeed.
	parseOptionalDate := func(s *string) *time.Time {
		if s == nil || *s == "" {
			return nil
		}
		parsed, err := time.Parse("2006-01-02", *s)
		if err != nil {
			return nil
		}
		return &parsed
	}

	doc, err := models.CreateOrUpdateDocument(
		r.Context(),
		h.db,
		userID,
		req.DocType,
		req.DocNumber,
		expiryDate,
		req.PhotoURL,
		req.ScrapedData,
		models.DocumentScrapedFields{
			LegalName:       req.LegalName,
			TradeName:       req.TradeName,
			Status:          req.Status,
			BusinessType:    req.BusinessType,
			RegisteredDate:  parseOptionalDate(req.RegisteredDate),
			FirstIssueDate:  parseOptionalDate(req.FirstIssueDate),
			Address:         req.Address,
			TechPersonName:  req.TechPersonName,
			TechPersonRegNo: req.TechPersonRegNo,
		},
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

// GET /api/admin/onboarding - List pending onboarding partners (admin only)
func (h *OnboardingHandler) GetPendingPartners(w http.ResponseWriter, r *http.Request) {
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

	partners, total, err := models.GetPendingOnboardingPartners(r.Context(), h.db, limit, offset)
	if err != nil {
		http.Error(w, "Failed to fetch partners", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"partners": partners,
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

	if !models.ValidDocumentTypes[req.DocType] {
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

// GET /api/admin/onboarding/partner/{userID} - Get partner's onboarding details (admin only)
func (h *OnboardingHandler) GetPartnerOnboarding(w http.ResponseWriter, r *http.Request) {
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
		http.Error(w, "Failed to fetch partner details", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}