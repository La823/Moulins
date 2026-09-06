package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

type User struct {
	ID                   uuid.UUID  `json:"id"`
	PhoneNumber          string     `json:"phone_number"`
	Username             *string    `json:"username,omitempty"`
	Email                *string    `json:"email,omitempty"`
	PasswordHash         string     `json:"-"`
	PlainPassword        *string    `json:"plain_password,omitempty"`
	Role                 string     `json:"role"`
	CustomerType         string     `json:"customer_type"`
	SpecialTileImageKey  *string    `json:"-"`
	SpecialTileImageURL  string     `json:"special_tile_image_url,omitempty"`
	TeamOwnerID          *uuid.UUID `json:"team_owner_id,omitempty"`
	IsPhoneVerified      bool       `json:"is_phone_verified"`
	OnboardingStep       int        `json:"onboarding_step"`
	Pincode              *string    `json:"pincode,omitempty"`
	City                 *string    `json:"city,omitempty"`
	State                *string    `json:"state,omitempty"`
	DefaultTransportMode string     `json:"default_transport_mode"`
	Latitude             *float64   `json:"latitude,omitempty"`
	Longitude            *float64   `json:"longitude,omitempty"`
	LastLoginAt          *time.Time `json:"last_login_at,omitempty"` // Pointer because it can be NULL
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
	Permissions          []string   `json:"permissions,omitempty"`
	Rid                  *string    `json:"rid,omitempty"`
	BillingAddress       *string    `json:"billing_address,omitempty"`
	ShippingAddress      *string    `json:"shipping_address,omitempty"`
}

type CreateUserRequest struct {
	PhoneNumber string  `json:"phone_number"`
	Password    string  `json:"password"`
	Username    *string `json:"username,omitempty"`
	Email       *string `json:"email,omitempty"`
	Role        string  `json:"role"`
	Pincode     *string `json:"pincode,omitempty"`
	City        *string `json:"city,omitempty"`
	State       *string `json:"state,omitempty"`
}

type CreateUserResponse struct {
	UserID uuid.UUID `json:"user_id"`
}

func CreateUser(
	ctx context.Context,
	db *pgxpool.Pool,
	phoneNumber string,
	password string,
	username *string,
	email *string,
	role string,
	pincode *string,
	city *string,
	state *string,
) (uuid.UUID, error) {

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return uuid.Nil, err
	}

	if role == "" {
		role = "partner"
	}

	var lat, lng *float64
	if pincode != nil && *pincode != "" {
		if result, ok := utils.GeocodePincode(*pincode); ok {
			lat, lng = &result.Lat, &result.Lng
			// Prefer the caller's (admin-edited) city/state; fall back to
			// the geocoded value only when the caller didn't supply one.
			if city == nil || *city == "" {
				city = &result.City
			}
			if state == nil || *state == "" {
				state = &result.State
			}
		}
	}

	query := `
		INSERT INTO users (
			phone_number,
			password_hash,
			plain_password,
			username,
			email,
			role,
			pincode,
			city,
			state,
			latitude,
			longitude,
			is_phone_verified
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE)
		RETURNING id;
	`

	var userID uuid.UUID
	err = db.QueryRow(
		ctx,
		query,
		phoneNumber,
		hashedPassword,
		password,
		username,
		email,
		role,
		pincode,
		city,
		state,
		lat,
		lng,
	).Scan(&userID)

	return userID, err
}

func GetUserByPhone(
	ctx context.Context,
	db *pgxpool.Pool,
	phoneNumber string,
) (*User, error) {
	query := `
		SELECT
			id, phone_number, password_hash, username, email,
			role, customer_type, special_tile_image_key, team_owner_id, is_phone_verified, onboarding_step,
			default_transport_mode, last_login_at, created_at, updated_at, rid, billing_address, shipping_address
		FROM users
		WHERE phone_number = $1;
	`

	var u User
	err := db.QueryRow(ctx, query, phoneNumber).Scan(
		&u.ID, &u.PhoneNumber, &u.PasswordHash, &u.Username, &u.Email,
		&u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID, &u.IsPhoneVerified, &u.OnboardingStep,
		&u.DefaultTransportMode, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt, &u.Rid, &u.BillingAddress, &u.ShippingAddress,
	)
	if err != nil {
		return nil, err
	}
	if u.SpecialTileImageKey != nil {
		u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
	}
	applyEffectiveCustomerType(ctx, db, &u)
	return &u, nil
}

