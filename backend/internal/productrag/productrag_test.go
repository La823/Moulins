package productrag

import (
	"strings"
	"testing"
)

func TestChunkTextKeepsEverythingWithOverlap(t *testing.T) {
	var paras []string
	for i := 0; i < 30; i++ {
		paras = append(paras, strings.Repeat(string(rune('a'+i%26)), 300))
	}
	chunks := chunkText(strings.Join(paras, "\n\n"))
	if len(chunks) < 4 {
		t.Fatalf("expected several chunks, got %d", len(chunks))
	}
	for i, c := range chunks {
		if len(c) > chunkMax {
			t.Errorf("chunk %d is %d chars, over %d", i, len(c), chunkMax)
		}
	}
	// every paragraph survives, and neighbouring chunks share one
	all := strings.Join(chunks, "\n\n")
	for i, p := range paras {
		if !strings.Contains(all, p) {
			t.Fatalf("paragraph %d lost", i)
		}
	}
	for i := 1; i < len(chunks); i++ {
		prev := strings.Split(chunks[i-1], "\n\n")
		if !strings.HasPrefix(chunks[i], prev[len(prev)-1]) {
			t.Errorf("chunk %d does not start with the last paragraph of chunk %d", i, i-1)
		}
	}
}

func TestChunkTextSplitsOversizedParagraph(t *testing.T) {
	big := strings.Repeat("row | value\n", 1000) // one 12k-char table, no blank lines
	for i, c := range chunkText(big) {
		if len(c) > chunkMax {
			t.Errorf("chunk %d is %d chars, over %d", i, len(c), chunkMax)
		}
	}
}

func TestPickProductsNamed(t *testing.T) {
	cands := []candidate{
		{ID: "skin", Score: 0.05, NameSim: 0},
		{ID: "gel", Score: 0.04, NameSim: 0.9},
		{ID: "inj", Score: 0.03, NameSim: 0.85},
		{ID: "other", Score: 0.02, NameSim: 0.55},
	}
	got := pickProducts(cands)
	if len(got) != 2 || got[0].ID != "gel" || got[1].ID != "inj" {
		t.Fatalf("named question should keep only the clearly named products, got %+v", got)
	}
}

func TestPickProductsUnnamed(t *testing.T) {
	cands := []candidate{{ID: "a", NameSim: 0.5}, {ID: "b"}, {ID: "c"}, {ID: "d"}, {ID: "e"}}
	got := pickProducts(cands)
	if len(got) != fuzzyPicks || got[0].ID != "a" {
		t.Fatalf("unnamed question should keep the top %d by score, got %+v", fuzzyPicks, got)
	}
	if len(pickProducts(nil)) != 0 {
		t.Fatal("no candidates should pick nothing")
	}
}

func TestProfileLeavesOutTradeFields(t *testing.T) {
	mrp := 120.0
	p := productSource{Name: "Planscar Gel", Brand: "Planscar", Mrp: &mrp, MrpUnit: "tube", KeyBenefits: "Fades scars"}
	got := p.profile()
	for _, want := range []string{"Product: Planscar Gel", "Brand: Planscar", "MRP: Rs. 120.00 per tube", "Key benefits: Fades scars"} {
		if !strings.Contains(got, want) {
			t.Errorf("profile missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "Description:") {
		t.Errorf("empty fields should be left out:\n%s", got)
	}

	// the unit is often stored with its own "Per"
	p.MrpUnit = "Per Unit"
	if got := p.profile(); !strings.Contains(got, "MRP: Rs. 120.00 per unit") {
		t.Errorf("unit already starting with per should not get another:\n%s", got)
	}

	// what is embedded leaves the price out
	if got := p.searchText(); strings.Contains(got, "MRP") || !strings.Contains(got, "Key benefits: Fades scars") {
		t.Errorf("search text should be the profile without its price:\n%s", got)
	}
}
