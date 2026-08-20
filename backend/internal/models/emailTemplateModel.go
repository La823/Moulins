package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EmailTemplate is an editable, DB-backed email — either fired automatically
// by a backend event (trigger_mode "automated") or picked and sent by staff
// from an entity's detail page (trigger_mode "manual"). Subject/body are Go
// html/template strings; Placeholders is a human-readable hint of what
// variables that template's data struct provides, shown in the editor.
type EmailTemplate struct {
	ID           string    `json:"id"`
	Key          string    `json:"key"`
	Label        string    `json:"label"`
	Description  string    `json:"description"`
	TriggerMode  string    `json:"trigger_mode"`
	Channel      string    `json:"channel"` // "email" or "whatsapp"
	Placeholders string    `json:"placeholders"`
	Subject      string    `json:"subject"`
	BodyHTML     string    `json:"body_html"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const emailTemplateColumns = `id, key, label, description, trigger_mode, channel, placeholders, subject, body_html, created_at, updated_at`

func scanEmailTemplate(row interface{ Scan(...any) error }, t *EmailTemplate) error {
	return row.Scan(&t.ID, &t.Key, &t.Label, &t.Description, &t.TriggerMode, &t.Channel, &t.Placeholders, &t.Subject, &t.BodyHTML, &t.CreatedAt, &t.UpdatedAt)
}

func ListEmailTemplates(ctx context.Context, db *pgxpool.Pool) ([]EmailTemplate, error) {
	rows, err := db.Query(ctx, `SELECT `+emailTemplateColumns+` FROM email_templates ORDER BY label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	templates := []EmailTemplate{}
	for rows.Next() {
		var t EmailTemplate
		if err := scanEmailTemplate(rows, &t); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, rows.Err()
}

func GetEmailTemplateByKey(ctx context.Context, db *pgxpool.Pool, key string) (*EmailTemplate, error) {
	var t EmailTemplate
	err := scanEmailTemplate(db.QueryRow(ctx, `SELECT `+emailTemplateColumns+` FROM email_templates WHERE key = $1`, key), &t)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// UpdateEmailTemplate lets an admin edit only the copy — subject and body —
// never the key or trigger_mode, which are fixed at the code level that
// invokes this template.
func UpdateEmailTemplate(ctx context.Context, db *pgxpool.Pool, key, subject, bodyHTML string) error {
	_, err := db.Exec(ctx,
		`UPDATE email_templates SET subject = $1, body_html = $2, updated_at = NOW() WHERE key = $3`,
		subject, bodyHTML, key,
	)
	return err
}

// EmailSendLogEntry is one record of a template actually going out —
// automated or manual, email or whatsapp — so a detail page can show
// "sent ✓" plus when, instead of staff having to guess or re-send blind.
type EmailSendLogEntry struct {
	ID          string     `json:"id"`
	TemplateKey string     `json:"template_key"`
	Channel     string     `json:"channel"`
	EntityType  string     `json:"entity_type"`
	EntityID    uuid.UUID  `json:"entity_id"`
	Recipient   string     `json:"recipient"`
	SentBy      *uuid.UUID `json:"sent_by,omitempty"`
	SentAt      time.Time  `json:"sent_at"`
}

// LogEmailSend records that a template was sent — called right after a
// successful mailer.Send/RenderText+wa.me hand-off, never speculatively.
// entityType/entityID scope it to whatever detail page should show the
// "sent" status (e.g. "order"/orderID, "partner"/userID).
func LogEmailSend(ctx context.Context, db *pgxpool.Pool, templateKey, channel, entityType string, entityID uuid.UUID, recipient string, sentBy *uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO email_send_log (template_key, channel, entity_type, entity_id, recipient, sent_by)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		templateKey, channel, entityType, entityID, recipient, sentBy,
	)
	return err
}

// ListEmailSendLog returns every send recorded for an entity, most recent
// first — a detail page typically only needs the latest per template_key,
// which the caller can reduce client-side.
func ListEmailSendLog(ctx context.Context, db *pgxpool.Pool, entityType string, entityID uuid.UUID) ([]EmailSendLogEntry, error) {
	rows, err := db.Query(ctx,
		`SELECT id, template_key, channel, entity_type, entity_id, recipient, sent_by, sent_at
		 FROM email_send_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY sent_at DESC`,
		entityType, entityID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []EmailSendLogEntry{}
	for rows.Next() {
		var e EmailSendLogEntry
		if err := rows.Scan(&e.ID, &e.TemplateKey, &e.Channel, &e.EntityType, &e.EntityID, &e.Recipient, &e.SentBy, &e.SentAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
