package products

import (
	"testing"

	"github.com/lavanyaarora/server/internal/models"
)

func TestForVisitor(t *testing.T) {
	mrp, gst, aidKey, packKey := 120.0, 12.0, "img/aid.jpg", "img/pack.jpg"
	text, audio := "Apply twice daily", "audio/acnepres.mp3"
	p := models.Product{
		Price: 99, Mrp: &mrp, GstRate: &gst, Stock: 40,
		DirectionForUse: &text, SafetyInfo: &text, Edetailing: &text, AudioKey: &audio, AudioURL: "https://cdn/acnepres.mp3",
		Description: "Anti-acne cream", KeyBenefits: &text, Documents: []models.ProductDocument{{Name: "Leaflet"}},
		Images: []models.ProductImage{
			{ImageKey: aidKey, VisualAid: true},
			{ImageKey: packKey},
			{ImageKey: "img/aid2.jpg", VisualAid: true},
		},
		ThumbKey: &aidKey, ThumbSourceKey: &aidKey, ThumbURL: "https://cdn/thumb-of-aid.jpg",
	}
	forVisitor(&p)

	if p.Price != 0 || p.Mrp != nil || p.GstRate != nil || p.Stock != 0 {
		t.Errorf("prices left: %+v", p)
	}
	if p.DirectionForUse != nil || p.SafetyInfo != nil || p.Edetailing != nil || p.AudioKey != nil || p.AudioURL != "" {
		t.Errorf("detailing left: directions %v, safety %v, e-detailing %v, audio %q", p.DirectionForUse, p.SafetyInfo, p.Edetailing, p.AudioURL)
	}
	if p.Description != "" || p.KeyBenefits != nil {
		t.Errorf("description %q / key benefits %v left", p.Description, p.KeyBenefits)
	}
	if len(p.Documents) != 1 {
		t.Errorf("documents should stay visible, got %d", len(p.Documents))
	}
	if len(p.Images) != 1 || p.Images[0].ImageKey != packKey {
		t.Errorf("images: got %+v, want only the pack shot", p.Images)
	}
	if p.ThumbURL != "" || p.ThumbSourceKey != nil {
		t.Errorf("thumbnail of a visual aid kept: %q", p.ThumbURL)
	}

	// a thumbnail made from an image the visitor still sees stays
	q := models.Product{Images: []models.ProductImage{{ImageKey: packKey}}, ThumbSourceKey: &packKey, ThumbURL: "https://cdn/thumb.jpg"}
	forVisitor(&q)
	if q.ThumbURL == "" {
		t.Error("thumbnail of a normal first image was dropped")
	}
}
