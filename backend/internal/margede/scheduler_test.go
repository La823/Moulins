package margede

import (
	"testing"
	"time"
)

func TestChooseSince(t *testing.T) {
	at := func(h, m int) time.Time { return time.Date(2026, 10, 25, h, m, 0, 0, istZone) }
	ptr := func(t time.Time) *time.Time { return &t }
	lastMarg := "2026-10-25 11:15:02"

	cases := []struct {
		name     string
		slot     time.Time
		lastFull *time.Time
		lastMarg string
		want     string
	}{
		{"on the hour: full", at(12, 0), ptr(at(11, 0)), lastMarg, ""},
		{"quarter past: quick since the last run less 10 min", at(11, 30), ptr(at(11, 0)), lastMarg, "2026-10-25 11:05:02"},
		{"the :00 full pull failed: full", at(12, 30), ptr(at(11, 0)), lastMarg, ""},
		{"never a full pull: full", at(11, 30), nil, lastMarg, ""},
		{"no Marg time on record: full", at(11, 30), ptr(at(11, 0)), "", ""},
	}
	for _, c := range cases {
		if got := chooseSince(c.slot, c.lastMarg, c.lastFull); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
