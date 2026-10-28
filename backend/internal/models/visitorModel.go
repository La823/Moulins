package models

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RoleVisitor is the login role of a visitor — someone checking the website
// out, signed up with Google. See migration 168.
const RoleVisitor = "visitor"

// Visitor is a visitor account, in the shape /auth/me returns: the `role`
// and `username` keys match a User's, so the website reads both alike.
type Visitor struct {
	ID          uuid.UUID  `json:"id"`
	Role        string     `json:"role"`
	Username    *string    `json:"username,omitempty"`
	Email       string     `json:"email"`
	PictureURL  *string    `json:"picture_url,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
}

const visitorColumns = `id, name, email, picture_url, created_at, last_login_at`

func scanVisitor(row pgx.Row) (*Visitor, error) {
	v := Visitor{Role: RoleVisitor}
	if err := row.Scan(&v.ID, &v.Username, &v.Email, &v.PictureURL, &v.CreatedAt, &v.LastLoginAt); err != nil {
		return nil, err
	}
	return &v, nil
}

func nilIfBlank(s string) *string {
	if s = strings.TrimSpace(s); s == "" {
		return nil
	}
	return &s
}

// UpsertGoogleVisitor signs a Google account in as a visitor: created on
// first sign-in, with name, email and picture refreshed on every one after.
func UpsertGoogleVisitor(ctx context.Context, db *pgxpool.Pool, googleSub, email, name, picture string) (*Visitor, error) {
	return scanVisitor(db.QueryRow(ctx, `
		INSERT INTO visitors (google_sub, email, name, picture_url, last_login_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (google_sub) DO UPDATE
		SET email = EXCLUDED.email,
		    name = COALESCE(EXCLUDED.name, visitors.name),
		    picture_url = COALESCE(EXCLUDED.picture_url, visitors.picture_url),
		    last_login_at = now()
		RETURNING `+visitorColumns,
		googleSub, strings.TrimSpace(email), nilIfBlank(name), nilIfBlank(picture)))
}

// GetVisitor returns pgx.ErrNoRows when there is no such visitor.
func GetVisitor(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Visitor, error) {
	return scanVisitor(db.QueryRow(ctx, `SELECT `+visitorColumns+` FROM visitors WHERE id = $1`, id))
}

// EmailHasAccount: an existing (non-deleted) account — partner, staff,
// doctor — already uses this email. Such people log in the usual way rather
// than becoming a visitor.
func EmailHasAccount(ctx context.Context, db *pgxpool.Pool, email string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM users WHERE lower(trim(email)) = lower(trim($1)) AND deleted_at IS NULL)`,
		email).Scan(&exists)
	return exists, err
}

// PartnershipRequest is a visitor's "become a partner" request. The visitor
// fields are filled for the staff list.
type PartnershipRequest struct {
	ID           int64      `json:"id"`
	VisitorID    uuid.UUID  `json:"visitor_id"`
	FirmName     string     `json:"firm_name"`
	ContactName  *string    `json:"contact_name"`
	Phone        string     `json:"phone"`
	City         *string    `json:"city"`
	Message      *string    `json:"message"`
	Status       string     `json:"status"`
	StaffNote    *string    `json:"staff_note"`
	HandledBy    *string    `json:"handled_by_name"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	VisitorName  *string    `json:"visitor_name,omitempty"`
	VisitorEmail string     `json:"visitor_email,omitempty"`
	VisitorSince *time.Time `json:"visitor_since,omitempty"`
}

// ErrRequestAlreadyOpen: the visitor already has a request staff haven't
// closed.
var ErrRequestAlreadyOpen = errors.New("you already have a partnership request with us — our team will be in touch")

// PartnershipRequestStatuses are the statuses staff can set.
var PartnershipRequestStatuses = map[string]bool{"new": true, "contacted": true, "converted": true, "declined": true}

type NewPartnershipRequest struct {
	FirmName    string `json:"firm_name"`
	ContactName string `json:"contact_name"`
	Phone       string `json:"phone"`
	City        string `json:"city"`
	Message     string `json:"message"`
}

// CreatePartnershipRequest files a visitor's request; ErrRequestAlreadyOpen
// when one is still open.
func CreatePartnershipRequest(ctx context.Context, db *pgxpool.Pool, visitorID uuid.UUID, req NewPartnershipRequest) (int64, error) {
	var id int64
	err := db.QueryRow(ctx, `
		INSERT INTO partnership_requests (visitor_id, firm_name, contact_name, phone, city, message)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		visitorID, strings.TrimSpace(req.FirmName), nilIfBlank(req.ContactName), strings.TrimSpace(req.Phone),
		nilIfBlank(req.City), nilIfBlank(req.Message)).Scan(&id)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return 0, ErrRequestAlreadyOpen
	}
	return id, err
}

const partnershipRequestSelect = `
	SELECT pr.id, pr.visitor_id, pr.firm_name, pr.contact_name, pr.phone, pr.city, pr.message,
	       pr.status, pr.staff_note, u.username, pr.created_at, pr.updated_at,
	       v.name, v.email, v.created_at
	FROM partnership_requests pr
	JOIN visitors v ON v.id = pr.visitor_id
	LEFT JOIN users u ON u.id = pr.handled_by`

func scanPartnershipRequests(rows pgx.Rows) ([]PartnershipRequest, error) {
	defer rows.Close()
	list := []PartnershipRequest{}
	for rows.Next() {
		var p PartnershipRequest
		var since time.Time
		if err := rows.Scan(&p.ID, &p.VisitorID, &p.FirmName, &p.ContactName, &p.Phone, &p.City, &p.Message,
			&p.Status, &p.StaffNote, &p.HandledBy, &p.CreatedAt, &p.UpdatedAt,
			&p.VisitorName, &p.VisitorEmail, &since); err != nil {
			return nil, err
		}
		p.VisitorSince = &since
		list = append(list, p)
	}
	return list, rows.Err()
}

// LatestPartnershipRequest is the visitor's most recent request, or nil.
// Staff-only fields are left out.
func LatestPartnershipRequest(ctx context.Context, db *pgxpool.Pool, visitorID uuid.UUID) (*PartnershipRequest, error) {
	rows, err := db.Query(ctx, partnershipRequestSelect+` WHERE pr.visitor_id = $1 ORDER BY pr.created_at DESC LIMIT 1`, visitorID)
	if err != nil {
		return nil, err
	}
	list, err := scanPartnershipRequests(rows)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	p := list[0]
	p.StaffNote, p.HandledBy = nil, nil
	return &p, nil
}

// ListPartnershipRequests is the staff list, newest first; status "" = all.
func ListPartnershipRequests(ctx context.Context, db *pgxpool.Pool, status string) ([]PartnershipRequest, error) {
	rows, err := db.Query(ctx, partnershipRequestSelect+`
		WHERE ($1 = '' OR pr.status = $1)
		ORDER BY (pr.status IN ('new', 'contacted')) DESC, pr.created_at DESC
		LIMIT 500`, status)
	if err != nil {
		return nil, err
	}
	return scanPartnershipRequests(rows)
}

// UpdatePartnershipRequest sets a request's status and/or staff note.
// Returns pgx.ErrNoRows when there is no such request.
func UpdatePartnershipRequest(ctx context.Context, db *pgxpool.Pool, id int64, status, note *string, staffID uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		UPDATE partnership_requests
		SET status = COALESCE($2, status),
		    staff_note = CASE WHEN $3::text IS NULL THEN staff_note ELSE NULLIF(trim($3), '') END,
		    handled_by = $4, updated_at = now()
		WHERE id = $1`, id, status, note, staffID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
