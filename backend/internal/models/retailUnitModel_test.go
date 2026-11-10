package models

import "testing"

func TestRetailUnit(t *testing.T) {
	s := func(v string) *string { return &v }
	f := func(v float64) *float64 { return &v }
	for _, c := range []struct {
		pack, form, unit *string
		mrp              *float64
		label            string
		perBox           int
		unitMrp          float64
	}{
		{s("10*10"), s("STRIP"), nil, f(2300), "Strip", 10, 230},            // box MRP, no unit given
		{s("10*1*10"), s("STRIP"), s("Per Box"), f(2550), "Strip", 10, 255}, // box MRP
		{s("10*15"), s("Strip"), s("Per Strip"), f(150), "Strip", 10, 150}, // already per strip
		{s("10 ML"), s("MINI BOTTLE"), nil, f(64.69), "Mini Bottle", 1, 64.69},
		{s("1*5 ML"), s("VIAL"), nil, f(262.5), "Vial", 1, 262.5},
		{nil, nil, nil, f(100), "Unit", 1, 100},
	} {
		label, perBox, m := RetailUnit(c.pack, c.form, c.unit, c.mrp)
		if label != c.label || perBox != c.perBox || m == nil || *m != c.unitMrp {
			t.Errorf("%v %v %v %v: got %s %d %v, want %s %d %v", strOr(c.pack), strOr(c.form), strOr(c.unit), *c.mrp, label, perBox, m, c.label, c.perBox, c.unitMrp)
		}
	}
	if BoxesFor(25, 10) != 3 || BoxesFor(20, 10) != 2 || BoxesFor(4, 1) != 4 {
		t.Error("BoxesFor rounds up to whole boxes")
	}
}

func strOr(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}
