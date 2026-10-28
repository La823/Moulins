package products

import "github.com/lavanyaarora/server/internal/models"

// forVisitor blanks what a visitor isn't shown of a product: its price,
// MRP, GST rate and stock (rates are for partners), and the detailing
// material for partners and doctors — directions for use, safety
// information, e-detailing, the audio and the visual-aid images. Documents
// stay visible.
func forVisitor(p *models.Product) {
	p.Price, p.Mrp, p.MrpUnit, p.GstRate, p.Stock = 0, nil, nil, nil, 0
	p.DirectionForUse, p.SafetyInfo, p.Edetailing = nil, nil, nil
	p.AudioKey, p.AudioURL = nil, ""
	// Hidden for now (28 Oct 2026), likely to be shown again: delete this
	// line to give visitors the description and key benefits back.
	p.Description, p.KeyBenefits = "", nil

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
