// Package aiusage records each Gemini call a feature makes (tokens, photo
// size, estimated cost) in ai_usage (migration 188) and sums it for the
// panel's AI Usage page.
package aiusage

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lavanyaarora/server/internal/productrag"
)

// Paid-tier rates for gemini-3.5-flash-lite in US dollars per million
// tokens (third-party listings, 14 Nov 2026; Google's page did not list the
// model yet). Images cost the same as text in; thinking is billed as output.
// While the key is on the free tier the real bill is zero.
const (
	InputUSDPerMillion  = 0.30
	OutputUSDPerMillion = 2.50
)

// Feature names.
const FeaturePackingBatchRead = "packing_batch_read"

// Cost estimates a call's price at the paid rates.
func Cost(u productrag.Usage) float64 {
	return float64(u.PromptTokens)*InputUSDPerMillion/1e6 +
		float64(u.OutputTokens+u.ThinkingTokens)*OutputUSDPerMillion/1e6
}

// Call is one call to record.
type Call struct {
	Feature     string
	UserID      uuid.UUID
	OrderID     *uuid.UUID
	OrderItemID *uuid.UUID
	PhotoKey    string
	ImageBytes  int
	ImageWidth  int
	ImageHeight int
	MimeType    string
	Usage       productrag.Usage
	Duration    time.Duration
	Err         error
}

