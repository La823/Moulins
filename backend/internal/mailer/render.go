package mailer

import (
	"bytes"
	"context"
	"html/template"
	texttemplate "text/template"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// Render looks up the DB-backed template for key and executes its
// subject/body as Go html/template strings against data (a plain struct
// with exported fields matching the template's {{.Field}} placeholders).
// If the template row is missing (shouldn't happen once seeded, but this
// keeps a broken/deleted row from breaking the calling flow), it falls
// back to defaultTemplates[key] — the same copy the migration seeds.
func Render(ctx context.Context, db *pgxpool.Pool, key string, data any) (subject, htmlBody string, err error) {
	t, err := models.GetEmailTemplateByKey(ctx, db, key)
	subjectSrc, bodySrc := "", ""
	if err != nil {
		def, ok := defaultTemplates[key]
		if !ok {
			return "", "", err
		}
		subjectSrc, bodySrc = def.subject, def.body
	} else {
		subjectSrc, bodySrc = t.Subject, t.BodyHTML
	}

	subject, err = execute(key+"_subject", subjectSrc, data)
	if err != nil {
		return "", "", err
	}
	htmlBody, err = execute(key+"_body", bodySrc, data)
	if err != nil {
		return "", "", err
	}
	return subject, htmlBody, nil
}

func execute(name, src string, data any) (string, error) {
	tmpl, err := template.New(name).Parse(src)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// RenderText is Render's plain-text counterpart — used for the "whatsapp"
// channel, whose body isn't HTML and shouldn't go through html/template's
// auto-escaping (which would turn a customer's "&" into "&amp;" in a chat
// message). Whatsapp templates have no subject.
func RenderText(ctx context.Context, db *pgxpool.Pool, key string, data any) (body string, err error) {
	t, err := models.GetEmailTemplateByKey(ctx, db, key)
	bodySrc := ""
	if err != nil {
		def, ok := defaultTemplates[key]
		if !ok {
			return "", err
		}
		bodySrc = def.body
	} else {
		bodySrc = t.BodyHTML
	}

	tmpl, err := texttemplate.New(key + "_text").Parse(bodySrc)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

type defaultTemplate struct {
	subject string
	body    string
}

// defaultTemplates mirrors what migration 080_email_templates.sql seeds —
// a fallback only, so a missing/deleted DB row doesn't hard-fail a send.
const orderDetailsBlock = `
			<table style="width:100%;border-collapse:collapse;margin:16px 0">
				<thead>
					<tr>
						<th style="text-align:left;font-size:11px;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding:6px 0">Product</th>
						<th style="text-align:right;font-size:11px;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding:6px 0">Qty</th>
					</tr>
				</thead>
				<tbody>
					{{range .Items}}
					<tr>
						<td style="padding:6px 0;border-bottom:1px solid #f3f3f3;color:#333">{{.ProductName}}</td>
						<td style="padding:6px 0;border-bottom:1px solid #f3f3f3;color:#333;text-align:right">{{.Quantity}}</td>
					</tr>
					{{end}}
				</tbody>
			</table>
			{{if .TransportMode}}<p style="color:#555;font-size:13px">Transport: {{.TransportMode}}</p>{{end}}
			{{if .ShippingAddress}}<p style="color:#555;font-size:13px">Shipping to: {{.ShippingAddress}}</p>{{end}}`

var defaultTemplates = map[string]defaultTemplate{
	"order_placed": {
		subject: "Order {{.OrderCode}} received",
		body: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Order {{.OrderCode}}</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">We've received your order and it's being reviewed. We'll email you as it moves through confirmation, shipping, and delivery.</p>` + orderDetailsBlock + `
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>`,
	},
	"order_status_changed": {
		subject: "Order {{.OrderCode}} — {{.StatusLabel}}",
		body: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Order {{.OrderCode}}</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">Your order status has been updated to <strong>{{.StatusLabel}}</strong>.</p>` + orderDetailsBlock + `
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>`,
	},
	"order_received_whatsapp": {
		body: `Hi {{.CustomerName}}, we've received your order {{.OrderCode}}.

Items:
{{range .Items}}- {{.ProductName}} x{{.Quantity}}
{{end}}
{{if .TransportMode}}Transport: {{.TransportMode}}
{{end}}{{if .ShippingAddress}}Shipping to: {{.ShippingAddress}}
{{end}}
We'll keep you posted as it moves through confirmation, shipping, and delivery.

- Moulins Pharma`,
	},
	"partner_welcome_credentials": {
		subject: "Your Moulins Pharma account is ready",
		body: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Welcome to Moulins Pharma</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">Your account has been created. Here are your login details:</p>
			<table style="width:100%;border-collapse:collapse;margin:16px 0">
				<tr>
					<td style="padding:6px 0;color:#999;font-size:12px;text-transform:uppercase">Login (Phone)</td>
					<td style="padding:6px 0;color:#1a1a1a;font-weight:bold;text-align:right">{{.Phone}}</td>
				</tr>
				<tr>
					<td style="padding:6px 0;color:#999;font-size:12px;text-transform:uppercase">Password</td>
					<td style="padding:6px 0;color:#1a1a1a;font-weight:bold;text-align:right">{{.Password}}</td>
				</tr>
			</table>
			<p style="color:#555;font-size:13px">We recommend changing your password after your first login.</p>
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>`,
	},
}
