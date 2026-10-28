package products

import (
	"testing"

	"github.com/lavanyaarora/server/internal/models"
)

func TestForVisitor(t *testing.T) {
	mrp, gst, aidKey, packKey := 120.0, 12.0, "img/aid.jpg", "img/pack.jpg"
	p := models.Product{
		Price: 99, Mrp: &mrp, GstRate: &gst, Stock: 40,
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
