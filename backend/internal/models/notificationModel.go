package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Notification struct {
	ID               uuid.UUID  `json:"id"`
	Title            string     `json:"title"`
	Body             string     `json:"body"`
	ImageKey         *string    `json:"image_key,omitempty"`
	ImageURL         string     `json:"image_url,omitempty"`
	DeepLink         *string    `json:"deep_link,omitempty"`
	AudienceType     string     `json:"audience_type"`
	Status           string     `json:"status"`
	RecipientCount   int        `json:"recipient_count"`
	PushSuccessCount int        `json:"push_success_count"`
	PushFailureCount int        `json:"push_failure_count"`
	CreatedBy        *uuid.UUID `json:"created_by,omitempty"`
	SentAt           *time.Time `json:"sent_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

type CreateNotificationRequest struct {
	Title          string      `json:"title"`
	Body           string      `json:"body"`
	ImageKey       *string     `json:"image_key,omitempty"`
	DeepLink       *string     `json:"deep_link,omitempty"`
	ExcludeUserIDs []uuid.UUID `json:"exclude_user_ids"`
	CreatedBy      uuid.UUID   `json:"-"`
}

// NotificationInboxItem is a recipient row joined with its notification content,
// shaped for the mobile inbox.
type NotificationInboxItem struct {
	RecipientID    uuid.UUID  `json:"recipient_id"`
	NotificationID uuid.UUID  `json:"notification_id"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	ImageURL       string     `json:"image_url,omitempty"`
	DeepLink       *string    `json:"deep_link,omitempty"`
	IsRead         bool       `json:"is_read"`
	ReadAt         *time.Time `json:"read_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

func CreateNotification(ctx context.Context, db *pgxpool.Pool, req CreateNotificationRequest) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx, `
		INSERT INTO notifications (title, body, image_key, deep_link, audience_type, status, created_by)
		VALUES ($1, $2, $3, $4, 'all', 'sending', $5)
		RETURNING id
	`, req.Title, req.Body, req.ImageKey, req.DeepLink, req.CreatedBy).Scan(&id)
	return id, err
}

// CreateSingleUserNotification is the individual-send counterpart to
// CreateNotification's broadcast path — same table, audience_type
// distinguishes them, per the notification module's original design.
func CreateSingleUserNotification(ctx context.Context, db *pgxpool.Pool, title, body string, deepLink *string) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.QueryRow(ctx, `
		INSERT INTO notifications (title, body, deep_link, audience_type, status, sent_at)
		VALUES ($1, $2, $3, 'single_user', 'sent', NOW())
		RETURNING id
	`, title, body, deepLink).Scan(&id)
	return id, err
}

// uuidStrings converts UUIDs to strings — the simple_protocol query exec
// mode this DB connection uses (see DB_URL) can't auto-encode []uuid.UUID
// array params, so array params are passed as text and cast in SQL instead.
func uuidStrings(ids []uuid.UUID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = id.String()
	}
	return out
}

func CreateExclusions(ctx context.Context, db *pgxpool.Pool, notificationID uuid.UUID, userIDs []uuid.UUID) error {
	if len(userIDs) == 0 {
		return nil
	}
	notificationIDs := make([]string, len(userIDs))
	for i := range userIDs {
		notificationIDs[i] = notificationID.String()
	}
	_, err := db.Exec(ctx, `
		INSERT INTO notification_exclusions (notification_id, user_id)
		SELECT * FROM unnest($1::uuid[], $2::uuid[])
		ON CONFLICT DO NOTHING
	`, notificationIDs, uuidStrings(userIDs))
	return err
}

// GetEligibleUserIDs returns customer user IDs excluding the given set.
func GetEligibleUserIDs(ctx context.Context, db *pgxpool.Pool, excludedIDs []uuid.UUID) ([]uuid.UUID, error) {
	rows, err := db.Query(ctx, `
		SELECT id FROM users
		WHERE role = 'customer' AND NOT (id = ANY($1::uuid[]))
	`, uuidStrings(excludedIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func CreateRecipientsBatch(ctx context.Context, db *pgxpool.Pool, notificationID uuid.UUID, userIDs []uuid.UUID) error {
	if len(userIDs) == 0 {
		return nil
	}
	notificationIDs := make([]string, len(userIDs))
	for i := range userIDs {
		notificationIDs[i] = notificationID.String()
	}
	_, err := db.Exec(ctx, `
		INSERT INTO notification_recipients (notification_id, user_id)
		SELECT * FROM unnest($1::uuid[], $2::uuid[])
		ON CONFLICT DO NOTHING
	`, notificationIDs, uuidStrings(userIDs))
	return err
}

func UpdateNotificationStatus(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, status string, recipientCount, pushSuccess, pushFailure int) error {
	_, err := db.Exec(ctx, `
		UPDATE notifications
		SET status = $2, recipient_count = $3, push_success_count = $4, push_failure_count = $5, sent_at = NOW()
		WHERE id = $1
	`, id, status, recipientCount, pushSuccess, pushFailure)
	return err
}

func GetAllNotifications(ctx context.Context, db *pgxpool.Pool, limit, offset int) ([]Notification, int, error) {
	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM notifications`).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := db.Query(ctx, `
		SELECT id, title, body, image_key, deep_link, audience_type, status,
			recipient_count, push_success_count, push_failure_count, created_by, sent_at, created_at
		FROM notifications
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Title, &n.Body, &n.ImageKey, &n.DeepLink, &n.AudienceType, &n.Status,
			&n.RecipientCount, &n.PushSuccessCount, &n.PushFailureCount, &n.CreatedBy, &n.SentAt, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		list = append(list, n)
	}
	return list, total, rows.Err()
}

func GetNotificationByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) (*Notification, error) {
	var n Notification
	err := db.QueryRow(ctx, `
		SELECT id, title, body, image_key, deep_link, audience_type, status,
			recipient_count, push_success_count, push_failure_count, created_by, sent_at, created_at
		FROM notifications WHERE id = $1
	`, id).Scan(&n.ID, &n.Title, &n.Body, &n.ImageKey, &n.DeepLink, &n.AudienceType, &n.Status,
		&n.RecipientCount, &n.PushSuccessCount, &n.PushFailureCount, &n.CreatedBy, &n.SentAt, &n.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

// --- Mobile inbox ---

func GetUserNotifications(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, limit, offset int) ([]NotificationInboxItem, int, error) {
	var total int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_recipients WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := db.Query(ctx, `
		SELECT nr.id, nr.notification_id, n.title, n.body, n.image_key, n.deep_link,
			nr.is_read, nr.read_at, nr.created_at
		FROM notification_recipients nr
		JOIN notifications n ON n.id = nr.notification_id
		WHERE nr.user_id = $1
		ORDER BY nr.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := []NotificationInboxItem{}
	for rows.Next() {
		var item NotificationInboxItem
		var imageKey *string
		if err := rows.Scan(&item.RecipientID, &item.NotificationID, &item.Title, &item.Body, &imageKey,
			&item.DeepLink, &item.IsRead, &item.ReadAt, &item.CreatedAt); err != nil {
			return nil, 0, err
		}
		if imageKey != nil {
			item.ImageURL = *imageKey // resolved to a public URL by the handler
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func MarkNotificationRead(ctx context.Context, db *pgxpool.Pool, recipientID, userID uuid.UUID) error {
	_, err := db.Exec(ctx, `
		UPDATE notification_recipients
		SET is_read = TRUE, read_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, recipientID, userID)
	return err
}

// --- Device tokens ---

func UpsertDeviceToken(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, token, platform string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO device_tokens (user_id, token, platform, last_seen_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, last_seen_at = NOW()
	`, userID, token, platform)
	return err
}

func GetDeviceTokensForUsers(ctx context.Context, db *pgxpool.Pool, userIDs []uuid.UUID) ([]string, error) {
	if len(userIDs) == 0 {
		return []string{}, nil
	}
	rows, err := db.Query(ctx, `SELECT token FROM device_tokens WHERE user_id = ANY($1::uuid[])`, uuidStrings(userIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := []string{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

func DeactivateDeviceTokens(ctx context.Context, db *pgxpool.Pool, tokens []string) error {
	if len(tokens) == 0 {
		return nil
	}
	_, err := db.Exec(ctx, `DELETE FROM device_tokens WHERE token = ANY($1::text[])`, tokens)
	return err
}

// --- User search (for the exclude-picker) ---

func SearchUsers(ctx context.Context, db *pgxpool.Pool, query string, limit int) ([]User, error) {
	rows, err := db.Query(ctx, `
		SELECT id, phone_number, username, email, role,
			is_phone_verified, onboarding_step, last_login_at, created_at, updated_at
		FROM users
		WHERE role = 'customer' AND (username ILIKE $1 OR phone_number ILIKE $1)
		ORDER BY username
		LIMIT $2
	`, "%"+query+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.Email, &u.Role,
			&u.IsPhoneVerified, &u.OnboardingStep, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
