package margede

import "time"

// Averages that respect when a product became available. A product first
// bought two months ago has sold for two months, not three or twelve:
// dividing its sales by the whole window would make it look slow, and
// wrongly flag it for ordering less or for expiring. So each window starts
// no earlier than the day the product was available (stock on 1 April, else
// its first stock in or first sale this year).

// minAvgDays: a window with fewer full-month days than this since the
// product arrived also counts the days so far this month.
const minAvgDays = 14

// tooNewDays: with less history than this, the average is a first guess —
// not enough to call stock at risk of expiring.
const tooNewDays = 30

// windowAvg is a monthly average over the last n full months before m0,
// starting no earlier than firstMonth (first month on record) or available.
// q is the sales in those months, qNow this month's so far. Returns the
// average and the days it covers.
func windowAvg(q, qNow float64, n int, firstMonth, available, m0, today time.Time) (float64, int) {
	start := m0.AddDate(0, -n, 0)
	if start.Before(firstMonth) {
		start = firstMonth
	}
	if available.After(start) {
		start = available
	}
	days := daysBetween(start, m0)
	if days < minAvgDays {
		q += qNow
		days = daysBetween(start, today.AddDate(0, 0, 1))
	}
	if days < 1 {
		days = 1
	}
	return q / float64(days) * 365 / 12, days
}

func daysBetween(a, b time.Time) int {
	return int(b.Sub(a).Hours() / 24)
}
