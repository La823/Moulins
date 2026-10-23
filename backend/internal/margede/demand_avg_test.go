package margede

import (
	"math"
	"testing"
	"time"
)

func TestWindowAvg(t *testing.T) {
	d := func(m time.Month, day int) time.Time { return time.Date(2026, m, day, 0, 0, 0, 0, time.UTC) }
	fy, m0, today := d(4, 1), d(10, 1), d(10, 21)
	month := 365.0 / 12

	// Stocked all year: Jul, Aug, Sep = 92 days.
	avg, days := windowAvg(92, 0, 3, fy, fy, m0, today)
	if days != 92 || math.Abs(avg-month) > 1e-9 {
		t.Errorf("all year: %v over %d days, want %v over 92", avg, days, month)
	}
	// First bought 1 Sep: 30 days, not 92 — the average isn't diluted.
	avg, days = windowAvg(30, 0, 3, fy, d(9, 1), m0, today)
	if days != 30 || math.Abs(avg-month) > 1e-9 {
		t.Errorf("new in Sep: %v over %d days, want %v over 30", avg, days, month)
	}
	// The year window is cut the same way.
	_, days = windowAvg(30, 0, 12, fy, d(9, 1), m0, today)
	if days != 30 {
		t.Errorf("year window for a Sep product covers %d days, want 30", days)
	}
	// First bought 25 Sep: 6 full-month days is too few, so this month's
	// sales count too — 25 Sep to 21 Oct is 27 days.
	avg, days = windowAvg(6, 21, 3, fy, d(9, 25), m0, today)
	if days != 27 || math.Abs(avg-month) > 1e-9 {
		t.Errorf("new late Sep: %v over %d days, want %v over 27", avg, days, month)
	}
}
