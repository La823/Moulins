package productrag

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// The assistant's vectors live in their own Qdrant collection, next to the
// older vectorsearch collections (products, doctors, meetings) on the same
// cluster. Each point is one chunk: its vector, plus a payload holding the
// chunk's text and which product/document it came from.
const collection = "product_assistant"

// payload fields that searches filter on; Qdrant Cloud filters only on
// indexed fields
var keywordIndexes = []string{"product_id", "source", "document_id"}

type point struct {
	ID      string         `json:"id"`
	Vector  []float32      `json:"vector,omitempty"`
	Payload map[string]any `json:"payload,omitempty"`
}

type scoredPoint struct {
	ID      string         `json:"id"`
	Score   float64        `json:"score"`
	Payload map[string]any `json:"payload"`
}

func qdrant(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	base, key := os.Getenv("QDRANT_URL"), os.Getenv("QDRANT_API_KEY")
	if base == "" || key == "" {
		return nil, 0, fmt.Errorf("productrag: QDRANT_URL / QDRANT_API_KEY not configured")
	}
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("api-key", key)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("productrag: qdrant request: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return respBody, resp.StatusCode, nil
}

func qdrantOK(ctx context.Context, method, path string, body any) ([]byte, error) {
	b, status, err := qdrant(ctx, method, path, body)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("productrag: qdrant %s %s returned %d: %s", method, path, status, b)
	}
	return b, nil
}

// ensureCollection creates the collection and its payload indexes the
// first time a sync runs; afterwards it is a single cheap GET.
func ensureCollection(ctx context.Context) error {
	_, status, err := qdrant(ctx, http.MethodGet, "/collections/"+collection, nil)
	if err != nil {
		return err
	}
	if status == http.StatusOK {
		return nil
	}
	if _, err := qdrantOK(ctx, http.MethodPut, "/collections/"+collection, map[string]any{
		"vectors": map[string]any{"size": embedDims, "distance": "Cosine"},
	}); err != nil {
		return err
	}
	for _, field := range keywordIndexes {
		if _, err := qdrantOK(ctx, http.MethodPut, "/collections/"+collection+"/index?wait=true", map[string]any{
			"field_name": field, "field_schema": "keyword",
		}); err != nil {
			return err
		}
	}
	return nil
}

// productFilter limits a request to the given products; nil ids means all.
func productFilter(ids []string, extra ...map[string]any) map[string]any {
	must := extra
	if ids != nil {
		must = append(must, map[string]any{"key": "product_id", "match": map[string]any{"any": ids}})
	}
	if len(must) == 0 {
		return nil
	}
	return map[string]any{"must": must}
}

// scrollPayloads lists every point matching filter, payload only.
func scrollPayloads(ctx context.Context, filter map[string]any, fields []string) ([]point, error) {
	var out []point
	var offset any
	for {
		body := map[string]any{"limit": 1000, "with_payload": fields, "with_vector": false}
		if filter != nil {
			body["filter"] = filter
		}
		if offset != nil {
			body["offset"] = offset
		}
		b, err := qdrantOK(ctx, http.MethodPost, "/collections/"+collection+"/points/scroll", body)
		if err != nil {
			return nil, err
		}
		var parsed struct {
			Result struct {
				Points []point `json:"points"`
				Next   any     `json:"next_page_offset"`
			} `json:"result"`
		}
		if err := json.Unmarshal(b, &parsed); err != nil {
			return nil, fmt.Errorf("productrag: parse scroll: %w", err)
		}
		out = append(out, parsed.Result.Points...)
		if parsed.Result.Next == nil {
			return out, nil
		}
		offset = parsed.Result.Next
	}
}

const upsertBatch = 64

func upsertPoints(ctx context.Context, pts []point) error {
	for start := 0; start < len(pts); start += upsertBatch {
		end := min(start+upsertBatch, len(pts))
		if _, err := qdrantOK(ctx, http.MethodPut, "/collections/"+collection+"/points?wait=true",
			map[string]any{"points": pts[start:end]}); err != nil {
			return err
		}
	}
	return nil
}

func deletePoints(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := qdrantOK(ctx, http.MethodPost, "/collections/"+collection+"/points/delete?wait=true",
		map[string]any{"points": ids})
	return err
}

// searchPoints returns the points nearest in meaning to vector.
func searchPoints(ctx context.Context, vector []float32, limit int, filter map[string]any) ([]scoredPoint, error) {
	body := map[string]any{"vector": vector, "limit": limit, "with_payload": true}
	if filter != nil {
		body["filter"] = filter
	}
	b, err := qdrantOK(ctx, http.MethodPost, "/collections/"+collection+"/points/search", body)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Result []scoredPoint `json:"result"`
	}
	if err := json.Unmarshal(b, &parsed); err != nil {
		return nil, fmt.Errorf("productrag: parse search: %w", err)
	}
	return parsed.Result, nil
}

func payloadString(p map[string]any, key string) string {
	s, _ := p[key].(string)
	return s
}
