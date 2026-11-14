package packing

import (
	"context"
	"strings"

	"github.com/lavanyaarora/server/internal/productrag"
)

// Reading reads what the reader saw on a pack.
type Reading struct {
	Batch          string `json:"batch"`
	Expiry         string `json:"expiry"`
	ProductName    string `json:"product_name"`
	ProductMatches string `json:"product_matches"` // yes, no, unsure
}

const readerSystem = `You read the printed details on pharmaceutical and nutraceutical packs (strips, cartons, bottles, tubes, sachets) in photos taken while packing orders in a warehouse in India.

Copy what is printed, exactly as printed. Never guess or complete a number you cannot see clearly: leave that field empty instead.`

var readerSchema = map[string]any{
	"type": "OBJECT",
	"properties": map[string]any{
		"batch":           map[string]any{"type": "STRING"},
		"expiry":          map[string]any{"type": "STRING"},
		"product_name":    map[string]any{"type": "STRING"},
		"product_matches": map[string]any{"type": "STRING", "enum": []string{"yes", "no", "unsure"}},
	},
	"required":         []string{"batch", "expiry", "product_name", "product_matches"},
	"propertyOrdering": []string{"batch", "expiry", "product_name", "product_matches"},
}

// readPack asks Gemini for the batch number, expiry and product name on the
// pack in the photo. The expected product's name is given so the reader can
// say whether the pack is that product; the expected batch is not, so it
// cannot lean the reading towards it.
func readPack(ctx context.Context, image []byte, mimeType, productName string) (Reading, error) {
	prompt := `This should be a pack of: ` + productName + `

- "batch": the batch number only, without its label (it usually follows "B.No.", "Batch No.", "Batch", "Lot" or "B."). Empty if it is not visible or not clear.
- "expiry": the expiry date as printed (after "EXP", "Exp. Date", "Use before"). Empty if not visible.
- "product_name": the product name printed on the pack, if visible.
- "product_matches": "no" only if a different product's name is clearly visible; "yes" if this product's name is visible; otherwise "unsure".`
	var r Reading
	if err := productrag.ReadImageJSON(ctx, readerSystem, prompt, mimeType, image, readerSchema, &r); err != nil {
		return Reading{}, err
	}
	r.Batch = strings.TrimSpace(r.Batch)
	r.Expiry = strings.TrimSpace(r.Expiry)
	r.ProductName = strings.TrimSpace(r.ProductName)
	return r, nil
}
