package productrag

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
)

// Gemini reads the PDFs and writes the answers, on the GEMINI_API_KEY
// free tier. Flash is fast and reads PDFs natively — each page as an image
// as well as its text, so scanned pages and slide decks come through too.
//
// Flash-Lite, measured 28 Oct 2026 on the same question: ~2s per answer
// against 8–22s for gemini-3.5-flash, with the same facts, structure and
// citations, and more free-tier headroom (Flash was turning requests away
// as busy). gemini-2.5-flash is closed to new keys, and gemini-3.8-flash
// did not respond on this one within two minutes.
//
// Variables rather than constants so live_test.go can compare settings.
var geminiModel = "gemini-3.5-flash-lite"

// Low thinking: the work here is reading supplied material, not reasoning.
var geminiThinking = "low"

// ErrDeclined is returned when the model will not answer the question.
var ErrDeclined = errors.New("productrag: model declined")

// ErrBusy is returned when Gemini's rate limit or quota is used up — on the
// free tier, a burst of questions can reach it.
var ErrBusy = errors.New("productrag: model busy")

var geminiHTTP = &http.Client{Timeout: 3 * time.Minute}

// geminiRequest is one generateContent call: optional system instruction,
// the user turn's parts (text and/or inline files), and, when schema is
// set, a JSON response that must match it.
type geminiRequest struct {
	System    string
	Parts     []map[string]any
	Schema    map[string]any
	MaxTokens int
}

func textPart(s string) map[string]any { return map[string]any{"text": s} }

func pdfPart(base64Data string) map[string]any {
	return map[string]any{"inline_data": map[string]any{"mime_type": "application/pdf", "data": base64Data}}
}

// geminiRetryWaits is how long to wait before each retry of a request Gemini
// turned away as overloaded (500/503) — on the free tier, "high demand"
// spikes are common and usually pass within seconds.
var geminiRetryWaits = []time.Duration{2 * time.Second, 5 * time.Second, 10 * time.Second}

func postGemini(ctx context.Context, key string, body []byte) ([]byte, error) {
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			"https://generativelanguage.googleapis.com/v1beta/models/"+geminiModel+":generateContent", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-goog-api-key", key) // a header, so the key never sits in a logged URL

		resp, err := geminiHTTP.Do(req)
		if err != nil {
			return nil, fmt.Errorf("productrag: gemini request: %w", err)
		}
		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("productrag: read gemini response: %w", err)
		}

		switch {
		case resp.StatusCode == http.StatusOK:
			return respBody, nil
		case resp.StatusCode == http.StatusTooManyRequests:
			return nil, ErrBusy
		case (resp.StatusCode == http.StatusServiceUnavailable || resp.StatusCode == http.StatusInternalServerError) &&
			attempt < len(geminiRetryWaits):
			select {
			case <-time.After(geminiRetryWaits[attempt]):
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		case resp.StatusCode == http.StatusServiceUnavailable:
			return nil, ErrBusy
		default:
			return nil, fmt.Errorf("productrag: gemini returned %d: %s", resp.StatusCode, respBody)
		}
	}
}

// generate returns the model's text and whether it stopped early because
// it ran out of output tokens.
func generate(ctx context.Context, r geminiRequest) (text string, truncated bool, err error) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		return "", false, fmt.Errorf("productrag: GEMINI_API_KEY not configured")
	}
	config := map[string]any{
		"maxOutputTokens": r.MaxTokens,
		"thinkingConfig":  map[string]any{"thinkingLevel": geminiThinking},
	}
	if r.Schema != nil {
		config["responseMimeType"] = "application/json"
		config["responseSchema"] = r.Schema
	}
	body := map[string]any{
		"contents":         []any{map[string]any{"role": "user", "parts": r.Parts}},
		"generationConfig": config,
	}
	if r.System != "" {
		body["systemInstruction"] = map[string]any{"parts": []any{textPart(r.System)}}
	}
	b, err := json.Marshal(body)
	if err != nil {
		return "", false, err
	}

	respBody, err := postGemini(ctx, key, b)
	if err != nil {
		return "", false, err
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text    string `json:"text"`
					Thought bool   `json:"thought"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", false, fmt.Errorf("productrag: parse gemini response: %w", err)
	}
	if parsed.PromptFeedback.BlockReason != "" || len(parsed.Candidates) == 0 {
		return "", false, ErrDeclined
	}
	c := parsed.Candidates[0]
	switch c.FinishReason {
	case "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII":
		return "", false, ErrDeclined
	}
	var sb strings.Builder
	for _, p := range c.Content.Parts {
		if !p.Thought {
			sb.WriteString(p.Text)
		}
	}
	return strings.TrimSpace(sb.String()), c.FinishReason == "MAX_TOKENS", nil
}
