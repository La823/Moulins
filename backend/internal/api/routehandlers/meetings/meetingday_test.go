package meetings

import (
	"testing"
	"time"
)

func TestMeetingDayAhead(t *testing.T) {
	// 23 Nov 2026, 10:00 IST
	now := time.Date(2026, 11, 23, 4, 30, 0, 0, time.UTC)
	cases := []struct {
		name      string
		scheduled time.Time
		want      bool
	}{
		{"later today", time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC), false},          // 5:30 PM IST
		{"earlier today", time.Date(2026, 11, 22, 19, 0, 0, 0, time.UTC), false},        // 00:30 IST 23rd
		{"yesterday", time.Date(2026, 11, 22, 10, 0, 0, 0, time.UTC), false},
		{"tomorrow", time.Date(2026, 11, 24, 5, 0, 0, 0, time.UTC), true},
		{"tomorrow just after midnight IST", time.Date(2026, 11, 23, 18, 31, 0, 0, time.UTC), true}, // 00:01 IST 24th
	}
	for _, c := range cases {
		if got := meetingDayAhead(c.scheduled, now); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