// applyEffectiveCustomerType lets a team member inherit their partner's
// customer_type/special tile image on their own user object — so the
// existing "Special" division nav/page/products-page logic, which all key
// off user.customer_type, works for team members without any frontend
// changes. Only ever overlays for role == team_member, so it can't recurse
// (the owner's own role is never team_member).
func applyEffectiveCustomerType(ctx context.Context, db *pgxpool.Pool, u *User) {
	if u.Role != "team_member" || u.TeamOwnerID == nil {
		return
	}
	owner, err := GetUserByID(ctx, db, *u.TeamOwnerID)
	if err != nil {
		return
	}
	u.CustomerType = owner.CustomerType
	u.SpecialTileImageURL = owner.SpecialTileImageURL
}

func GetUserByID(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
) (*User, error) {
	query := `
		SELECT
			id, phone_number, username, email,
			role, customer_type, special_tile_image_key, team_owner_id, is_phone_verified, onboarding_step,
			default_transport_mode, last_login_at, created_at, updated_at, rid, billing_address, shipping_address
		FROM users
		WHERE id = $1;
	`

	var u User
	err := db.QueryRow(ctx, query, userID).Scan(
		&u.ID, &u.PhoneNumber, &u.Username, &u.Email,
		&u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID, &u.IsPhoneVerified, &u.OnboardingStep,
		&u.DefaultTransportMode, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt, &u.Rid, &u.BillingAddress, &u.ShippingAddress,
	)
	if err != nil {
		return nil, err
	}
	if u.SpecialTileImageKey != nil {
		u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
	}
	applyEffectiveCustomerType(ctx, db, &u)
	return &u, nil
}

func UpdateLastLogin(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	_, err := db.Exec(ctx, `UPDATE users SET last_login_at = NOW() WHERE id = $1`, userID)
	return err
}

