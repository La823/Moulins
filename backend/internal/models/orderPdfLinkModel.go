package models

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Order PDF links (migration 176): a customer opens their order's PDF from
// the WhatsApp message without logging in. The token is the only key, so it
// is 32 random bytes; a link lasts OrderPDFLinkDays.

const OrderPDFLinkDays = 30

// OrderPDFLink returns a live link token for the order, reusing one with at
// least a week left so a resent message carries the same link, else making
// a new one.
func OrderPDFLink(ctx context.Context, db *pgxpool.Pool, orderID uuid.UUID, by *uuid.UUID) (string, error) {
	var token string
	err := db.QueryRow(ctx, `
		SELECT token FROM order_pdf_links
		WHERE order_id = $1 AND expires_at > NOW() + interval '7 days'
		ORDER BY expires_at DESC LIMIT 1`, orderID).Scan(&token)
	if err == nil {
		return token, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	_, err = db.Exec(ctx, `
		INSERT INTO order_pdf_links (token, order_id, created_by, expires_at)
		VALUES ($1, $2, $3, NOW() + make_interval(days => $4))`, token, orderID, by, OrderPDFLinkDays)
	return token, err
}

// ErrLinkExpired: the link exists but has run out.
var ErrLinkExpired = errors.New("order pdf link expired")

// OpenOrderPDFLink finds the order a link is for and counts the opening.
// ErrNotFound for an unknown token, ErrLinkExpired for a lapsed one.
func OpenOrderPDFLink(ctx context.Context, db *pgxpool.Pool, token string) (uuid.UUID, error) {
	var orderID uuid.UUID
	var expires time.Time
	err := db.QueryRow(ctx, `
		UPDATE order_pdf_links SET opened_count = opened_count + 1, last_opened_at = NOW()
		WHERE token = $1 RETURNING order_id, expires_at`, token).Scan(&orderID, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrOrderPDFLinkNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	if time.Now().After(expires) {
		return uuid.Nil, ErrLinkExpired
	}
	return orderID, nil
}

// ErrOrderPDFLinkNotFound: no such link.
var ErrOrderPDFLinkNotFound = errors.New("order pdf link not found")
