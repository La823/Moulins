// Package officialupdates serves the panel's Official Updates page: the
// notices government websites published, under each website, and a
// "Check now" that reads them at once instead of waiting for the daily run.
package officialupdates

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/officialupdates"
	"github.com/lavanyaarora/server/internal/services"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// GET /official-updates?source=<key>&limit=<n>
// Every website with its newest items (15 each by default), or one website
// with up to `limit` items for "Show all".
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 15
		if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 2000 {
			limit = n
		}
		list, err := officialupdates.List(r.Context(), db, r.URL.Query().Get("source"), limit)
		if err != nil {
			log.Printf("official updates list: %v", err)
			http.Error(w, "could not load official updates", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// POST /official-updates/check reads every website now (takes up to a
// couple of minutes when a site is slow) and says what was found. The
// check finishes even if the page is closed meanwhile.
func CheckHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithoutCancel(r.Context())
		writeJSON(w, http.StatusOK, officialupdates.Run(ctx, db, services.SendDirectNotification))
	}
}
