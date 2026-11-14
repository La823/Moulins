package packing

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// margExpiry reads Marg's expiry, stored as YYYYMMDD (e.g. 20270801).
func margExpiry(s string) (month, year int, ok bool) {
	s = strings.TrimSpace(s)
	if len(s) < 6 {
		return 0, 0, false
	}
	y, err1 := strconv.Atoi(s[:4])
	m, err2 := strconv.Atoi(s[4:6])
	if err1 != nil || err2 != nil || m < 1 || m > 12 {
		return 0, 0, false
	}
	return m, y, true
}

// MargExpiryLabel shows a Marg expiry as "Aug 2027" (as printed packs do),
// or as stored if it is not in Marg's form.
func MargExpiryLabel(s string) string {
	m, y, ok := margExpiry(s)
	if !ok {
		return s
	}
	return time.Month(m).String()[:3] + " " + strconv.Itoa(y)
}

var (
	dmyExpiry   = regexp.MustCompile(`\b\d{1,2}\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})\b`)
	numExpiry   = regexp.MustCompile(`(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})\b`)
	monthExpiry = regexp.MustCompile(`(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[/.\-']?\s*(\d{4}|\d{2})\b`)
)

// packExpiry reads an expiry as printed on a pack: 02/2028, 02/28, 02-28,
// FEB 2028, Feb.28. A day/month/year date takes its month and year.
func packExpiry(s string) (month, year int, ok bool) {
	toYear := func(t string) int {
		y, _ := strconv.Atoi(t)
		if len(t) == 2 {
			y += 2000
		}
		return y
	}
	if m := monthExpiry.FindStringSubmatch(s); m != nil {
		mon, _ := time.Parse("Jan", strings.ToUpper(m[1][:1])+strings.ToLower(m[1][1:3]))
		return int(mon.Month()), toYear(m[2]), true
	}
	m := dmyExpiry.FindStringSubmatch(s) // a full date: its month and year
	if m == nil {
		m = numExpiry.FindStringSubmatch(s)
	}
	if m == nil {
		return 0, 0, false
	}
	mo, _ := strconv.Atoi(m[1])
	if mo < 1 || mo > 12 {
		return 0, 0, false
	}
	return mo, toYear(m[2]), true
}
