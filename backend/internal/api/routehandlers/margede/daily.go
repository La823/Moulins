package margede

import (
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/margede"
)

// GET /admin/marg-analysis/daily?date=YYYY-MM-DD — one day's sales and
// orders beside the day before and the same weekday last week, the top
// customers, products and every order of the day, and a row per day of its
// month. No date: today (India time). Cached in Redis: a past day for half
// an hour (late Marg edits still come through), today for two minutes.
func DailyHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		day := time.Now().In(time.FixedZone("IST", 5*3600+1800))
		if v := r.URL.Query().Get("date"); v != "" {
			d, err := time.Parse("2006-01-02", v)
			if err != nil {
				http.Error(w, "send a date like 2026-11-04", http.StatusBadRequest)
				return
			}
			day = d
		}
		today := time.Now().In(time.FixedZone("IST", 5*3600+1800)).Format("2006-01-02")
		key := "daily-analysis:" + day.Format("2006-01-02")
		var out margede.DailyReport
		if r.URL.Query().Get("fresh") == "1" || !rdb.GetJSON(r.Context(), key, &out) {
			var err error
			if out, err = margede.Daily(r.Context(), db, day); err != nil {
				log.Printf("daily analysis: %v", err)
				http.Error(w, "could not build the day's report", http.StatusInternalServerError)
				return
			}
			ttl := 30 * time.Minute
			if out.Date >= today {
				ttl = 2 * time.Minute
			}
			rdb.SetJSON(r.Context(), key, out, ttl)
		}
		writeJSON(w, out)
	}
}
