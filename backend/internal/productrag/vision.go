package productrag

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// ReadImageJSON asks Gemini to read one photo and answer as JSON matching
// schema, decoded into out. It uses the same model, key and retries as the
// product assistant; packing uses it to read batch prints off packs.
func ReadImageJSON(ctx context.Context, system, prompt, mimeType string, image []byte, schema map[string]any, out any) error {
	parts := []map[string]any{
		{"inline_data": map[string]any{"mime_type": mimeType, "data": base64.StdEncoding.EncodeToString(image)}},
		textPart(prompt),
	}
	text, truncated, err := generate(ctx, geminiRequest{System: system, Parts: parts, Schema: schema, MaxTokens: 1024})
	if err != nil {
		return err
	}
	if truncated {
		return fmt.Errorf("productrag: image answer cut short")
	}
	if err := json.Unmarshal([]byte(text), out); err != nil {
		return fmt.Errorf("productrag: parse image answer: %w", err)
	}
	return nil
}
