package etimeoffice

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/etimeoffice"
)

// ---------------------------------------------------------------- staff

// GET /etime/me/missed-punches — the staff member's own missed punch logs.
// {"linked": false} when their login isn't linked to a scanner employee.
func MyMissedPunchesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emp, err := etimeoffice.EmployeeForUser(r.Context(), db, currentUser(r))
		if err != nil {
			leaveError(w, "load your attendance", err)
			return
		}
		if emp == nil {
			writeJSON(w, http.StatusOK, map[string]any{"linked": false})
			return
		}
		list, err := etimeoffice.ListMissedPunches(r.Context(), db, etimeoffice.MissedPunchFilter{EmpCode: emp.EmpCode, Limit: 100})
		if err != nil {
			leaveError(w, "load your missed punches", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"linked": true, "missed_punches": list, "today": etimeoffice.Today().Format("2006-01-02"),
		})
	}
}

// POST /etime/me/missed-punches — {"date": "YYYY-MM-DD", "type": "in"|"out", "time": "HH:MM"}
func LogMissedPunchHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emp := myEmployee(w, r, db)
		if emp == nil {
			return
		}
		var b struct {
			Date string `json:"date"`
			Type string `json:"type"`
			Time string `json:"time"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		m, err := etimeoffice.CreateMissedPunch(r.Context(), db, etimeoffice.NewMissedPunch{
			EmpCode: emp.EmpCode, Date: b.Date, Type: b.Type, Time: b.Time, By: currentUser(r),
		})
		if err != nil {
			leaveError(w, "log the missed punch", err)
			return
		}
		writeJSON(w, http.StatusCreated, m)
	}
}

// POST /etime/me/missed-punches/{id}/cancel — withdraw one's own pending log.
func CancelMyMissedPunchHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emp := myEmployee(w, r, db)
		if emp == nil {
			return
		}
		id, ok := idParam(r)
		if !ok {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		m, err := etimeoffice.CancelMissedPunch(r.Context(), db, id, emp.EmpCode, currentUser(r))
		if err != nil {
			leaveError(w, "withdraw the missed punch", err)
			return
		}
		writeJSON(w, http.StatusOK, m)
	}
}

// ---------------------------------------------------------------- admin

// GET /admin/etime/missed-punches?status=&emp_code= (leaves_view)
func ListMissedPunchesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		list, err := etimeoffice.ListMissedPunches(r.Context(), db, etimeoffice.MissedPunchFilter{
			EmpCode: q.Get("emp_code"), Status: q.Get("status"),
		})
		if err != nil {
			leaveError(w, "load missed punches", err)
			return
		}
		pending, err := etimeoffice.PendingMissedCount(r.Context(), db)
		if err != nil {
			leaveError(w, "count missed punches", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"missed_punches": list, "pending": pending})
	}
}

// POST /admin/etime/missed-punches/{id}/approve and /reject (leaves_edit)
func DecideMissedPunchHandler(db *pgxpool.Pool, approve bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := idParam(r)
		if !ok {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		what := "reject the missed punch"
		if approve {
			what = "approve the missed punch"
		}
		m, err := etimeoffice.DecideMissedPunch(r.Context(), db, id, approve, currentUser(r))
		if err != nil {
			leaveError(w, what, err)
			return
		}
		writeJSON(w, http.StatusOK, m)
	}
}
