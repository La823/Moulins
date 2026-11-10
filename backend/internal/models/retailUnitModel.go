package models

import (
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Retailers order single packs (a strip, a bottle, a vial), not the boxes
// partners order from Moulins, and with no minimum quantity.

var leadingCount = regexp.MustCompile(`^\s*(\d+)\s*[*xX×]\s*\d`)

// RetailUnit is the unit a retailer orders a product in, how many of them
// make one of the partner's packs, and the MRP of one. A box of strips
// ("10*10", pack form Strip) is ordered by the strip, 10 to a box, its MRP
// split over them when the MRP is for the box (or no unit is given, as it
// mostly is for boxes); anything else (a bottle, a vial) is ordered as is.
func RetailUnit(packSize, packForm, mrpUnit *string, mrp *float64) (label string, perBox int, unitMrp *float64) {
	form := ""
	if packForm != nil {
		form = strings.TrimSpace(*packForm)
	}
	label, perBox = "Unit", 1
	if form != "" {
		label = titleCase(form)
	}
	if strings.Contains(strings.ToLower(form), "strip") {
		label = "Strip"
		if packSize != nil {
			if m := leadingCount.FindStringSubmatch(*packSize); m != nil {
				if n, err := strconv.Atoi(m[1]); err == nil && n > 1 {
					perBox = n
				}
			}
		}
	}
	if mrp != nil {
		v := *mrp
		boxPrice := mrpUnit == nil || strings.TrimSpace(*mrpUnit) == "" || strings.EqualFold(strings.TrimSpace(*mrpUnit), "Per Box")
		if perBox > 1 && boxPrice {
			v = math.Round(v/float64(perBox)*100) / 100
		}
		unitMrp = &v
	}
	return label, perBox, unitMrp
}

// BoxesFor is how many of the partner's packs cover qty retail units.
func BoxesFor(qty, perBox int) int {
	if perBox <= 1 {
		return qty
	}
	return (qty + perBox - 1) / perBox
}
