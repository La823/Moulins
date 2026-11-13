package models

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

// RoleRetailer is a shop a partner has onboarded (see 180_retailers.sql).
const RoleRetailer = "retailer"

// Retailer is one of a partner's retailers, as the partner sees them.
type Retailer struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Phone       string     `json:"phone"`
	ShopName    *string    `json:"shop_name,omitempty"`
	Address     *string    `json:"address,omitempty"`
	City        *string    `json:"city,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	OrderCount  int        `json:"order_count"`
	// Their GST number and drug licences on file (retailer_documents).
	GstNumber   *string `json:"gst_number,omitempty"`
	GstVerified bool    `json:"gst_verified"`
	DlCount     int     `json:"dl_count"`
	DlVerified  int     `json:"dl_verified"`
}

type RetailerInput struct {
	Name     string  `json:"name"`
	Phone    string  `json:"phone"`
	ShopName *string `json:"shop_name"`
	Address  *string `json:"address"`
	City     *string `json:"city"`
}

// ErrNotYourRetailer: the retailer doesn't exist, was removed, or belongs to
// another partner — all reported the same way.
var ErrNotYourRetailer = errors.New("retailer not found")

// RetailerPartner is the partner a retailer orders from; ok is false for a
// removed or unknown retailer.
// RoleDoctor is a doctor's own login (072_doctor_user_link.sql). Like a
// retailer, a doctor sees their partner's catalogue at MRP and orders from
// the partner (retailer_orders, whose retailer_id is the buyer's login).
const RoleDoctor = "doctor"

// BuysFromPartner: the role orders from a partner (retailer_orders) rather
// than from Moulins, and sees MRP only.
func BuysFromPartner(role string) bool { return role == RoleRetailer || role == RoleDoctor }

// BuyerPartner is the partner a retailer or doctor login orders from; ok is
// false when it isn't linked to one (removed, or not a buyer).
func BuyerPartner(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, role string) (uuid.UUID, bool, error) {
	switch role {
	case RoleRetailer:
		return RetailerPartner(ctx, db, userID)
	case RoleTeamMember:
		// whether the partner allows it is checked by the caller
		return TeamMemberOwner(ctx, db, userID)
	case RoleDoctor:
		var partner uuid.UUID
		err := db.QueryRow(ctx,
			`SELECT partner_id FROM doctors WHERE user_id = $1 AND NOT is_deleted`, userID).Scan(&partner)
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, false, nil
		}
		return partner, err == nil, err
	}
	return uuid.Nil, false, nil
}

func RetailerPartner(ctx context.Context, db *pgxpool.Pool, retailerID uuid.UUID) (uuid.UUID, bool, error) {
	var partner uuid.UUID
	err := db.QueryRow(ctx,
		`SELECT partner_id FROM retailers WHERE user_id = $1 AND removed_at IS NULL`, retailerID).Scan(&partner)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return partner, err == nil, err
}

// CreateRetailer makes the retailer's login (phone number as login and
// first password, like a doctor) and links it to the partner.
func CreateRetailer(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID, in RetailerInput) (uuid.UUID, error) {
	name := in.Name
	id, err := CreateUser(ctx, db, in.Phone, in.Phone, &name, nil, RoleRetailer, nil, in.City, nil)
	if err != nil {
		return uuid.Nil, err
	}
	_, err = db.Exec(ctx,
		`INSERT INTO retailers (user_id, partner_id, shop_name, address, city) VALUES ($1, $2, $3, $4, $5)`,
		id, partnerID, in.ShopName, in.Address, in.City)
	if err != nil {
		// don't leave a login with no retailer behind it
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
		return uuid.Nil, err
	}
	return id, nil
}

// RemovedRetailerOf reports whether userID is a retailer this partner removed
// earlier (re-adding them brings the same account back).
func RemovedRetailerOf(ctx context.Context, db *pgxpool.Pool, partnerID, userID uuid.UUID) (bool, error) {
	var ok bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM retailers WHERE user_id = $1 AND partner_id = $2 AND removed_at IS NOT NULL)`,
		userID, partnerID).Scan(&ok)
	return ok, err
}

