package margede

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// Product trend of a party: this month against last month and the average
// of the last N months (?months=1-12, default 3).

func trendMonths(r *http.Request) int {
	n, _ := strconv.Atoi(r.URL.Query().Get("months"))
	return n
}

// GET /admin/partners/{id}/product-trend?months=3 (partner_bills_view)
func PartnerProductTrendHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid partner id", http.StatusBadRequest)
			return
		}
		code, err := margede.PartyCodeOfUser(r.Context(), db, id)
		if errors.Is(err, margede.ErrNotLinked) {
			http.Error(w, "This partner isn't linked to a Marg party", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("partner %s product trend: %v", id, err)
			http.Error(w, "could not load the product trend", http.StatusInternalServerError)
			return
		}
		respondTrend(w, r, db, code)
	}
}

func respondTrend(w http.ResponseWriter, r *http.Request, db *pgxpool.Pool, code string) {
	out, err := margede.PartyProductTrend(r.Context(), db, code, trendMonths(r))
	if err != nil {
		log.Printf("party %s product trend: %v", code, err)
		http.Error(w, "could not load the product trend", http.StatusInternalServerError)
		return
	}
	writeJSON(w, out)
}
