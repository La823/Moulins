// Package stockagent is a small LLM agent that answers questions about
// product stock: shortages, expiry risk, slow movers, one product's outlook.
//
// It never sees the database. The model (Gemma on AWS Bedrock) is given the
// rules below and the tools in tools.go; it decides which tools to call, our
// code runs them against the live Marg tables, and the model writes the
// answer from what they return. So the data is always today's, and every
// number comes from our own queries rather than the model's arithmetic.
package stockagent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// The largest Gemma on our Bedrock key (google.gemma-4-e2b, which the
	// vector search uses, is too small to chain tool calls reliably).
	model     = "google.gemma-4-26b-a4b"
	maxTokens = 4000
	// maxSteps caps the tool round trips for one question.
	maxSteps = 8
	// maxResultBytes keeps one tool result from flooding the context.
	maxResultBytes = 60_000
)

// rules is how the business reads stock. Exact definitions (90-day cover,
// expiry risk) are computed in margede; these tell the model what they mean
// and how to report. Move them to a table if they need editing without a
// deploy.
const rules = `You are the stock analyst for Moulins Pharma, a pharmaceutical distributor in India.
You answer the team's questions about product stock using the tools, which read live Marg data.

Definitions (already computed by the tools, do not recompute):
- Usable stock: units in batches that have not expired. Expired stock is reported separately and cannot be sold.
- Sale rate: units leaving stock per month (invoices, unbilled challans, free units included), averaged over full months. The month in progress is not in the averages.
- Short / needs order: usable stock covers fewer than 90 days at the 3-month average. suggested_qty brings it to 90 days; still_to_order is that less what is already on open purchase orders.
- Expiry risk: units that will not sell before (expiry - 90 days) at the 3-month average. A product marked too_new has under 30 days of history, so its averages are a first guess.
- Negative batch stock is a Marg entry error to correct, not real stock.

Rules:
- Every figure in your answer must come from a tool result. Never estimate or invent numbers. If the tools cannot answer, say what is missing.
- Call tools as needed; look a product up with get_stock before get_product.
- A name often matches several products (pack sizes, variants). If get_stock matches more than one, say how many matched and cover all of them: get_expiry_risk and get_shortages take the same search word and check every match at once. Or ask which one is meant. Never pick a few silently.
- When listing shortages, put products with nothing on order first and say whether each has an open PO.
- Quantities are units; money is Indian rupees (write ₹ with Indian digit grouping, e.g. ₹1,25,000), ex GST.
- Answer in short markdown: one-line summary, then a compact table or bullets, then at most 3 suggested actions. No long preambles.`

// Step is one tool call the agent made, for the answer's audit trail.
type Step struct {
	Tool  string          `json:"tool"`
	Input json.RawMessage `json:"input"`
	Error string          `json:"error,omitempty"`
	Ms    int64           `json:"ms"`
}

// Answer is the agent's reply.
type Answer struct {
	Answer       string `json:"answer"`
	Steps        []Step `json:"steps"`
	InputTokens  int64  `json:"input_tokens"`
	OutputTokens int64  `json:"output_tokens"`
}

// ErrNoKey: BEDROCK_API_KEY or BEDROCK_REGION is not set.
var ErrNoKey = errors.New("stockagent: BEDROCK_API_KEY / BEDROCK_REGION not set")

// The OpenAI-style chat completions shapes Bedrock accepts.
type toolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"` // JSON text
	} `json:"function"`
}

type message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type chatRequest struct {
	Model       string    `json:"model"`
	Messages    []message `json:"messages"`
	Tools       []any     `json:"tools"`
	ToolChoice  string    `json:"tool_choice"`
	MaxTokens   int       `json:"max_tokens"`
	Temperature float64   `json:"temperature"`
}

type chatResponse struct {
	Choices []struct {
		Message      message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
	} `json:"usage"`
}

var httpClient = &http.Client{Timeout: 2 * time.Minute}

