package vectorsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type SearchResult struct {
	ID      string         `json:"id"`
	Score   float64        `json:"score"`
	Payload map[string]any `json:"payload"`
}

func qdrantRequest(ctx context.Context, cfg Config, method, path string, body any) ([]byte, error) {
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("vectorsearch: marshal qdrant request: %w", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}

	req, err := http.NewRequestWithContext(ctx, method, cfg.QdrantURL+path, reader)
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: build qdrant request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("api-key", cfg.QdrantAPIKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: qdrant request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("vectorsearch: read qdrant response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("vectorsearch: qdrant returned status %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func upsertPoint(ctx context.Context, cfg Config, id string, vector []float32, payload map[string]any) error {
	body := map[string]any{
		"points": []map[string]any{
			{"id": id, "vector": vector, "payload": payload},
		},
	}
	_, err := qdrantRequest(ctx, cfg, http.MethodPut, "/collections/products/points", body)
	return err
}

func deletePoint(ctx context.Context, cfg Config, id string) error {
	body := map[string]any{"points": []string{id}}
	_, err := qdrantRequest(ctx, cfg, http.MethodPost, "/collections/products/points/delete", body)
	return err
}

func searchPoints(ctx context.Context, cfg Config, vector []float32, limit int) ([]SearchResult, error) {
	body := map[string]any{
		"vector":       vector,
		"limit":        limit,
		"with_payload": true,
	}
	respBody, err := qdrantRequest(ctx, cfg, http.MethodPost, "/collections/products/points/search", body)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Result []SearchResult `json:"result"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("vectorsearch: parse search response: %w", err)
	}
	return parsed.Result, nil
}
