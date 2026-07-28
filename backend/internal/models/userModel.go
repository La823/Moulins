package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

type User struct {
	ID                  uuid.UUID  `json:"id"`
	PhoneNumber         string     `json:"phone_number"`
	Username            *string    `json:"username,omitempty"`
	Email               *string    `json:"email,omitempty"`
	PasswordHash        string     `json:"-"`
	PlainPassword       *string    `json:"plain_password,omitempty"`
	Role                string     `json:"role"`
	CustomerType        string     `json:"customer_type"`
	SpecialTileImageKey *string    `json:"-"`
	SpecialTileImageURL string     `json:"special_tile_image_url,omitempty"`
	TeamOwnerID         *uuid.UUID `json:"team_owner_id,omitempty"`
	IsPhoneVerified     bool       `json:"is_phone_verified"`
	OnboardingStep      int        `json:"onboarding_step"`
	Pincode             *string    `json:"pincode,omitempty"`
	City                *string    `json:"city,omitempty"`
	State               *string    `json:"state,omitempty"`
	Latitude            *float64   `json:"latitude,omitempty"`
	Longitude           *float64   `json:"longitude,omitempty"`
	LastLoginAt         *time.Time `json:"last_login_at,omitempty"` // Pointer because it can be NULL
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	Permissions         []string   `json:"permissions,omitempty"`
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
			role, customer_type, special_tile_image_key, team_owner_id, is_phone_verified, onboarding_step, last_login_at, created_at, updated_at
		FROM users
		WHERE phone_number = $1;
	`

	var u User
	err := db.QueryRow(ctx, query, phoneNumber).Scan(
		&u.ID, &u.PhoneNumber, &u.PasswordHash, &u.Username, &u.Email,
		&u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID, &u.IsPhoneVerified, &u.OnboardingStep, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
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
			role, customer_type, special_tile_image_key, team_owner_id, is_phone_verified, onboarding_step, last_login_at, created_at, updated_at
		FROM users
		WHERE id = $1;
	`

	var u User
	err := db.QueryRow(ctx, query, userID).Scan(
		&u.ID, &u.PhoneNumber, &u.Username, &u.Email,
		&u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID, &u.IsPhoneVerified, &u.OnboardingStep, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
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
			role, customer_type, special_tile_image_key, team_owner_id, is_phone_verified, onboarding_step, last_login_at, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u User
	err := db.QueryRow(ctx, query, userID).Scan(
		&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.PlainPassword,
		&u.Role, &u.CustomerType, &u.SpecialTileImageKey, &u.TeamOwnerID, &u.IsPhoneVerified, &u.OnboardingStep, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if u.SpecialTileImageKey != nil {
		u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
	}
	return &u, nil
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

// CreateTeamMember creates a login for a partner's team member — same
// account shape as any other user, just forced to role="team_member" and
// linked back to the owning partner.
func CreateTeamMember(ctx context.Context, db *pgxpool.Pool, ownerID uuid.UUID, phone, password string, username *string) (uuid.UUID, error) {
	id, err := CreateUser(ctx, db, phone, password, username, nil, "team_member", nil, nil, nil)
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := db.Exec(ctx, `UPDATE users SET team_owner_id = $1 WHERE id = $2`, ownerID, id); err != nil {
		return uuid.Nil, err
	}
	return id, nil
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

func GetUsersByRole(ctx context.Context, db *pgxpool.Pool, role string) ([]User, error) {
	query := `
		SELECT id, phone_number, username, email, plain_password, role, customer_type, special_tile_image_key,
			is_phone_verified, onboarding_step, pincode, city, state, latitude, longitude,
			last_login_at, created_at, updated_at
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
			&u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		if u.SpecialTileImageKey != nil {
			u.SpecialTileImageURL = utils.GetPublicURL(*u.SpecialTileImageKey)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
