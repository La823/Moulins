package margede

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// GET /admin/marg-daybook?kind=sale&from=&to=&party=&search=&dir=desc&page=1 — past
// years' Day Book vouchers with their lines.
func ListDaybookHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		list, err := margede.ListDaybook(r.Context(), db, margede.DaybookFilter{
			Kind: q.Get("kind"), From: q.Get("from"), To: q.Get("to"),
			Party: q.Get("party"), Search: q.Get("search"), Dir: q.Get("dir"), Page: page,
		})
		if err != nil {
			log.Printf("marg daybook list: %v", err)
			http.Error(w, "could not list day book", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/marg-daybook/parties?kind=customer&search=&page=1 — every party
// in the Day Book with its totals and closing balance.
func ListDaybookPartiesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		list, err := margede.ListDaybookParties(r.Context(), db, q.Get("kind"), q.Get("search"), page)
		if err != nil {
			log.Printf("marg daybook parties: %v", err)
			http.Error(w, "could not list parties", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/marg-daybook/parties/{code} — one party's ledger with its
// running balance.
func GetDaybookPartyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := mux.Vars(r)["code"]
		led, err := margede.GetDaybookPartyLedger(r.Context(), db, code)
		if errors.Is(err, margede.ErrDaybookPartyNotFound) {
			http.Error(w, "party not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("marg daybook party %q: %v", code, err)
			http.Error(w, "could not load ledger", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(led)
	}
}
