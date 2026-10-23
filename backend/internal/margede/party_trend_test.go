package margede

import (
	"testing"
	"time"
)

func TestTrendStatus(t *testing.T) {
	avg := func(v float64) *float64 { return &v }
	cases := []struct {
		name   string
		r      PartyTrendRow
		winQty float64
		want   string
	}{
		{"below last month and average", PartyTrendRow{ThisQty: 2, LastQty: 10, AvgQty: avg(8), AvgMonths: 3}, 24, "down"},
		{"not bought yet this month", PartyTrendRow{ThisQty: 0, LastQty: 5, AvgQty: avg(4), AvgMonths: 3}, 12, "down"},
		{"below average, above last month", PartyTrendRow{ThisQty: 4, LastQty: 2, AvgQty: avg(8), AvgMonths: 3}, 24, "ok"},
		{"below last month, above average", PartyTrendRow{ThisQty: 6, LastQty: 10, AvgQty: avg(5), AvgMonths: 3}, 15, "ok"},
		{"stopped buying", PartyTrendRow{ThisQty: 0, LastQty: 0, AvgQty: avg(0), AvgMonths: 3}, 0, "lapsed"},
		{"first bought this month", PartyTrendRow{ThisQty: 5, AvgMonths: 0}, 0, "new"},
	}
	for _, c := range cases {
		if got := trendStatus(c.r, c.winQty); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestMonthsBetween(t *testing.T) {
	d := func(y int, m time.Month) time.Time { return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC) }
	if n := monthsBetween(d(2026, 7), d(2026, 10)); n != 3 {
		t.Errorf("Jul to Oct = %d, want 3", n)
	}
	if n := monthsBetween(d(2026, 10), d(2026, 10)); n != 0 {
		t.Errorf("same month = %d, want 0", n)
	}
	if n := monthsBetween(d(2025, 11), d(2026, 2)); n != 3 {
		t.Errorf("across the year end = %d, want 3", n)
	}
}
