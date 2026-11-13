// Package bankstatements serves the panel's Bank Statements page (admins
// only): the HDFC statements read from email each day, their transactions,
// the original statement page, and a "Check now" that reads new emails at
// once instead of waiting for the hourly check.
package bankstatements

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/bankstatements"
	"github.com/lavanyaarora/server/internal/services"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

var ist = time.FixedZone("IST", 5*3600+1800)

// GET /admin/bank-statements?account=<no>&from=YYYY-MM-DD&to=YYYY-MM-DD
// (default: the last 30 days).
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		today := time.Now().In(ist)
		to := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
		from := to.AddDate(0, 0, -30)
		if t, err := time.Parse("2006-01-02", q.Get("from")); err == nil {
			from = t
		}
		if t, err := time.Parse("2006-01-02", q.Get("to")); err == nil {
			to = t
		}
		if to.Before(from) {
			http.Error(w, "'to' is before 'from'", http.StatusBadRequest)
			return
		}
		out, err := bankstatements.List(r.Context(), db, q.Get("account"), from, to)
		if err != nil {
			log.Printf("bank statements list: %v", err)
			http.Error(w, "could not load bank statements", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /admin/bank-statements/{id}/html — the statement page as HDFC sent it.
func HTMLHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		h, err := bankstatements.StatementHTML(r.Context(), db, id)
		if errors.Is(err, bankstatements.ErrNotFound) {
			http.Error(w, "statement not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("bank statement html: %v", err)
			http.Error(w, "could not load the statement", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"html": h})
	}
}

// POST /admin/bank-statements/check reads new statement emails now (the last
// 7 days) and says what was saved. It finishes even if the page is closed.
func CheckHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 10*time.Minute)
		defer cancel()
		res := bankstatements.Run(ctx, db, 7, services.SendDirectNotification)
		writeJSON(w, http.StatusOK, map[string]any{
			"saved":   nonNil(res.Saved),
			"skipped": res.Skipped,
			"errors":  nonNil(res.Errors),
		})
	}
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