func GetLastUsers(
	ctx context.Context,
	db *pgxpool.Pool,
	limit int,
) ([]User, error) {

	query := `
		SELECT
			id,
			phone_number,
			username,
			email,
			role,
			is_phone_verified,
			last_login_at,
			created_at,
			updated_at
		FROM users
		ORDER BY created_at DESC
		LIMIT $1;
	`

	rows, err := db.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)

	for rows.Next() {
		var u User
		err := rows.Scan(
			&u.ID,
			&u.PhoneNumber,
			&u.Username,
			&u.Email,
			&u.Role,
			&u.IsPhoneVerified,
			&u.LastLoginAt,
			&u.CreatedAt,
			&u.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		users = append(users, u)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return users, nil
}

// GetUserByIDFull returns user with plain_password included (for admin view)
func GetUserByIDFull(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (*User, error) {
	query := `
		SELECT id, phone_number, username, email, plain_password,
			role, customer_type, special_tile_image_key, team_owner_id, is_phone_verified, onboarding_step,
			default_transport_mode, last_login_at, created_at, updated_at, rid, billing_address, shipping_address,
			pincode, city, state
		FROM users
		WHERE id = $1
	`
	var u User
	err := db.QueryRow(ctx, query, userID).Scan(
		&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.PlainPassword,
		&u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID, &u.IsPhoneVerified, &u.OnboardingStep,
		&u.DefaultTransportMode, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt, &u.Rid, &u.BillingAddress, &u.ShippingAddress,
		&u.Pincode, &u.City, &u.State,
	)
	if err != nil {
		return nil, err
	}
	if u.SpecialTileImageKey != nil {
		u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
	}
	return &u, nil
}

// ErrWrongPassword is returned by a self-service password change when the
// supplied current password doesn't match.
var ErrWrongPassword = errors.New("current password is incorrect")

// GetPasswordHash fetches just the stored hash, for verifying a user's
// current password before letting them set a new one.
func GetPasswordHash(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (string, error) {
	var hash string
	err := db.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash)
	return hash, err
}

func UpdateUserPassword(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, newPassword string) error {
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx,
		`UPDATE users SET password_hash = $1, plain_password = $2, updated_at = NOW() WHERE id = $3`,
		hashedPassword, newPassword, userID,
	)
	return err
}

func DeleteUser(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	_, err := db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

func UpdateUserRole(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, role string) error {
	_, err := db.Exec(ctx,
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`,
		role, userID,
	)
	return err
}

// UpdateCustomerType sets a partner's product-catalog type ("normal" or
// "special"). Never set at onboarding — admin-only, changed later via the
// partner detail page.
func UpdateCustomerType(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, customerType string) error {
	_, err := db.Exec(ctx,
		`UPDATE users SET customer_type = $1, updated_at = NOW() WHERE id = $2`,
		customerType, userID,
	)
	return err
}

// GetUserByRid looks up the partner already linked to a Marg party RID, if
// any — used to prevent linking the same Marg party to two accounts.
func GetUserByRid(ctx context.Context, db *pgxpool.Pool, rid string) (*User, error) {
	var u User
	err := db.QueryRow(ctx, `SELECT id, phone_number, role FROM users WHERE rid = $1 LIMIT 1`, rid).
		Scan(&u.ID, &u.PhoneNumber, &u.Role)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// UpdateRid sets a partner's linked Marg party RID (margmaster_party.rid) —
// admin-only, set manually since Marg's party list has no direct link back
// to a Moulins account. Pass nil to clear.
func UpdateRid(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, rid *string) error {
	_, err := db.Exec(ctx,
		`UPDATE users SET rid = $1, updated_at = NOW() WHERE id = $2`,
		rid, userID,
	)
	return err
}

// UpdateAddresses sets a partner's own billing/shipping address — either
// pointer may be nil to leave that field unchanged.
func UpdateAddresses(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, billing, shipping *string) error {
	_, err := db.Exec(ctx,
		`UPDATE users SET
			billing_address = COALESCE($1, billing_address),
			shipping_address = COALESCE($2, shipping_address),
			updated_at = NOW()
		 WHERE id = $3`,
		billing, shipping, userID,
	)
	return err
}

// UpdatePincode sets a partner's pincode and re-geocodes city/state/lat/lng
// from it, mirroring the geocoding CreateUser does at signup. An empty
// pincode clears the pincode along with the geocoded fields it drove.
func UpdatePincode(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, pincode string) error {
	if pincode == "" {
		_, err := db.Exec(ctx,
			`UPDATE users SET pincode = NULL, city = NULL, state = NULL, latitude = NULL, longitude = NULL, updated_at = NOW() WHERE id = $1`,
			userID,
		)
		return err
	}

	var city, state *string
	var lat, lng *float64
	if result, ok := utils.GeocodePincode(pincode); ok {
		city, state = &result.City, &result.State
		lat, lng = &result.Lat, &result.Lng
	}

	_, err := db.Exec(ctx,
		`UPDATE users SET pincode = $1, city = $2, state = $3, latitude = $4, longitude = $5, updated_at = NOW() WHERE id = $6`,
		pincode, city, state, lat, lng, userID,
	)
	return err
}

// ErrPhoneTaken is returned by UpdatePhoneNumber when the new phone number
// is already registered to a different user.
var ErrPhoneTaken = errors.New("phone number is already registered")

// UpdateEmail sets a user's own email address — used both by admin edits
// and by a partner adding/changing their own email from their profile. An
// empty string clears it.
func UpdateEmail(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, email string) error {
	var e *string
	if email != "" {
		e = &email
	}
	_, err := db.Exec(ctx, `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`, e, userID)
	return err
}

// UpdatePhoneNumber changes a partner's login phone number, rejecting the
// change if another user already has it.
func UpdatePhoneNumber(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, phone string) error {
	if other, err := GetUserByPhone(ctx, db, phone); err == nil && other != nil && other.ID != userID {
		return ErrPhoneTaken
	}
	_, err := db.Exec(ctx, `UPDATE users SET phone_number = $1, updated_at = NOW() WHERE id = $2`, phone, userID)
	return err
}

// UpdateDefaultTransportMode sets a partner's default order transport mode
// ("courier" or "transport") — pre-fills the picker at checkout, but can
// still be overridden per order.
func UpdateDefaultTransportMode(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, mode string) error {
	valid, err := IsValidTransportMode(ctx, db, mode)
	if err != nil {
		return err
	}
	if !valid {
		return fmt.Errorf("invalid transport mode: %s", mode)
	}
	_, err = db.Exec(ctx,
		`UPDATE users SET default_transport_mode = $1, updated_at = NOW() WHERE id = $2`,
		mode, userID,
	)
	return err
}

// UpdateSpecialTileImage sets (or, with a nil key, clears) the image shown
// on this customer's "Special" filter tile on the products page.
func UpdateSpecialTileImage(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, imageKey *string) error {
	_, err := db.Exec(ctx,
		`UPDATE users SET special_tile_image_key = $1, updated_at = NOW() WHERE id = $2`,
		imageKey, userID,
	)
	return err
}

// ResolveOwnerID returns userID unchanged unless that user is a team_member
// with a team_owner_id set, in which case it returns the owning partner's
// id instead. Every doctor/meeting scoping call funnels through this so a
// team member automatically shares their partner's doctors/meetings.
func ResolveOwnerID(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (uuid.UUID, error) {
	u, err := GetUserByID(ctx, db, userID)
	if err != nil {
		return uuid.Nil, err
	}
	if u.Role == "team_member" && u.TeamOwnerID != nil {
		return *u.TeamOwnerID, nil
	}
	return userID, nil
}

// ValidateAssignee checks that assigneeID is either ownerID itself or a
// team_member owned by ownerID — used to make sure a partner can only
// assign meetings (etc.) to themselves or their own team, not anyone else.
func ValidateAssignee(ctx context.Context, db *pgxpool.Pool, ownerID, assigneeID uuid.UUID) (bool, error) {
	if assigneeID == ownerID {
		return true, nil
	}
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND team_owner_id = $2)`,
		assigneeID, ownerID,
	).Scan(&exists)
	return exists, err
}

// CreateTeamMember creates a login for a partner's team member — same
// account shape as any other user, just forced to role="team_member" and
// linked back to the owning partner.
func CreateTeamMember(ctx context.Context, db *pgxpool.Pool, ownerID uuid.UUID, phone, password string, username, email *string) (uuid.UUID, error) {
	id, err := CreateUser(ctx, db, phone, password, username, email, "team_member", nil, nil, nil)
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := db.Exec(ctx, `UPDATE users SET team_owner_id = $1 WHERE id = $2`, ownerID, id); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// CreateDoctorUser creates a login for a doctor — role="doctor", with the
// doctor's phone number used as both the login identity and the default
// password (this app has no email/SMS invite flow, so the doctor logs in
// with their own phone number both places and can change the password
// after). Doctors have no team_owner_id; access scoping instead goes
// through doctors.user_id (see GetMyDoctorProfile).
func CreateDoctorUser(ctx context.Context, db *pgxpool.Pool, phone string) (uuid.UUID, error) {
	return CreateUser(ctx, db, phone, phone, nil, nil, "doctor", nil, nil, nil)
}

// GetTeamMembers returns every team_member belonging to the given partner.
func GetTeamMembers(ctx context.Context, db *pgxpool.Pool, ownerID uuid.UUID) ([]User, error) {
	rows, err := db.Query(ctx,
		`SELECT id, phone_number, username, email, plain_password, role, customer_type, special_tile_image_key, team_owner_id,
			is_phone_verified, onboarding_step, last_login_at, created_at, updated_at
		 FROM users WHERE team_owner_id = $1 ORDER BY created_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.PlainPassword, &u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID,
			&u.IsPhoneVerified, &u.OnboardingStep, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		members = append(members, u)
	}
	return members, rows.Err()
}

// GetUsersByIDs batch-loads users for a set of IDs in one round trip —
// callers that need to look up several users (e.g. conversation
// participants) should use this instead of looping GetUserByID.
func GetUsersByIDs(ctx context.Context, db *pgxpool.Pool, ids []uuid.UUID) (map[uuid.UUID]*User, error) {
	result := make(map[uuid.UUID]*User, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := db.Query(ctx,
		`SELECT id, phone_number, username, email, role, customer_type, special_tile_image_key, team_owner_id
		 FROM users WHERE id = ANY($1::uuid[])`,
		uuidStrings(ids),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID); err != nil {
			return nil, err
		}
		if u.SpecialTileImageKey != nil {
			u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
		}
		result[u.ID] = &u
	}
	return result, rows.Err()
}

func GetUsersByRole(ctx context.Context, db *pgxpool.Pool, role string) ([]User, error) {
	query := `
		SELECT id, phone_number, username, email, plain_password, role, customer_type, special_tile_image_key,
			is_phone_verified, onboarding_step, pincode, city, state, latitude, longitude,
			last_login_at, created_at, updated_at, rid
		FROM users
		WHERE role = $1
		ORDER BY created_at DESC
	`
	rows, err := db.Query(ctx, query, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.PlainPassword, &u.Role, &u.CustomerType, &u.SpecialTileImageKey,
			&u.IsPhoneVerified, &u.OnboardingStep, &u.Pincode, &u.City, &u.State, &u.Latitude, &u.Longitude,
			&u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt, &u.Rid); err != nil {
			return nil, err
		}
		if u.SpecialTileImageKey != nil {
			u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
