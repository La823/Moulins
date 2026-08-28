package vectorsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

const voyageModel = "voyage-4-lite"

type voyageEmbedRequest struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
}

type voyageEmbedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

// EmbedText turns a single piece of text into a 1024-dim vector via
// Voyage AI's voyage-4-lite model — used for both product text at
// index time and a user's question at query time, so they land in the
// same vector space.
func EmbedText(ctx context.Context, cfg Config, text string) ([]float32, error) {
	body, err := json.Marshal(voyageEmbedRequest{Input: []string{text}, Model: voyageModel})
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: marshal embed request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.voyageai.com/v1/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: build embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.VoyageAPIKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: embed request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: read embed response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vectorsearch: voyage API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed voyageEmbedResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("vectorsearch: parse embed response: %w", err)
	}
	if len(parsed.Data) == 0 {
		return nil, fmt.Errorf("vectorsearch: embed response had no data")
	}
	return parsed.Data[0].Embedding, nil
}
