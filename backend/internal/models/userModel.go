package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/utils"
)

type User struct {
	ID              uuid.UUID  `json:"id"`
	PhoneNumber     string     `json:"phone_number"`
	Username        *string    `json:"username,omitempty"`
	Email           *string    `json:"email,omitempty"`
	PasswordHash    string     `json:"-"`
	PlainPassword   *string    `json:"plain_password,omitempty"`
	Role            string     `json:"role"`
	IsPhoneVerified bool       `json:"is_phone_verified"`
	LastLoginAt     *time.Time `json:"last_login_at,omitempty"` // Pointer because it can be NULL
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	Permissions     []string   `json:"permissions,omitempty"`
}

type CreateUserRequest struct {
	PhoneNumber string  `json:"phone_number"`
	Password    string  `json:"password"`
	Username    *string `json:"username,omitempty"`
	Email       *string `json:"email,omitempty"`
	Role        string  `json:"role"`
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
) (uuid.UUID, error) {

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return uuid.Nil, err
	}

	if role == "" {
		role = "customer"
	}

	query := `
		INSERT INTO users (
			phone_number,
			password_hash,
			plain_password,
			username,
			email,
			role,
			is_phone_verified
		)
		VALUES ($1, $2, $3, $4, $5, $6, FALSE)
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
			role, is_phone_verified, last_login_at, created_at, updated_at
		FROM users
		WHERE phone_number = $1;
	`

	var u User
	err := db.QueryRow(ctx, query, phoneNumber).Scan(
		&u.ID, &u.PhoneNumber, &u.PasswordHash, &u.Username, &u.Email,
		&u.Role, &u.IsPhoneVerified, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func GetUserByID(
	ctx context.Context,
	db *pgxpool.Pool,
	userID uuid.UUID,
) (*User, error) {
	query := `
		SELECT
			id, phone_number, username, email,
			role, is_phone_verified, last_login_at, created_at, updated_at
		FROM users
		WHERE id = $1;
	`

	var u User
	err := db.QueryRow(ctx, query, userID).Scan(
		&u.ID, &u.PhoneNumber, &u.Username, &u.Email,
		&u.Role, &u.IsPhoneVerified, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
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
			role, is_phone_verified, last_login_at, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u User
	err := db.QueryRow(ctx, query, userID).Scan(
		&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.PlainPassword,
		&u.Role, &u.IsPhoneVerified, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
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

func GetUsersByRole(ctx context.Context, db *pgxpool.Pool, role string) ([]User, error) {
	query := `
		SELECT id, phone_number, username, email, plain_password, role,
			is_phone_verified, last_login_at, created_at, updated_at
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
		if err := rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.PlainPassword, &u.Role,
			&u.IsPhoneVerified, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
