package productrag

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Voyage turns text into 1024-number vectors whose closeness means
// closeness of meaning. input_type matters: Voyage embeds a short question
// ("query") and a passage that might answer it ("document") slightly
// differently so that the two land near each other.
const (
	voyageModel     = "voyage-4-lite"
	embedDims       = 1024
	embedBatchSize  = 128 // Voyage's cap on texts per request
	embedMaxRetries = 6
	// A request is also capped by its estimated tokens (about 3 characters
	// each, erring high), so one request fits inside a minute's allowance
	// on Voyage's free tier — 10K tokens a minute until a payment method is
	// added. Bigger requests there are refused however often they retry.
	embedBatchChars = 24000
)

var httpClient = &http.Client{Timeout: 60 * time.Second}

type embedInputType string

const (
	inputQuery    embedInputType = "query"
	inputDocument embedInputType = "document"
)

// embed returns one vector per text, in order. Batches that hit Voyage's
// rate limit wait and try again, so a full re-index finishes on a free-tier
// key too, just more slowly.
func embed(ctx context.Context, texts []string, inputType embedInputType) ([][]float32, error) {
	key := os.Getenv("VOYAGE_API_KEY")
	if key == "" {
		return nil, fmt.Errorf("productrag: VOYAGE_API_KEY not configured")
	}
	out := make([][]float32, 0, len(texts))
	for start := 0; start < len(texts); {
		end, chars := start, 0
		for end < len(texts) && end-start < embedBatchSize && (end == start || chars+len(texts[end]) <= embedBatchChars) {
			chars += len(texts[end])
			end++
		}
		vecs, err := embedBatch(ctx, key, texts[start:end], inputType)
		if err != nil {
			return nil, err
		}
		out = append(out, vecs...)
		start = end
	}
	return out, nil
}

func embedBatch(ctx context.Context, key string, texts []string, inputType embedInputType) ([][]float32, error) {
	body, err := json.Marshal(map[string]any{
		"input":      texts,
		"model":      voyageModel,
		"input_type": inputType,
	})
	if err != nil {
		return nil, err
	}
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.voyageai.com/v1/embeddings", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+key)

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("productrag: voyage request: %w", err)
		}
		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("productrag: read voyage response: %w", err)
		}

		if resp.StatusCode == http.StatusTooManyRequests && attempt < embedMaxRetries {
			wait := time.Minute // limits are per minute

			if s, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && s > 0 {
				wait = time.Duration(s) * time.Second
			}
			select {
			case <-time.After(wait):
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("productrag: voyage returned %d: %s", resp.StatusCode, respBody)
		}

		var parsed struct {
			Data []struct {
				Index     int       `json:"index"`
				Embedding []float32 `json:"embedding"`
			} `json:"data"`
		}
		if err := json.Unmarshal(respBody, &parsed); err != nil {
			return nil, fmt.Errorf("productrag: parse voyage response: %w", err)
		}
		if len(parsed.Data) != len(texts) {
			return nil, fmt.Errorf("productrag: voyage returned %d vectors for %d texts", len(parsed.Data), len(texts))
		}
		vecs := make([][]float32, len(texts))
		for _, d := range parsed.Data {
			if d.Index < 0 || d.Index >= len(texts) || len(d.Embedding) != embedDims {
				return nil, fmt.Errorf("productrag: unexpected voyage vector (index %d, %d dims)", d.Index, len(d.Embedding))
			}
			vecs[d.Index] = d.Embedding
		}
		return vecs, nil
	}
}
