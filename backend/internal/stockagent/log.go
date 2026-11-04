package stockagent

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Bedrock's price for the model in eu-central-1 (Frankfurt), USD per
// million tokens, as listed on 4 Nov 2026.
const (
	inputPerM  = 0.16
	outputPerM = 0.48
)

// DailyTokenLimit is how many tokens (input + output, everyone together)
// the agent may use in a day, India time. About $0.17 at the rates above.
const DailyTokenLimit = 1_000_000

// ErrDailyLimit: today's tokens are used up.
var ErrDailyLimit = errors.New("stockagent: daily token limit reached")

var ist = time.FixedZone("IST", 5*3600+1800)

// Cost is the price of an answer's tokens, in USD.
func Cost(in, out int64) float64 {
	return float64(in)*inputPerM/1e6 + float64(out)*outputPerM/1e6
}

// Usage is the agent's use over a period.
type Usage struct {
	Questions    int     `json:"questions"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	Tokens       int64   `json:"tokens"`
	CostUSD      float64 `json:"cost_usd"`
}

// UsageReport is today's and this month's use, against the daily limit.
type UsageReport struct {
	Today      Usage `json:"today"`
	Month      Usage `json:"month"`
	DailyLimit int64 `json:"daily_limit"`
	LeftToday  int64 `json:"left_today"`
}

func usageSince(ctx context.Context, db *pgxpool.Pool, since time.Time) (Usage, error) {
	var u Usage
	err := db.QueryRow(ctx, `
		SELECT COUNT(*)::int, COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cost_usd), 0)::float8
		FROM stock_agent_log WHERE created_at >= $1`, since).Scan(&u.Questions, &u.InputTokens, &u.OutputTokens, &u.CostUSD)
	u.Tokens = u.InputTokens + u.OutputTokens
	return u, err
}

// GetUsage reports today's and this month's use (India time).
func GetUsage(ctx context.Context, db *pgxpool.Pool) (UsageReport, error) {
	now := time.Now().In(ist)
	r := UsageReport{DailyLimit: DailyTokenLimit}
	var err error
	if r.Today, err = usageSince(ctx, db, time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, ist)); err != nil {
		return r, err
	}
	if r.Month, err = usageSince(ctx, db, time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, ist)); err != nil {
		return r, err
	}
	r.LeftToday = max(0, DailyTokenLimit-r.Today.Tokens)
	return r, nil
}

// Save records one question, answered or failed.
func Save(ctx context.Context, db *pgxpool.Pool, user *uuid.UUID, question string, a Answer, ms int64, askErr error) error {
	steps, err := json.Marshal(a.Steps)
	if err != nil {
		return err
	}
	var answer, errText *string
	if a.Answer != "" {
		answer = &a.Answer
	}
	if askErr != nil {
		s := askErr.Error()
		errText = &s
	}
	_, err = db.Exec(ctx, `
		INSERT INTO stock_agent_log (user_id, question, answer, steps, model, input_tokens, output_tokens, cost_usd, ms, error)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		user, question, answer, string(steps), model, a.InputTokens, a.OutputTokens, Cost(a.InputTokens, a.OutputTokens), ms, errText)
	return err
}

// LogEntry is one past question.
type LogEntry struct {
	ID           int64           `json:"id"`
	Question     string          `json:"question"`
	Answer       *string         `json:"answer"`
	Steps        json.RawMessage `json:"steps"`
	InputTokens  int64           `json:"input_tokens"`
	OutputTokens int64           `json:"output_tokens"`
	CostUSD      float64         `json:"cost_usd"`
	Ms           int64           `json:"ms"`
	Error        *string         `json:"error"`
	AskedBy      string          `json:"asked_by"`
	CreatedAt    time.Time       `json:"created_at"`
}

// History lists the latest questions, newest first; user narrows to one
// person's.
func History(ctx context.Context, db *pgxpool.Pool, user *uuid.UUID, limit int) ([]LogEntry, error) {
	rows, err := db.Query(ctx, `
		SELECT l.id, l.question, l.answer, l.steps, l.input_tokens, l.output_tokens, l.cost_usd::float8, l.ms, l.error,
		       COALESCE(u.username, ''), l.created_at
		FROM stock_agent_log l LEFT JOIN users u ON u.id = l.user_id
		WHERE $1::uuid IS NULL OR l.user_id = $1
		ORDER BY l.created_at DESC LIMIT $2`, user, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LogEntry{}
	for rows.Next() {
		var e LogEntry
		if err := rows.Scan(&e.ID, &e.Question, &e.Answer, &e.Steps, &e.InputTokens, &e.OutputTokens, &e.CostUSD, &e.Ms,
			&e.Error, &e.AskedBy, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
