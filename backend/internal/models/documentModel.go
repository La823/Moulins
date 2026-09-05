package models

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DocumentType string

const (
	DocumentTypeLicense    DocumentType = "LICENSE" // legacy generic value, kept for old mobile clients
	DocumentTypeLicense20B DocumentType = "LICENSE_20B"
	DocumentTypeLicense21B DocumentType = "LICENSE_21B"
	DocumentTypeGST        DocumentType = "GST"
)

// ValidDocumentTypes are the doc_type values UploadDocument/VerifyDocument accept.
var ValidDocumentTypes = map[string]bool{
	string(DocumentTypeLicense):    true,
	string(DocumentTypeLicense20B): true,
	string(DocumentTypeLicense21B): true,
	string(DocumentTypeGST):        true,
}

func IsLicenseDocType(docType string) bool {
	return docType == string(DocumentTypeLicense) || docType == string(DocumentTypeLicense20B) || docType == string(DocumentTypeLicense21B)
}

type PartnerDocument struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	DocType         string          `json:"doc_type"`
	DocNumber       *string         `json:"doc_number"`
	ExpiryDate      *time.Time      `json:"expiry_date"`
	PhotoURL        *string         `json:"photo_url"`
	IsVerified      bool            `json:"is_verified"`
	VerifiedBy      *uuid.UUID      `json:"verified_by,omitempty"`
	VerifiedAt      *time.Time      `json:"verified_at,omitempty"`
	RejectionReason *string         `json:"rejection_reason,omitempty"`
	ScrapedData     json.RawMessage `json:"scraped_data,omitempty"`
	// Discrete fields pulled from the GST/drug-license scrapers. Which ones
	// are populated depends on doc_type — see DocumentScrapedFields.
	LegalName        *string    `json:"legal_name,omitempty"`
	TradeName        *string    `json:"trade_name,omitempty"`
	Status           *string    `json:"status,omitempty"`
	BusinessType     *string    `json:"business_type,omitempty"`
	RegisteredDate   *time.Time `json:"registered_date,omitempty"`
	FirstIssueDate   *time.Time `json:"first_issue_date,omitempty"`
	Address          *string    `json:"address,omitempty"`
	TechPersonName   *string    `json:"tech_person_name,omitempty"`
	TechPersonRegNo  *string    `json:"tech_person_reg_no,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// DocumentScrapedFields carries the typed fields extracted from a scraper
// response (GST portal or drug-license portal) for CreateOrUpdateDocument to
// persist as discrete columns, alongside the raw scraped_data blob.
type DocumentScrapedFields struct {
	LegalName       *string
	TradeName       *string
	Status          *string
	BusinessType    *string
	RegisteredDate  *time.Time
	FirstIssueDate  *time.Time
	Address         *string
	TechPersonName  *string
	TechPersonRegNo *string
}

type OnboardingStatus struct {
	UserID          uuid.UUID            `json:"user_id"`
	OnboardingStep  int                  `json:"onboarding_step"` // 1=Account, 2=License Pending, 3=GST Pending, 4=All Verified
	Documents       []PartnerDocument   `json:"documents"`
	IsFullyVerified bool                 `json:"is_fully_verified"`
}

type UploadDocumentRequest struct {
	DocType     string          `json:"doc_type"`
	DocNumber   string          `json:"doc_number"`
	ExpiryDate  *string         `json:"expiry_date"` // date string e.g. "2026-01-01"
	PhotoURL    string          `json:"photo_url"`
	ScrapedData json.RawMessage `json:"scraped_data,omitempty"`

	// Discrete scraped fields, mapped by the frontend from the GST/DL
	// verify-modal response before submitting — see DocumentScrapedFields.
	LegalName       *string `json:"legal_name,omitempty"`
	TradeName       *string `json:"trade_name,omitempty"`
	Status          *string `json:"status,omitempty"`
	BusinessType    *string `json:"business_type,omitempty"`
	RegisteredDate  *string `json:"registered_date,omitempty"` // "2026-01-01"
	FirstIssueDate  *string `json:"first_issue_date,omitempty"`
	Address         *string `json:"address,omitempty"`
	TechPersonName  *string `json:"tech_person_name,omitempty"`
	TechPersonRegNo *string `json:"tech_person_reg_no,omitempty"`
}

type VerifyDocumentRequest struct {
	UserID          uuid.UUID `json:"user_id"`
	DocType         string    `json:"doc_type"`
	IsVerified      bool      `json:"is_verified"`
	RejectionReason *string   `json:"rejection_reason"`
}

func CreateOrUpdateDocument(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
	docType string,
	docNumber string,
	expiryDate *time.Time,
	photoURL string,
	scrapedData json.RawMessage,
	fields DocumentScrapedFields,
) (*PartnerDocument, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Archive whatever document this is about to replace, if any, before
	// overwriting it — old photos/numbers are otherwise lost on re-upload.
	_, err = tx.Exec(ctx, `
		INSERT INTO partner_document_history (
			document_id, user_id, doc_type, doc_number, expiry_date, photo_url,
			is_verified, verified_by, verified_at, rejection_reason, scraped_data,
			legal_name, trade_name, status, business_type, registered_date,
			first_issue_date, address, tech_person_name, tech_person_reg_no,
			original_created_at, original_updated_at
		)
		SELECT id, user_id, doc_type, doc_number, expiry_date, photo_url,
			is_verified, verified_by, verified_at, rejection_reason, scraped_data,
			legal_name, trade_name, status, business_type, registered_date,
			first_issue_date, address, tech_person_name, tech_person_reg_no,
			created_at, updated_at
		FROM partner_documents
		WHERE user_id = $1 AND doc_type = $2
	`, userID, docType)
	if err != nil {
		return nil, err
	}

	var scrapedDataParam interface{}
	if len(scrapedData) > 0 {
		scrapedDataParam = scrapedData
	}

	query := `
		INSERT INTO partner_documents (
			user_id, doc_type, doc_number, expiry_date, photo_url, scraped_data,
			legal_name, trade_name, status, business_type, registered_date,
			first_issue_date, address, tech_person_name, tech_person_reg_no
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		ON CONFLICT (user_id, doc_type) DO UPDATE
		SET doc_number = $3, expiry_date = $4, photo_url = $5, scraped_data = $6,
			legal_name = $7, trade_name = $8, status = $9, business_type = $10,
			registered_date = $11, first_issue_date = $12, address = $13,
			tech_person_name = $14, tech_person_reg_no = $15, updated_at = NOW(),
			is_verified = FALSE, verified_by = NULL, verified_at = NULL, rejection_reason = NULL
		RETURNING id, user_id, doc_type, doc_number, expiry_date, photo_url, is_verified, verified_by, verified_at, rejection_reason, scraped_data,
			legal_name, trade_name, status, business_type, registered_date, first_issue_date, address, tech_person_name, tech_person_reg_no,
			created_at, updated_at
	`

	var doc PartnerDocument
	err = tx.QueryRow(ctx, query, userID, docType, docNumber, expiryDate, photoURL, scrapedDataParam,
		fields.LegalName, fields.TradeName, fields.Status, fields.BusinessType, fields.RegisteredDate,
		fields.FirstIssueDate, fields.Address, fields.TechPersonName, fields.TechPersonRegNo,
	).Scan(
		&doc.ID, &doc.UserID, &doc.DocType, &doc.DocNumber, &doc.ExpiryDate,
		&doc.PhotoURL, &doc.IsVerified, &doc.VerifiedBy, &doc.VerifiedAt, &doc.RejectionReason,
		&doc.ScrapedData,
		&doc.LegalName, &doc.TradeName, &doc.Status, &doc.BusinessType, &doc.RegisteredDate,
		&doc.FirstIssueDate, &doc.Address, &doc.TechPersonName, &doc.TechPersonRegNo,
		&doc.CreatedAt, &doc.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Update user's onboarding step
	_ = updateUserOnboardingStep(ctx, db, userID)

	return &doc, nil
}

func GetUserDocuments(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
) ([]PartnerDocument, error) {
	query := `
		SELECT id, user_id, doc_type, doc_number, expiry_date, photo_url, is_verified, verified_by, verified_at, rejection_reason, scraped_data,
			legal_name, trade_name, status, business_type, registered_date, first_issue_date, address, tech_person_name, tech_person_reg_no,
			created_at, updated_at
		FROM partner_documents
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []PartnerDocument
	for rows.Next() {
		var doc PartnerDocument
		err := rows.Scan(
			&doc.ID, &doc.UserID, &doc.DocType, &doc.DocNumber, &doc.ExpiryDate,
			&doc.PhotoURL, &doc.IsVerified, &doc.VerifiedBy, &doc.VerifiedAt, &doc.RejectionReason,
			&doc.ScrapedData,
			&doc.LegalName, &doc.TradeName, &doc.Status, &doc.BusinessType, &doc.RegisteredDate,
			&doc.FirstIssueDate, &doc.Address, &doc.TechPersonName, &doc.TechPersonRegNo,
			&doc.CreatedAt, &doc.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}

	return docs, rows.Err()
}

func GetOnboardingStatus(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
) (*OnboardingStatus, error) {
	// Get user
	var step int
	err := db.QueryRow(ctx, `SELECT onboarding_step FROM users WHERE id = $1`, userID).Scan(&step)
	if err != nil {
		return nil, err
	}

	// Get documents
	docs, err := GetUserDocuments(ctx, db, userID)
	if err != nil {
		return nil, err
	}

	// Check if fully verified
	fullyVerified := step == 4

	return &OnboardingStatus{
		UserID:          userID,
		OnboardingStep:  step,
		Documents:       docs,
		IsFullyVerified: fullyVerified,
	}, nil
}

func VerifyDocument(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
	docType string,
	isVerified bool,
	rejectionReason *string,
	adminID uuid.UUID,
) error {
	if isVerified {
		query := `
			UPDATE partner_documents
			SET is_verified = TRUE, verified_by = $1, verified_at = NOW(), rejection_reason = NULL
			WHERE user_id = $2 AND doc_type = $3
		`
		_, err := db.Exec(ctx, query, adminID, userID, docType)
		if err != nil {
			return err
		}
	} else {
		query := `
			UPDATE partner_documents
			SET is_verified = FALSE, rejection_reason = $1, verified_by = NULL, verified_at = NULL
			WHERE user_id = $2 AND doc_type = $3
		`
		_, err := db.Exec(ctx, query, rejectionReason, userID, docType)
		if err != nil {
			return err
		}
	}

	// Update user's onboarding step
	_ = updateUserOnboardingStep(ctx, db, userID)

	return nil
}

func updateUserOnboardingStep(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	query := `
		SELECT COALESCE(MAX(
			CASE
				WHEN is_verified = TRUE AND doc_type = 'LICENSE' THEN 2
				WHEN is_verified = TRUE AND doc_type = 'GST' THEN 3
				ELSE 1
			END
		), 1)
		FROM partner_documents
		WHERE user_id = $1 AND is_verified = TRUE
	`

	var maxStep int
	err := db.QueryRow(ctx, query, userID).Scan(&maxStep)
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	// If both documents verified, step is 4. Any one of LICENSE/LICENSE_20B/
	// LICENSE_21B being verified counts as the license step.
	var licenseVerified, gstVerified bool
	err = db.QueryRow(
		ctx,
		`SELECT
			COALESCE((SELECT bool_or(is_verified) FROM partner_documents WHERE user_id = $1 AND doc_type IN ('LICENSE', 'LICENSE_20B', 'LICENSE_21B')), FALSE),
			COALESCE((SELECT is_verified FROM partner_documents WHERE user_id = $1 AND doc_type = 'GST'), FALSE)`,
		userID,
	).Scan(&licenseVerified, &gstVerified)
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	var step int
	if licenseVerified && gstVerified {
		step = 4
	} else if licenseVerified {
		step = 2
	} else if gstVerified {
		step = 3
	} else {
		step = 1
	}

	_, err = db.Exec(ctx, `UPDATE users SET onboarding_step = $1 WHERE id = $2`, step, userID)
	return err
}

func GetPendingOnboardingPartners(
	ctx context.Context,
	db *pgxpool.Pool,
	limit int,
	offset int,
) ([]map[string]interface{}, int, error) {
	// Get count
	var total int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'partner' AND onboarding_step < 4`).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Get partners with their documents
	query := `
		SELECT u.id, u.phone_number, u.username, u.onboarding_step, u.created_at,
			json_agg(json_build_object(
				'id', cd.id,
				'doc_type', cd.doc_type,
				'doc_number', cd.doc_number,
				'is_verified', cd.is_verified,
				'rejection_reason', cd.rejection_reason,
				'created_at', cd.created_at
			)) FILTER (WHERE cd.id IS NOT NULL) as documents
		FROM users u
		LEFT JOIN partner_documents cd ON u.id = cd.user_id
		WHERE u.role = 'partner' AND u.onboarding_step < 4
		GROUP BY u.id, u.phone_number, u.username, u.onboarding_step, u.created_at
		ORDER BY u.created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := db.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var partners []map[string]interface{}
	for rows.Next() {
		var (
			id              uuid.UUID
			phoneNumber     string
			username        *string
			onboardingStep  int
			createdAt       time.Time
			docsJSON        []byte
		)
		err := rows.Scan(&id, &phoneNumber, &username, &onboardingStep, &createdAt, &docsJSON)
		if err != nil {
			return nil, 0, err
		}

		partners = append(partners, map[string]interface{}{
			"id":               id,
			"phone_number":     phoneNumber,
			"username":         username,
			"onboarding_step":  onboardingStep,
			"created_at":       createdAt,
			"documents_json":   string(docsJSON),
		})
	}

	return partners, total, rows.Err()
}
