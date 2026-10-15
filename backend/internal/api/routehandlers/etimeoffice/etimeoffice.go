// Package etimeoffice serves the biometric attendance dashboard: punches and
// daily summaries pulled from eTimeOffice (see internal/etimeoffice).
package etimeoffice

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/etimeoffice"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// dateParam reads a YYYY-MM-DD query value, defaulting to today (IST).
func dateParam(r *http.Request, key string) (time.Time, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return etimeoffice.Today(), nil
	}
	return etimeoffice.ParseDate(v)
}

// monthParam reads ?month=YYYY-MM, defaulting to this month.
func monthParam(r *http.Request) (time.Time, error) {
	v := r.URL.Query().Get("month")
	if v == "" {
		return etimeoffice.Today(), nil
	}
	return etimeoffice.ParseDate(v + "-01")
}

// GET /admin/etime/status — whether the integration is configured, the
// recent syncs, and what "Sync now" would pull by default.
func StatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, credErr := etimeoffice.CredentialsFromEnv()
		runs, err := etimeoffice.RecentRuns(r.Context(), db, 10)
		if err != nil {
			log.Printf("etime status: list runs: %v", err)
			http.Error(w, "could not load sync status", http.StatusInternalServerError)
			return
		}
		latest, _ := etimeoffice.LatestDate(r.Context(), db)
		from, err := etimeoffice.DefaultSyncFrom(r.Context(), db)
		if err != nil {
			from = etimeoffice.Today()
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"configured":   credErr == nil,
			"recent_runs":  runs,
			"latest_date":  latest,
			"default_from": from.Format("2006-01-02"),
			"max_days":     etimeoffice.MaxSyncDays,
			"today":        etimeoffice.Today().Format("2006-01-02"),
		})
	}
}

// POST /admin/etime/sync — pull from eTimeOffice now.
// Body (optional): {"from": "YYYY-MM-DD"}; defaults to DefaultSyncFrom.
func SyncHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creds, err := etimeoffice.CredentialsFromEnv()
		if err != nil {
			http.Error(w, "eTimeOffice is not configured: "+err.Error(), http.StatusServiceUnavailable)
			return
		}
		var body struct {
			From string `json:"from"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		var from time.Time
		if body.From != "" {
			if from, err = etimeoffice.ParseDate(body.From); err != nil {
				http.Error(w, "from must be YYYY-MM-DD", http.StatusBadRequest)
				return
			}
		} else if from, err = etimeoffice.DefaultSyncFrom(r.Context(), db); err != nil {
			log.Printf("etime sync: default from: %v", err)
			http.Error(w, "could not work out the sync window", http.StatusInternalServerError)
			return
		}

		userID, _ := uuid.Parse(r.Context().Value("user_id").(string))
		run, err := etimeoffice.Sync(r.Context(), db, creds, from, userID)
		switch {
		case errors.Is(err, etimeoffice.ErrSyncRunning):
			http.Error(w, err.Error(), http.StatusConflict)
		case run == nil && err != nil: // refused before starting (bad window)
			http.Error(w, err.Error(), http.StatusBadRequest)
		case err != nil: // started and failed; the run carries the reason
			writeJSON(w, http.StatusBadGateway, map[string]any{"run": run, "error": err.Error()})
		default:
			writeJSON(w, http.StatusOK, map[string]any{"run": run})
		}
	}
}

// GET /admin/etime/day?date=YYYY-MM-DD — every active employee's day.
func DayHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date, err := dateParam(r, "date")
		if err != nil {
			http.Error(w, "date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		rep, err := etimeoffice.GetDay(r.Context(), db, date)
		if err != nil {
			log.Printf("etime day %s: %v", date.Format("2006-01-02"), err)
			http.Error(w, "could not load attendance", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, rep)
	}
}

// GET /admin/etime/month?month=YYYY-MM — the register: employee x day.
func MonthHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		month, err := monthParam(r)
		if err != nil {
			http.Error(w, "month must be YYYY-MM", http.StatusBadRequest)
			return
		}
		rep, err := etimeoffice.GetMonth(r.Context(), db, month, "")
		if err != nil {
			log.Printf("etime month: %v", err)
			http.Error(w, "could not load attendance", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, rep)
	}
}

// GET /admin/etime/employees/{code}/month?month=YYYY-MM — one person's month.
// Works for inactive employees too, so past staff can still be looked up.
func EmployeeMonthHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		month, err := monthParam(r)
		if err != nil {
			http.Error(w, "month must be YYYY-MM", http.StatusBadRequest)
			return
		}
		code := mux.Vars(r)["code"]
		rep, err := etimeoffice.GetMonth(r.Context(), db, month, code)
		if err != nil {
			log.Printf("etime employee %s month: %v", code, err)
			http.Error(w, "could not load attendance", http.StatusInternalServerError)
			return
		}
		if len(rep.Employees) == 0 && len(rep.Dates) > 0 {
			http.Error(w, "employee not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, rep)
	}
}

// GET /admin/etime/punches?from=&to=&emp_code=&limit=&offset= — raw scan log.
func PunchesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		from, err1 := dateParam(r, "from")
		to, err2 := dateParam(r, "to")
		if err1 != nil || err2 != nil {
			http.Error(w, "from and to must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 1000 {
			limit = 200
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if offset < 0 {
			offset = 0
		}
		punches, total, err := etimeoffice.ListPunches(r.Context(), db, from, to, r.URL.Query().Get("emp_code"), limit, offset)
		if err != nil {
			log.Printf("etime punches: %v", err)
			http.Error(w, "could not load punches", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"total": total, "punches": punches})
	}
}

// GET /admin/etime/employees
func EmployeesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emps, err := etimeoffice.ListEmployees(r.Context(), db)
		if err != nil {
			log.Printf("etime employees: %v", err)
			http.Error(w, "could not load employees", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, emps)
	}
}

// PUT /admin/etime/employees/{code} — {"active": false} hides someone who
// has left from the dashboard.
func UpdateEmployeeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Active *bool `json:"active"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Active == nil {
			http.Error(w, `body must be {"active": true|false}`, http.StatusBadRequest)
			return
		}
		ok, err := etimeoffice.SetEmployeeActive(r.Context(), db, mux.Vars(r)["code"], *body.Active)
		if err != nil {
			log.Printf("etime update employee: %v", err)
			http.Error(w, "could not update employee", http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "employee not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
