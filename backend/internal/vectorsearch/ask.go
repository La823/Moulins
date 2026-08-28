package vectorsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const bedrockModel = "google.gemma-4-e2b"

type bedrockChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type bedrockChatRequest struct {
	Model    string                `json:"model"`
	Messages []bedrockChatMessage `json:"messages"`
}

type bedrockChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// Ask embeds the question, retrieves the most relevant products from
// Qdrant, and has a Bedrock model answer using only that retrieved context —
// proves the full retrieval-augmented pipeline end to end.
func Ask(ctx context.Context, db *pgxpool.Pool, question string) (string, error) {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return "", err
	}
	if cfg.BedrockAPIKey == "" {
		return "", fmt.Errorf("vectorsearch: BEDROCK_API_KEY not configured")
	}
	if cfg.BedrockRegion == "" {
		return "", fmt.Errorf("vectorsearch: BEDROCK_REGION not configured")
	}

	qVector, err := EmbedText(ctx, cfg, question)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: embed question: %w", err)
	}

	results, err := searchPoints(ctx, cfg, qVector, 5)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: search products: %w", err)
	}

	var context_ strings.Builder
	if len(results) == 0 {
		context_.WriteString("No matching products were found.")
	}
	for i, r := range results {
		fmt.Fprintf(&context_, "Product %d:\n", i+1)
		for k, v := range r.Payload {
			fmt.Fprintf(&context_, "  %s: %v\n", k, v)
		}
	}

	systemPrompt := "You are a product assistant for a pharmaceutical distributor. " +
		"Answer the user's question using ONLY the product context provided below — " +
		"do not invent products, prices, or details that aren't present in the context. " +
		"If the context doesn't contain a relevant answer, say so plainly.\n\n" +
		"Product context:\n" + context_.String()

	reqBody, err := json.Marshal(bedrockChatRequest{
		Model: bedrockModel,
		Messages: []bedrockChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: question},
		},
	})
	if err != nil {
		return "", fmt.Errorf("vectorsearch: marshal bedrock request: %w", err)
	}

	url := fmt.Sprintf("https://bedrock-mantle.%s.api.aws/openai/v1/chat/completions", cfg.BedrockRegion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("vectorsearch: build bedrock request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.BedrockAPIKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: bedrock request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: read bedrock response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("vectorsearch: bedrock API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed bedrockChatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("vectorsearch: parse bedrock response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("vectorsearch: bedrock response had no content")
	}
	return parsed.Choices[0].Message.Content, nil
}
