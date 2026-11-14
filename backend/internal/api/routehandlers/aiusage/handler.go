package aiusage

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lavanyaarora/server/internal/aiusage"
	"github.com/lavanyaarora/server/internal/utils"
)

// GET /admin/ai-usage?from=YYYY-MM-DD&to=YYYY-MM-DD (admin only) — AI calls'
// tokens, photo sizes and estimated cost; defaults to the last 30 days.
func ReportHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ist := time.FixedZone("IST", 5*3600+1800)
		today := time.Now().In(ist)
		from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
		if _, err := time.Parse("2006-01-02", to); err != nil {
			to = today.Format("2006-01-02")
		}
		if _, err := time.Parse("2006-01-02", from); err != nil {
			from = today.AddDate(0, 0, -29).Format("2006-01-02")
		}
		rep, err := aiusage.GetReport(r.Context(), db, from, to, utils.GetPublicURL)
		if err != nil {
			log.Printf("ai usage report: %v", err)
			http.Error(w, "could not load AI usage", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rep)
	}
}
