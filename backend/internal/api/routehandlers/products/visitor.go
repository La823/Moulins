package products

import "github.com/lavanyaarora/server/internal/models"

// forVisitor blanks what a visitor isn't shown of a product: its price,
// MRP, GST rate and stock (rates are for partners), and its visual-aid
// images (detailing material for partners and doctors).
func forVisitor(p *models.Product) {
	p.Price, p.Mrp, p.MrpUnit, p.GstRate, p.Stock = 0, nil, nil, nil, 0

	kept := make([]models.ProductImage, 0, len(p.Images))
	for _, img := range p.Images {
		if !img.VisualAid {
			kept = append(kept, img)
		}
	}
	p.Images = kept
	// the card thumbnail is a copy of the first image; drop it unless that
	// image is still the first one shown
	first := ""
	for _, img := range kept {
		if !img.Hidden {
			first = img.ImageKey
			break
		}
	}
	if p.ThumbSourceKey == nil || *p.ThumbSourceKey != first {
		p.ThumbKey, p.ThumbSourceKey, p.ThumbURL = nil, nil, ""
	}
}

func forVisitors(products []models.Product) {
	for i := range products {
		forVisitor(&products[i])
	}
}
