package vectorsearch

import (
	"fmt"
	"os"
)

// Config holds credentials for the product vector search pipeline —
// Qdrant (vector storage), Voyage AI (embeddings), and Bedrock (answers).
type Config struct {
	QdrantURL     string
	QdrantAPIKey  string
	VoyageAPIKey  string
	BedrockAPIKey string
	BedrockRegion string
}

func ConfigFromEnv() (Config, error) {
	cfg := Config{
		QdrantURL:     os.Getenv("QDRANT_URL"),
		QdrantAPIKey:  os.Getenv("QDRANT_API_KEY"),
		VoyageAPIKey:  os.Getenv("VOYAGE_API_KEY"),
		BedrockAPIKey: os.Getenv("BEDROCK_API_KEY"),
		BedrockRegion: os.Getenv("BEDROCK_REGION"),
	}
	if cfg.QdrantURL == "" || cfg.QdrantAPIKey == "" {
		return cfg, fmt.Errorf("vectorsearch: QDRANT_URL / QDRANT_API_KEY not configured")
	}
	if cfg.VoyageAPIKey == "" {
		return cfg, fmt.Errorf("vectorsearch: VOYAGE_API_KEY not configured")
	}
	return cfg, nil
}