// RestoreRetailer brings a removed retailer back with new details; the
// password goes back to their phone number.
func RestoreRetailer(ctx context.Context, db *pgxpool.Pool, partnerID, userID uuid.UUID, in RetailerInput) error {
	hashed, err := utils.HashPassword(in.Phone)
	if err != nil {
		return err
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		UPDATE users SET deleted_at = NULL, username = $2, password_hash = $3, plain_password = $4, updated_at = now()
		WHERE id = $1 AND role = 'retailer'`, userID, in.Name, hashed, in.Phone); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE retailers SET removed_at = NULL, shop_name = $3, address = $4, city = $5
		WHERE user_id = $1 AND partner_id = $2`, userID, partnerID, in.ShopName, in.Address, in.City); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListRetailers is the partner's current retailers, newest first.
func ListRetailers(ctx context.Context, db *pgxpool.Pool, partnerID uuid.UUID) ([]Retailer, error) {
	rows, err := db.Query(ctx, `
		SELECT u.id, COALESCE(u.username, ''), u.phone_number, r.shop_name, r.address, r.city, r.created_at, u.last_login_at,
		       (SELECT count(*) FROM retailer_orders o WHERE o.retailer_id = u.id),
		       (SELECT d.number FROM retailer_documents d WHERE d.retailer_id = u.id AND d.kind = 'gst' ORDER BY d.verified_at DESC NULLS LAST LIMIT 1),
		       EXISTS (SELECT 1 FROM retailer_documents d WHERE d.retailer_id = u.id AND d.kind = 'gst' AND d.verified_at IS NOT NULL),
		       (SELECT count(*) FROM retailer_documents d WHERE d.retailer_id = u.id AND d.kind = 'dl'),
		       (SELECT count(*) FROM retailer_documents d WHERE d.retailer_id = u.id AND d.kind = 'dl' AND d.verified_at IS NOT NULL)
		FROM retailers r JOIN users u ON u.id = r.user_id
		WHERE r.partner_id = $1 AND r.removed_at IS NULL
		ORDER BY r.created_at DESC`, partnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Retailer{}
	for rows.Next() {
		var x Retailer
		if err := rows.Scan(&x.ID, &x.Name, &x.Phone, &x.ShopName, &x.Address, &x.City, &x.CreatedAt, &x.LastLoginAt, &x.OrderCount,
			&x.GstNumber, &x.GstVerified, &x.DlCount, &x.DlVerified); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// UpdateRetailer changes a retailer's name and shop details (not the phone,
// which is their login).
func UpdateRetailer(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID uuid.UUID, in RetailerInput) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `
		UPDATE retailers SET shop_name = $3, address = $4, city = $5
		WHERE user_id = $1 AND partner_id = $2 AND removed_at IS NULL`, retailerID, partnerID, in.ShopName, in.Address, in.City)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotYourRetailer
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET username = $2, updated_at = now() WHERE id = $1`, retailerID, in.Name); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RemoveRetailer takes the retailer off the partner's list and closes their
// login; their orders stay.
func RemoveRetailer(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID uuid.UUID) error {
	tag, err := db.Exec(ctx, `
		UPDATE retailers SET removed_at = now() WHERE user_id = $1 AND partner_id = $2 AND removed_at IS NULL`, retailerID, partnerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotYourRetailer
	}
	_, err = db.Exec(ctx, `UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1 AND role = 'retailer'`, retailerID)
	return err
}

// ResetRetailerPassword sets the password back to the retailer's phone number.
func ResetRetailerPassword(ctx context.Context, db *pgxpool.Pool, partnerID, retailerID uuid.UUID) error {
	var phone string
	err := db.QueryRow(ctx, `
		SELECT u.phone_number FROM retailers r JOIN users u ON u.id = r.user_id
		WHERE r.user_id = $1 AND r.partner_id = $2 AND r.removed_at IS NULL`, retailerID, partnerID).Scan(&phone)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotYourRetailer
	}
	if err != nil {
		return err
	}
	hashed, err := utils.HashPassword(phone)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `UPDATE users SET password_hash = $2, plain_password = $3, updated_at = now() WHERE id = $1`, retailerID, hashed, phone)
	return err
}