// Ask runs the agent loop for one question. Once the answer has used
// budget tokens (0: no budget) it gets no more tool calls and must answer
// with what it has, so one question can't run far past the daily limit.
func Ask(ctx context.Context, db *pgxpool.Pool, question string, budget int64) (Answer, error) {
	key, region := os.Getenv("BEDROCK_API_KEY"), os.Getenv("BEDROCK_REGION")
	if key == "" || region == "" {
		return Answer{}, ErrNoKey
	}
	url := fmt.Sprintf("https://bedrock-mantle.%s.api.aws/openai/v1/chat/completions", region)

	defs := make([]any, len(tools))
	for i, t := range tools {
		defs[i] = map[string]any{"type": "function", "function": t.def}
	}
	today := time.Now().In(time.FixedZone("IST", 5*3600+1800)).Format("Monday, 2 January 2006")
	messages := []message{
		{Role: "system", Content: rules + "\n\nToday is " + today + "."},
		{Role: "user", Content: question},
	}

	s := &session{db: db}
	out := Answer{Steps: []Step{}}
	for step := 0; ; step++ {
		req := chatRequest{Model: model, Messages: messages, Tools: defs, ToolChoice: "auto", MaxTokens: maxTokens, Temperature: 0.2}
		last := step == maxSteps || (budget > 0 && out.InputTokens+out.OutputTokens >= budget)
		if last {
			req.ToolChoice = "none" // out of tool calls or tokens: answer with what it has
		}
		resp, err := chat(ctx, url, key, req)
		if err != nil {
			return out, err
		}
		out.InputTokens += resp.Usage.PromptTokens
		out.OutputTokens += resp.Usage.CompletionTokens
		msg := resp.Choices[0].Message
		messages = append(messages, message{Role: "assistant", Content: msg.Content, ToolCalls: msg.ToolCalls})

		if len(msg.ToolCalls) == 0 || last {
			out.Answer = strings.TrimSpace(msg.Content)
			return out, nil
		}
		for _, c := range msg.ToolCalls {
			args := strings.TrimSpace(c.Function.Arguments)
			if args == "" {
				args = "{}"
			}
			content, st := runTool(ctx, s, c.Function.Name, json.RawMessage(args))
			out.Steps = append(out.Steps, st)
			messages = append(messages, message{Role: "tool", ToolCallID: c.ID, Content: content})
		}
	}
}

// chat sends one chat completions request.
func chat(ctx context.Context, url, key string, body chatRequest) (chatResponse, error) {
	var out chatResponse
	b, err := json.Marshal(body)
	if err != nil {
		return out, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return out, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := httpClient.Do(req)
	if err != nil {
		return out, fmt.Errorf("stockagent: bedrock request: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return out, fmt.Errorf("stockagent: read bedrock response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return out, fmt.Errorf("stockagent: bedrock %d: %.500s", resp.StatusCode, raw)
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, fmt.Errorf("stockagent: decode bedrock response: %w", err)
	}
	if len(out.Choices) == 0 {
		return out, errors.New("stockagent: bedrock returned no answer")
	}
	return out, nil
}

// runTool runs one tool call and returns its result as JSON text, or the
// error as text so the model can correct itself.
func runTool(ctx context.Context, s *session, name string, input json.RawMessage) (string, Step) {
	st := Step{Tool: name, Input: input}
	start := time.Now()
	text, err := func() (string, error) {
		t, ok := toolByName(name)
		if !ok {
			return "", errors.New("unknown tool " + name)
		}
		result, err := t.run(ctx, s, input)
		if err != nil {
			return "", err
		}
		b, err := json.Marshal(result)
		if len(b) > maxResultBytes {
			b = append(b[:maxResultBytes], "…(cut off: ask for fewer rows)"...)
		}
		return string(b), err
	}()
	st.Ms = time.Since(start).Milliseconds()
	if err != nil {
		st.Error = err.Error()
		return "Error: " + st.Error, st
	}
	return text, st
}

// RunToolForTest runs one tool outside the loop, for checking tool output.
func RunToolForTest(ctx context.Context, db *pgxpool.Pool, name, input string) (string, error) {
	text, st := runTool(ctx, &session{db: db}, name, json.RawMessage(input))
	if st.Error != "" {
		return text, errors.New(st.Error)
	}
	return text, nil
}
