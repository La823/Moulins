package etimeoffice

import (
	"testing"
	"time"
)

func TestNextHour(t *testing.T) {
	cases := []struct{ in, want string }{
		{"2026-11-17T11:10:29+05:30", "2026-11-17T12:00:00+05:30"},
		{"2026-11-17T11:40:00+05:30", "2026-11-17T12:00:00+05:30"},
		{"2026-11-17T12:00:00+05:30", "2026-11-17T13:00:00+05:30"},
		{"2026-11-17T23:59:00+05:30", "2026-11-18T00:00:00+05:30"},
		{"2026-11-17T05:40:29Z", "2026-11-17T12:00:00+05:30"}, // 11:10 IST
	}
	for _, c := range cases {
		in, _ := time.Parse(time.RFC3339, c.in)
		want, _ := time.Parse(time.RFC3339, c.want)
		if got := nextHour(in); !got.Equal(want) {
			t.Errorf("nextHour(%s) = %s, want %s", c.in, got.Format(time.RFC3339), c.want)
		}
	}
}
