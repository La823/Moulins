package vectorsearch

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AskScoped answers a question about the requesting owner's OWN doctors
// and meetings — the retrieval query itself is filtered by owner_id, so
// no other partner's data is ever pulled out of Qdrant in the first
// place, let alone sent to the LLM. Callers MUST pass the already-resolved
// effective owner id (see models.ResolveOwnerID), never a raw request
// param — there is no code path here that accepts an arbitrary owner.
func AskScoped(ctx context.Context, db *pgxpool.Pool, ownerID uuid.UUID, question string) (string, error) {
	cfg, err := ConfigFromEnv()
	if err != nil {
		return "", err
	}

	qVector, err := EmbedText(ctx, cfg, question)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: embed question: %w", err)
	}

	filter := map[string]any{
		"must": []map[string]any{
			{"key": "owner_id", "match": map[string]any{"value": ownerID.String()}},
		},
	}

	doctorResults, err := searchPoints(ctx, cfg, "doctors", qVector, 5, filter)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: search doctors: %w", err)
	}
	meetingResults, err := searchPoints(ctx, cfg, "meetings", qVector, 5, filter)
	if err != nil {
		return "", fmt.Errorf("vectorsearch: search meetings: %w", err)
	}

	var context_ strings.Builder
	if len(doctorResults) == 0 && len(meetingResults) == 0 {
		context_.WriteString("No matching doctors or meetings were found.")
	}
	for i, r := range doctorResults {
		fmt.Fprintf(&context_, "Doctor %d:\n", i+1)
		for k, v := range r.Payload {
			fmt.Fprintf(&context_, "  %s: %v\n", k, v)
		}
	}
	for i, r := range meetingResults {
		fmt.Fprintf(&context_, "Meeting %d:\n", i+1)
		for k, v := range r.Payload {
			fmt.Fprintf(&context_, "  %s: %v\n", k, v)
		}
	}

	systemPrompt := "You are an assistant for a pharmaceutical sales team, answering questions about " +
		"THEIR OWN doctors and meeting history only. " +
		"Answer the user's question using ONLY the context provided below — " +
		"do not invent doctors, meetings, or details that aren't present in the context. " +
		"If the context doesn't contain a relevant answer, say so plainly.\n\n" +
		"Context:\n" + context_.String()

	return callBedrock(ctx, cfg, systemPrompt, question)
}
