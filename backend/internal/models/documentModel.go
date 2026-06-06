package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DocumentType string

const (
	DocumentTypeLicense DocumentType = "LICENSE"
	DocumentTypeGST     DocumentType = "GST"
)

type CustomerDocument struct {
	ID               uuid.UUID  `json:"id"`
	UserID           uuid.UUID  `json:"user_id"`
	DocType          string     `json:"doc_type"`
	DocNumber        *string    `json:"doc_number"`
	ExpiryDate       *time.Time `json:"expiry_date"`
	PhotoURL         *string    `json:"photo_url"`
	IsVerified       bool       `json:"is_verified"`
	VerifiedBy       *uuid.UUID `json:"verified_by,omitempty"`
	VerifiedAt       *time.Time `json:"verified_at,omitempty"`
	RejectionReason  *string    `json:"rejection_reason,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type OnboardingStatus struct {
	UserID          uuid.UUID            `json:"user_id"`
	OnboardingStep  int                  `json:"onboarding_step"` // 1=Account, 2=License Pending, 3=GST Pending, 4=All Verified
	Documents       []CustomerDocument   `json:"documents"`
	IsFullyVerified bool                 `json:"is_fully_verified"`
}

type UploadDocumentRequest struct {
	DocType    string `json:"doc_type"` // LICENSE or GST
	DocNumber  string `json:"doc_number"`
	ExpiryDate *time.Time `json:"expiry_date"` // Required for LICENSE, optional for GST
	PhotoURL   string `json:"photo_url"`
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
) (*CustomerDocument, error) {
	query := `
		INSERT INTO customer_documents (user_id, doc_type, doc_number, expiry_date, photo_url)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, doc_type) DO UPDATE
		SET doc_number = $3, expiry_date = $4, photo_url = $5, updated_at = NOW()
		RETURNING id, user_id, doc_type, doc_number, expiry_date, photo_url, is_verified, verified_by, verified_at, rejection_reason, created_at, updated_at
	`

	var doc CustomerDocument
	err := db.QueryRow(ctx, query, userID, docType, docNumber, expiryDate, photoURL).Scan(
		&doc.ID, &doc.UserID, &doc.DocType, &doc.DocNumber, &doc.ExpiryDate,
		&doc.PhotoURL, &doc.IsVerified, &doc.VerifiedBy, &doc.VerifiedAt, &doc.RejectionReason,
		&doc.CreatedAt, &doc.UpdatedAt,
	)
	if err != nil {
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
) ([]CustomerDocument, error) {
	query := `
		SELECT id, user_id, doc_type, doc_number, expiry_date, photo_url, is_verified, verified_by, verified_at, rejection_reason, created_at, updated_at
		FROM customer_documents
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []CustomerDocument
	for rows.Next() {
		var doc CustomerDocument
		err := rows.Scan(
			&doc.ID, &doc.UserID, &doc.DocType, &doc.DocNumber, &doc.ExpiryDate,
			&doc.PhotoURL, &doc.IsVerified, &doc.VerifiedBy, &doc.VerifiedAt, &doc.RejectionReason,
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
			UPDATE customer_documents
			SET is_verified = TRUE, verified_by = $1, verified_at = NOW(), rejection_reason = NULL
			WHERE user_id = $2 AND doc_type = $3
		`
		_, err := db.Exec(ctx, query, adminID, userID, docType)
		if err != nil {
			return err
		}
	} else {
		query := `
			UPDATE customer_documents
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
		FROM customer_documents
		WHERE user_id = $1 AND is_verified = TRUE
	`

	var maxStep int
	err := db.QueryRow(ctx, query, userID).Scan(&maxStep)
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	// If both documents verified, step is 4
	var licenseVerified, gstVerified bool
	err = db.QueryRow(
		ctx,
		`SELECT
			COALESCE((SELECT is_verified FROM customer_documents WHERE user_id = $1 AND doc_type = 'LICENSE'), FALSE),
			COALESCE((SELECT is_verified FROM customer_documents WHERE user_id = $1 AND doc_type = 'GST'), FALSE)`,
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

func GetPendingOnboardingCustomers(
	ctx context.Context,
	db *pgxpool.Pool,
	limit int,
	offset int,
) ([]map[string]interface{}, int, error) {
	// Get count
	var total int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'customer' AND onboarding_step < 4`).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Get customers with their documents
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
		LEFT JOIN customer_documents cd ON u.id = cd.user_id
		WHERE u.role = 'customer' AND u.onboarding_step < 4
		GROUP BY u.id, u.phone_number, u.username, u.onboarding_step, u.created_at
		ORDER BY u.created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := db.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var customers []map[string]interface{}
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

		customers = append(customers, map[string]interface{}{
			"id":               id,
			"phone_number":     phoneNumber,
			"username":         username,
			"onboarding_step":  onboardingStep,
			"created_at":       createdAt,
			"documents_json":   string(docsJSON),
		})
	}

	return customers, total, rows.Err()
}
