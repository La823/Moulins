package vectorsearch

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// buildEmbedText concatenates the descriptive, human-language fields a
// question would actually be phrased around — deliberately excludes
// numeric/factual fields (price, stock, SKU codes), which live in the
// payload instead since embeddings match on meaning, not exact numbers.
func buildEmbedText(p *models.Product) string {
	parts := []string{p.Name}
	if p.Description != "" {
		parts = append(parts, p.Description)
	}
	if len(p.Categories) > 0 {
		parts = append(parts, "Category: "+strings.Join(p.Categories, ", "))
	}
	if len(p.Tags) > 0 {
		parts = append(parts, "Tags: "+strings.Join(p.Tags, ", "))
	}
	for _, f := range []*string{p.BrandName, p.KeyIngredients, p.KeyBenefits, p.SafetyInfo, p.ProductForm, p.ConsumeType, p.PackSize, p.Strength} {
		if f != nil && *f != "" {
			parts = append(parts, *f)
		}
	}
	return strings.Join(parts, ". ")
}

func buildPayload(p *models.Product) map[string]any {
	return map[string]any{
		"product_id":      p.ID.String(),
		"name":            p.Name,
		"description":     p.Description,
		"key_ingredients": deref(p.KeyIngredients),
		"key_benefits":    deref(p.KeyBenefits),
		"mrp":             p.Mrp,
		"price":           p.Price,
		"stock":           p.Stock,
		"moq":             p.Moq,
		"pack_size":       deref(p.PackSize),
		"categories":      p.Categories,
		"tags":            p.Tags,
		"is_active":       p.IsActive,
	}
}

// SyncProductByID re-embeds and upserts a single product's vector — the
// entry point used by both the create/update handlers (fire-and-forget,
// keeps the index live) and the backfill loop (one call per product).
func SyncProductByID(ctx context.Context, db *pgxpool.Pool, id uuid.UUID) error {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return err
	}

	product, err := models.GetProductByID(ctx, db, id)
	if err != nil {
		return fmt.Errorf("vectorsearch: load product: %w", err)
	}

	categories, err := models.GetProductCategories(ctx, db, id)
	if err != nil {
		return fmt.Errorf("vectorsearch: load categories: %w", err)
	}
	product.Categories = categories

	tags, err := models.GetProductTags(ctx, db, id)
	if err != nil {
		return fmt.Errorf("vectorsearch: load tags: %w", err)
	}
	product.Tags = tags

	vector, err := EmbedText(ctx, cfg, buildEmbedText(product))
	if err != nil {
		return fmt.Errorf("vectorsearch: embed product: %w", err)
	}

	if err := upsertPoint(ctx, cfg, id.String(), vector, buildPayload(product)); err != nil {
		return fmt.Errorf("vectorsearch: upsert point: %w", err)
	}
	return nil
}

// DeleteProductVector removes a product's point from Qdrant — no DB read
// needed, the product is already gone by the time this is called.
func DeleteProductVector(ctx context.Context, id uuid.UUID) error {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return err
	}
	if err := deletePoint(ctx, cfg, id.String()); err != nil {
		return fmt.Errorf("vectorsearch: delete point: %w", err)
	}
	return nil
}
