package etimeoffice

import (
	"testing"
	"time"
)

func d(y int, m time.Month, day int) time.Time { return time.Date(y, m, day, 0, 0, 0, 0, istZone) }

func TestLeaveDatesSkipSundays(t *testing.T) {
	// Fri 16 Oct – Tue 20 Oct 2026: Sunday the 18th is not a leave day.
	dates, days := leaveDates(d(2026, 10, 16), d(2026, 10, 20), false)
	if days != 4 || len(dates) != 4 {
		t.Fatalf("got %v days (%d dates), want 4", days, len(dates))
	}
	for _, x := range dates {
		if x.Weekday() == time.Sunday {
			t.Errorf("%s is a Sunday", x.Format(isoDate))
		}
	}
	if _, days := leaveDates(d(2026, 10, 19), d(2026, 10, 19), true); days != 0.5 {
		t.Errorf("half day counted as %v, want 0.5", days)
	}
	if dates, _ := leaveDates(d(2026, 10, 18), d(2026, 10, 18), false); len(dates) != 0 {
		t.Errorf("a Sunday-only leave should cover no days")
	}
}

func TestAccrualMonths(t *testing.T) {
	start := d(2026, 10, 1) // the system went live in October 2026
	cases := []struct {
		month time.Time
		want  int
	}{
		{d(2026, 9, 1), 0},   // before it started
		{d(2026, 10, 16), 1}, // first month
		{d(2026, 12, 31), 3}, // carried within the year
		{d(2027, 1, 5), 1},   // reset each January
		{d(2027, 6, 1), 6},
	}
	for _, c := range cases {
		if got := accrualMonths(start, c.month); got != c.want {
			t.Errorf("accrualMonths(%s) = %d, want %d", c.month.Format("2006-01"), got, c.want)
		}
	}
}

func TestSplitPaid(t *testing.T) {
	three := []float64{1, 1, 1}
	eq := func(a, b []bool) bool {
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return len(a) == len(b)
	}
	// Over the balance: paid while it lasts, the rest unpaid.
	if got := splitPaid(three, 1.5, PaidAuto); !eq(got, []bool{true, false, false}) {
		t.Errorf("auto with 1.5 available = %v", got)
	}
	if got := splitPaid(three, 0, PaidAuto); !eq(got, []bool{false, false, false}) {
		t.Errorf("auto with nothing available = %v", got)
	}
	if got := splitPaid([]float64{0.5}, 0.5, PaidAuto); !eq(got, []bool{true}) {
		t.Errorf("half day with 0.5 available = %v", got)
	}
	// The admin can override either way.
	if got := splitPaid(three, 0, PaidAll); !eq(got, []bool{true, true, true}) {
		t.Errorf("paid = %v", got)
	}
	if got := splitPaid(three, 9, PaidNone); !eq(got, []bool{false, false, false}) {
		t.Errorf("unpaid = %v", got)
	}
}

func TestWithLeave(t *testing.T) {
	full := &DayLeave{Portion: 1, Paid: true}
	cases := []struct {
		state string
		leave *DayLeave
		want  string
	}{
		{"absent", nil, "absent"},
		{"absent", full, "leave"},
		{"not_synced", full, "leave"},
		// Came in anyway: eTimeOffice's state stands.
		{"present", full, "present"},
		{"half_day", &DayLeave{Portion: 0.5}, "half_day"},
		{"weekly_off", full, "weekly_off"},
		// Booked ahead of time.
		{"upcoming", full, "leave"},
		{"upcoming", nil, "upcoming"},
	}
	for _, c := range cases {
		if got := withLeave(c.state, c.leave); got != c.want {
			t.Errorf("withLeave(%s) = %s, want %s", c.state, got, c.want)
		}
	}

	var tot Totals
	tot.add(Day{State: "leave", Leave: full})
	tot.add(Day{State: "half_day", Leave: &DayLeave{Portion: 0.5}})
	tot.add(Day{State: "absent"})
	if tot.Leave != 1.5 || tot.Absent != 1 {
		t.Errorf("totals leave=%v absent=%d, want 1.5 and 1", tot.Leave, tot.Absent)
	}
}

func TestNewLeaveValidate(t *testing.T) {
	today := Today()
	ok := NewLeave{From: today, To: today.AddDate(0, 0, 2)}
	if _, _, err := ok.validate(); err != nil {
		t.Errorf("a normal leave was refused: %v", err)
	}
	bad := map[string]NewLeave{
		"end before start":     {From: today, To: today.AddDate(0, 0, -1)},
		"half day over range":  {From: today, To: today.AddDate(0, 0, 1), HalfDay: true},
		"too long":             {From: today, To: today.AddDate(0, 0, MaxLeaveSpan)},
		"before last month":    {From: today.AddDate(0, -3, 0), To: today.AddDate(0, -3, 0)},
		"more than a year out": {From: today.AddDate(1, 0, 5), To: today.AddDate(1, 0, 5)},
	}
	for name, n := range bad {
		if _, _, err := n.validate(); err == nil {
			t.Errorf("%s: accepted, want refused", name)
		}
	}
}
