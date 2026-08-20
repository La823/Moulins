package models

import (
	"context"
	"time"

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
	Placeholders string    `json:"placeholders"`
	Subject      string    `json:"subject"`
	BodyHTML     string    `json:"body_html"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const emailTemplateColumns = `id, key, label, description, trigger_mode, placeholders, subject, body_html, created_at, updated_at`

func scanEmailTemplate(row interface{ Scan(...any) error }, t *EmailTemplate) error {
	return row.Scan(&t.ID, &t.Key, &t.Label, &t.Description, &t.TriggerMode, &t.Placeholders, &t.Subject, &t.BodyHTML, &t.CreatedAt, &t.UpdatedAt)
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
