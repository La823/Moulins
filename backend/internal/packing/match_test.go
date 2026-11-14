package packing

import "testing"

func TestSameBatch(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"MP-2401", "mp2401", true},
		{"B.No. 0K12", "OK12", false}, // label words are not stripped: the reader returns the number alone
		{"OK12", "0K12", true},
		{"ILD45", "11D45", true},
		{"AB123", "AB124", false},
		{"", "", false},
		{" - ", "", false},
	}
	for _, c := range cases {
		if got := sameBatch(c.a, c.b); got != c.want {
			t.Errorf("sameBatch(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestVerdict(t *testing.T) {
	known := []string{"MS2401", "MS2402"}
	cases := []struct {
		name, read, expected string
		known                []string
		differs              bool
		want                 string
	}{
		{"unreadable", "", "MS2401", known, false, ResultUnreadable},
		{"match", "ms-2401", "MS2401", known, false, ResultMatch},
		{"other known batch", "MS2402", "MS2401", known, false, ResultMismatch},
		{"unknown batch", "ZZ9", "MS2401", known, false, ResultMismatch},
		{"wrong product", "MS2401", "MS2401", known, true, ResultMismatch},
		{"no expected, known", "MS2402", "", known, false, ResultMatch},
		{"no expected, unknown", "ZZ9", "", known, false, ResultMismatch},
		{"nothing to compare", "ZZ9", "", nil, false, ResultUnchecked},
	}
	for _, c := range cases {
		if got, _ := verdict(c.read, c.expected, c.known, c.differs, ""); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestExpiry(t *testing.T) {
	for _, c := range []struct {
		in   string
		m, y int
	}{{"02/2028", 2, 2028}, {"02/28", 2, 2028}, {"FEB 2028", 2, 2028}, {"Feb.28", 2, 2028}, {"15/08/2027", 8, 2027}, {"EXP: 08-27", 8, 2027}} {
		m, y, ok := packExpiry(c.in)
		if !ok || m != c.m || y != c.y {
			t.Errorf("packExpiry(%q) = %d/%d %v, want %d/%d", c.in, m, y, ok, c.m, c.y)
		}
	}
	if got := MargExpiryLabel("20270801"); got != "Aug 2027" {
		t.Errorf("MargExpiryLabel = %q", got)
	}
	if n := expiryNote("", ResultMatch, "08/2027", "20270801"); n != "" {
		t.Errorf("same expiry noted: %q", n)
	}
	if n := expiryNote("", ResultMatch, "02/2028", "20270801"); n == "" {
		t.Error("different expiry not noted")
	}
}
