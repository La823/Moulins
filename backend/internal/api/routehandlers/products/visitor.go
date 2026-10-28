package products

import "github.com/lavanyaarora/server/internal/models"

// withoutPrice blanks what a visitor isn't shown of a product: its price,
// MRP, GST rate and stock. Rates are for partners.
func withoutPrice(p *models.Product) {
	p.Price, p.Mrp, p.MrpUnit, p.GstRate, p.Stock = 0, nil, nil, nil, 0
}

func withoutPrices(products []models.Product) {
	for i := range products {
		withoutPrice(&products[i])
	}
}
