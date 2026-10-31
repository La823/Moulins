//go:build live

package productrag

// Live check of stage 1 against the real catalogue, Voyage and Qdrant —
// needs no Claude. Opt-in only:
//
//	go test -tags live -run TestLiveSearch -v ./internal/productrag/

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
)

func TestLiveSearch(t *testing.T) {
	_ = godotenv.Load("../../.env")
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()

	names := map[string]string{}
	all, err := loadSources(ctx, db, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range all {
		names[s.ID] = s.Name
	}

	for _, q := range []string{
		"tell me about planscar gel",
		"plancar injection", // misspelt
		"planscar",
		"something for joint pain",
		"what helps with acidity",
		"what is the weather today",
	} {
		cands, _, err := findCandidates(ctx, db, q)
		if err != nil {
			t.Fatalf("%q: %v", q, err)
		}
		t.Logf("\nQ: %s", q)
		for i, c := range cands[:min(5, len(cands))] {
			t.Logf("  %d. %-40s score=%.4f name=%.2f", i+1, names[c.ID], c.Score, c.NameSim)
		}
		var picked []string
		for _, c := range pickProducts(cands) {
			picked = append(picked, names[c.ID])
		}
		t.Logf("  picked: %v", picked)
	}
}

// Where an answer's time goes, stage by stage:
//
//	go test -tags live -run TestLiveTiming -v ./internal/productrag/
func TestLiveTiming(t *testing.T) {
	_ = godotenv.Load("../../.env")
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	q := "tell me about planscar gel"

	start := time.Now()
	vecs, err := embed(ctx, []string{q}, inputQuery)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("voyage embed      %s", time.Since(start).Round(time.Millisecond))

	start = time.Now()
	if _, err := searchPoints(ctx, vecs[0], listDepth, nil); err != nil {
		t.Fatal(err)
	}
	t.Logf("qdrant search     %s", time.Since(start).Round(time.Millisecond))

	start = time.Now()
	if _, err := lexicalSearch(ctx, db, q); err != nil {
		t.Fatal(err)
	}
	t.Logf("postgres lexical  %s", time.Since(start).Round(time.Millisecond))

	start = time.Now()
	cands, qvec, err := findCandidates(ctx, db, q)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("stage 1 total     %s", time.Since(start).Round(time.Millisecond))

	ids := []string{}
	for _, c := range pickProducts(cands) {
		ids = append(ids, c.ID)
	}
	start = time.Now()
	sources, err := loadSources(ctx, db, ids)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("load products     %s", time.Since(start).Round(time.Millisecond))

	start = time.Now()
	passages, err := topPassages(ctx, ids, qvec)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("load passages     %s", time.Since(start).Round(time.Millisecond))

	start = time.Now()
	text, _, err := generate(ctx, geminiRequest{
		System: systemPrompt, Parts: []map[string]any{textPart(buildContext(sources, passages) + "\n\nQuestion: " + q)},
		Schema: answerSchema, MaxTokens: 8000,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("gemini answer     %s  (%d chars out)", time.Since(start).Round(time.Millisecond), len(text))
}

// Answer speed and wording across Gemini settings, same question each time:
//
//	go test -tags live -run TestLiveModels -v ./internal/productrag/
func TestLiveModels(t *testing.T) {
	_ = godotenv.Load("../../.env")
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	q := "tell me about planscar gel"
	cands, qvec, err := findCandidates(ctx, db, q)
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, c := range pickProducts(cands) {
		ids = append(ids, c.ID)
	}
	sources, _ := loadSources(ctx, db, ids)
	passages, _ := topPassages(ctx, ids, qvec)
	prompt := buildContext(sources, passages) + "\n\nQuestion: " + q

	defer func(m, th string) { geminiModel, geminiThinking = m, th }(geminiModel, geminiThinking)
	for _, cfg := range [][2]string{
		{"gemini-3.5-flash", "low"},
		{"gemini-3.5-flash", "minimal"},
		{"gemini-3.5-flash-lite", "low"},
		{"gemini-3.5-flash-lite", "minimal"},
	} {
		geminiModel, geminiThinking = cfg[0], cfg[1]
		start := time.Now()
		text, _, err := generate(ctx, geminiRequest{System: systemPrompt, Parts: []map[string]any{textPart(prompt)}, Schema: answerSchema, MaxTokens: 8000})
		if len(text) > 700 {
			text = text[:700] + "…"
		}
		t.Logf("\n== %s thinking=%s  %s  err=%v\n%s", cfg[0], cfg[1], time.Since(start).Round(time.Millisecond), err, text)
	}
}