// Record stores a call. A failure here must never stop the feature, so
// callers log the error and carry on.
func Record(ctx context.Context, db *pgxpool.Pool, c Call) error {
	var errText *string
	if c.Err != nil {
		s := c.Err.Error()
		if len(s) > 500 {
			s = s[:500]
		}
		errText = &s
	}
	nz := func(n int) *int {
		if n == 0 {
			return nil
		}
		return &n
	}
	ns := func(s string) *string {
		if s == "" {
			return nil
		}
		return &s
	}
	var user *uuid.UUID
	if c.UserID != uuid.Nil {
		user = &c.UserID
	}
	u := c.Usage
	_, err := db.Exec(ctx, `
		INSERT INTO ai_usage (feature, model, user_id, order_id, order_item_id, photo_key, image_bytes, image_width, image_height,
		       mime_type, prompt_tokens, image_tokens, output_tokens, thinking_tokens, total_tokens, cost_usd, duration_ms, ok, error)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
		c.Feature, u.Model, user, c.OrderID, c.OrderItemID, ns(c.PhotoKey), nz(c.ImageBytes), nz(c.ImageWidth), nz(c.ImageHeight),
		ns(c.MimeType), u.PromptTokens, u.ImageTokens, u.OutputTokens, u.ThinkingTokens, u.TotalTokens, Cost(u),
		int(c.Duration.Milliseconds()), c.Err == nil, errText)
	return err
}

// Day is one day's totals for a feature.
type Day struct {
	Day            string  `json:"day"` // YYYY-MM-DD, IST
	Feature        string  `json:"feature"`
	Calls          int     `json:"calls"`
	Failed         int     `json:"failed"`
	PromptTokens   int64   `json:"prompt_tokens"`
	ImageTokens    int64   `json:"image_tokens"`
	OutputTokens   int64   `json:"output_tokens"`
	ThinkingTokens int64   `json:"thinking_tokens"`
	TotalTokens    int64   `json:"total_tokens"`
	CostUSD        float64 `json:"cost_usd"`
	ImageBytes     int64   `json:"image_bytes"`
}

// Row is one recorded call.
type Row struct {
	At             time.Time `json:"at"`
	Feature        string    `json:"feature"`
	Model          string    `json:"model"`
	User           string    `json:"user,omitempty"`
	OrderID        string    `json:"order_id,omitempty"`
	Customer       string    `json:"customer,omitempty"`
	Product        string    `json:"product,omitempty"`
	PhotoURL       string    `json:"photo_url,omitempty"`
	ImageBytes     int       `json:"image_bytes"`
	ImageWidth     int       `json:"image_width"`
	ImageHeight    int       `json:"image_height"`
	PromptTokens   int       `json:"prompt_tokens"`
	ImageTokens    int       `json:"image_tokens"`
	OutputTokens   int       `json:"output_tokens"`
	ThinkingTokens int       `json:"thinking_tokens"`
	TotalTokens    int       `json:"total_tokens"`
	CostUSD        float64   `json:"cost_usd"`
	DurationMs     int       `json:"duration_ms"`
	OK             bool      `json:"ok"`
	Error          string    `json:"error,omitempty"`
}

// Report is the AI Usage page: daily totals and the latest calls in a range.
type Report struct {
	From        string  `json:"from"`
	To          string  `json:"to"`
	InputRate   float64 `json:"input_usd_per_million"`
	OutputRate  float64 `json:"output_usd_per_million"`
	Days        []Day   `json:"days"`
	Calls       []Row   `json:"calls"`
	CallsShown  int     `json:"calls_shown"`
	CallsInSpan int     `json:"calls_in_span"`
}

// GetReport sums from..to (inclusive, IST dates YYYY-MM-DD) and lists the
// latest 300 calls in it.
func GetReport(ctx context.Context, db *pgxpool.Pool, from, to string, photoURL func(string) string) (*Report, error) {
	r := &Report{From: from, To: to, InputRate: InputUSDPerMillion, OutputRate: OutputUSDPerMillion, Days: []Day{}, Calls: []Row{}}
	const span = `a.created_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
	          AND a.created_at < ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`
	rows, err := db.Query(ctx, `
		SELECT to_char(a.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, a.feature,
		       COUNT(*)::int, COUNT(*) FILTER (WHERE NOT a.ok)::int,
		       SUM(a.prompt_tokens), SUM(a.image_tokens), SUM(a.output_tokens), SUM(a.thinking_tokens), SUM(a.total_tokens),
		       SUM(a.cost_usd)::float8, COALESCE(SUM(a.image_bytes), 0)
		FROM ai_usage a WHERE `+span+`
		GROUP BY 1, 2 ORDER BY 1 DESC, 2`, from, to)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var d Day
		if err := rows.Scan(&d.Day, &d.Feature, &d.Calls, &d.Failed, &d.PromptTokens, &d.ImageTokens, &d.OutputTokens,
			&d.ThinkingTokens, &d.TotalTokens, &d.CostUSD, &d.ImageBytes); err != nil {
			rows.Close()
			return nil, err
		}
		r.Days = append(r.Days, d)
		r.CallsInSpan += d.Calls
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = db.Query(ctx, `
		SELECT a.created_at, a.feature, a.model, COALESCE(NULLIF(u.username, ''), u.phone_number, ''),
		       COALESCE(a.order_id::text, ''), COALESCE(NULLIF(cu.username, ''), cu.phone_number, ''),
		       COALESCE(NULLIF(oi.product_name, ''), ''), COALESCE(a.photo_key, ''),
		       COALESCE(a.image_bytes, 0), COALESCE(a.image_width, 0), COALESCE(a.image_height, 0),
		       a.prompt_tokens, a.image_tokens, a.output_tokens, a.thinking_tokens, a.total_tokens, a.cost_usd::float8,
		       COALESCE(a.duration_ms, 0), a.ok, COALESCE(a.error, '')
		FROM ai_usage a
		LEFT JOIN users u ON u.id = a.user_id
		LEFT JOIN orders o ON o.id = a.order_id
		LEFT JOIN users cu ON cu.id = o.user_id
		LEFT JOIN order_items oi ON oi.id = a.order_item_id
		WHERE `+span+`
		ORDER BY a.created_at DESC LIMIT 300`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c Row
		var key string
		if err := rows.Scan(&c.At, &c.Feature, &c.Model, &c.User, &c.OrderID, &c.Customer, &c.Product, &key,
			&c.ImageBytes, &c.ImageWidth, &c.ImageHeight, &c.PromptTokens, &c.ImageTokens, &c.OutputTokens,
			&c.ThinkingTokens, &c.TotalTokens, &c.CostUSD, &c.DurationMs, &c.OK, &c.Error); err != nil {
			return nil, err
		}
		if key != "" && photoURL != nil {
			c.PhotoURL = photoURL(key)
		}
		r.Calls = append(r.Calls, c)
	}
	r.CallsShown = len(r.Calls)
	return r, rows.Err()
}
