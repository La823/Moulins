package models

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const passwordResetTokenTTL = 30 * time.Minute

var ErrInvalidResetToken = errors.New("reset link is invalid or has expired")

// GeneratePasswordResetToken creates a new random reset token for a user,
// stores only its SHA-256 hash, and returns the raw token to embed in the
// reset-link email — the raw value is never persisted.
func GeneratePasswordResetToken(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	hashHex := hashResetToken(token)

	_, err := db.Exec(ctx,
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hashHex, time.Now().Add(passwordResetTokenTTL),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

// GetUserIDForResetToken validates a raw token: looks up its hash and
// confirms it hasn't expired or already been used.
func GetUserIDForResetToken(ctx context.Context, db *pgxpool.Pool, token string) (uuid.UUID, error) {
	var userID uuid.UUID
	err := db.QueryRow(ctx,
		`SELECT user_id FROM password_reset_tokens
		 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
		hashResetToken(token),
	).Scan(&userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, ErrInvalidResetToken
		}
		return uuid.Nil, err
	}
	return userID, nil
}

func MarkResetTokenUsed(ctx context.Context, db *pgxpool.Pool, token string) error {
	_, err := db.Exec(ctx,
		`UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1`,
		hashResetToken(token),
	)
	return err
}

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
