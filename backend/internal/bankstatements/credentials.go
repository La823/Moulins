package bankstatements

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Keys of the rows in stored_credentials this package uses.
const (
	CredGmailToken = "gmail_reader_token" // Gmail API refresh token for the statements mailbox
)

// ErrNoCredential means stored_credentials has no row for the key.
var ErrNoCredential = errors.New("credential not saved")

// credentialsKey is the AES-256 key from CREDENTIALS_KEY (32 bytes, base64).
// It lives only in the environment, so the database alone can't reveal a
// password.
func credentialsKey() ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv("CREDENTIALS_KEY"))
	if raw == "" {
		return nil, errors.New("CREDENTIALS_KEY is not set")
	}
	k, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(k) != 32 {
		return nil, errors.New("CREDENTIALS_KEY must be 32 bytes, base64-encoded")
	}
	return k, nil
}

func seal(plain string) (string, error) {
	k, err := credentialsKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(plain), nil)), nil
}

func open(enc string) (string, error) {
	k, err := credentialsKey()
	if err != nil {
		return "", err
	}
	data, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("stored secret is too short")
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return "", errors.New("could not decrypt stored secret (wrong CREDENTIALS_KEY?)")
	}
	return string(plain), nil
}

// GetCredential returns the decrypted secret saved under key.
func GetCredential(ctx context.Context, db *pgxpool.Pool, key string) (string, error) {
	var enc string
	err := db.QueryRow(ctx, `SELECT secret_enc FROM stored_credentials WHERE key = $1`, key).Scan(&enc)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("%s: %w", key, ErrNoCredential)
	}
	if err != nil {
		return "", err
	}
	return open(enc)
}

// SetCredential saves (or replaces) a secret. Empty label/username/notes keep
// what is already stored.
func SetCredential(ctx context.Context, db *pgxpool.Pool, key, label, username, secret, notes string) error {
	enc, err := seal(secret)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `
		INSERT INTO stored_credentials (key, label, username, secret_enc, notes, updated_at)
		VALUES ($1, COALESCE(NULLIF($2, ''), $1), NULLIF($3, ''), $4, NULLIF($5, ''), now())
		ON CONFLICT (key) DO UPDATE SET
			label      = COALESCE(NULLIF($2, ''), stored_credentials.label),
			username   = COALESCE(NULLIF($3, ''), stored_credentials.username),
			notes      = COALESCE(NULLIF($5, ''), stored_credentials.notes),
			secret_enc = $4,
			updated_at = now()`, key, label, username, enc, notes)
	return err
}
