package etimeoffice

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/etimeoffice"
)

func currentUser(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// leaveError answers a request-level problem (bad dates, overlap, wrong
// state) with 400 and its message, anything else with a logged 500.
func leaveError(w http.ResponseWriter, what string, err error) {
	var le etimeoffice.ErrLeave
	if errors.As(err, &le) {
		http.Error(w, le.Error(), http.StatusBadRequest)
		return
	}
	log.Printf("etime leave: %s: %v", what, err)
	http.Error(w, "could not "+what, http.StatusInternalServerError)
}

type leaveBody struct {
	EmpCode string `json:"emp_code"` // admin only
	From    string `json:"from"`
	To      string `json:"to"`
	HalfDay bool   `json:"half_day"`
	Reason  string `json:"reason"`
	Paid    string `json:"paid"` // admin only: auto | paid | unpaid
	Note    string `json:"note"`
}

func (b leaveBody) newLeave(empCode string, by uuid.UUID) (etimeoffice.NewLeave, error) {
	from, err := etimeoffice.ParseDate(b.From)
	if err != nil {
		return etimeoffice.NewLeave{}, errors.New("from must be YYYY-MM-DD")
	}
	to := from
	if b.To != "" {
		if to, err = etimeoffice.ParseDate(b.To); err != nil {
			return etimeoffice.NewLeave{}, errors.New("to must be YYYY-MM-DD")
		}
	}
	return etimeoffice.NewLeave{EmpCode: empCode, From: from, To: to, HalfDay: b.HalfDay, Reason: b.Reason, By: by}, nil
}

func idParam(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	return id, err == nil
}

// ---------------------------------------------------------------- staff

// myEmployee resolves the logged-in staff member's scanner employee; nil
// (with the response written) when they aren't linked.
func myEmployee(w http.ResponseWriter, r *http.Request, db *pgxpool.Pool) *etimeoffice.Employee {
	emp, err := etimeoffice.EmployeeForUser(r.Context(), db, currentUser(r))
	if err != nil {
		log.Printf("etime me: %v", err)
		http.Error(w, "could not load your attendance", http.StatusInternalServerError)
		return nil
	}
	if emp == nil {
		http.Error(w, "your login isn't linked to the attendance system yet — ask an admin", http.StatusNotFound)
		return nil
	}
	return emp
}

// GET /etime/me — the logged-in staff member's leave balance and requests.
// {"linked": false} when their login isn't linked to a scanner employee.
func MeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emp, err := etimeoffice.EmployeeForUser(r.Context(), db, currentUser(r))
		if err != nil {
			log.Printf("etime me: %v", err)
			http.Error(w, "could not load your attendance", http.StatusInternalServerError)
			return
		}
		if emp == nil {
			writeJSON(w, http.StatusOK, map[string]any{"linked": false})
			return
		}
		today := etimeoffice.Today()
		bal, err := etimeoffice.GetBalance(r.Context(), db, emp.EmpCode, today)
		if err != nil {
			leaveError(w, "load your balance", err)
			return
		}
		leaves, err := etimeoffice.ListLeaves(r.Context(), db, etimeoffice.LeaveFilter{EmpCode: emp.EmpCode, Limit: 100})
		if err != nil {
			leaveError(w, "load your leave", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"linked":   true,
			"employee": map[string]any{"emp_code": emp.EmpCode, "name": emp.Name, "leaves_per_month": emp.LeavesPerMonth},
			"balance":  bal,
			"leaves":   leaves,
			"today":    today.Format("2006-01-02"),
		})
	}
}

// GET /etime/me/month?month=YYYY-MM — the staff member's own scanner calendar.
func MyMonthHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emp := myEmployee(w, r, db)
		if emp == nil {
			return
		}
		month, err := monthParam(r)
		if err != nil {
			http.Error(w, "month must be YYYY-MM", http.StatusBadRequest)
			return
		}
		rep, err := etimeoffice.GetMonth(r.Context(), db, month, emp.EmpCode)
		if err != nil {
			leaveError(w, "load your attendance", err)
			return
		}
		writeJSON(w, http.StatusOK, rep)
	}
}

// POST /etime/me/leaves — apply. {"from","to","half_day","reason"}
func ApplyLeaveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emp := myEmployee(w, r, db)
		if emp == nil {
			return
		}
		var body leaveBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		n, err := body.newLeave(emp.EmpCode, currentUser(r))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(n.Reason) == 0 {
			http.Error(w, "please give a reason", http.StatusBadRequest)
			return
		}
		leave, err := etimeoffice.CreateLeave(r.Context(), db, n, false, etimeoffice.PaidAuto, "")
		if err != nil {
			leaveError(w, "apply for leave", err)
			return
		}
		writeJSON(w, http.StatusCreated, leave)
	}
}

// POST /etime/me/leaves/{id}/cancel — withdraw one's own pending request.
func CancelMyLeaveHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		leave, err := etimeoffice.Cancel(r.Context(), db, id, emp.EmpCode, currentUser(r))
		if err != nil {
			leaveError(w, "cancel the request", err)
			return
		}
		writeJSON(w, http.StatusOK, leave)
	}
}

// ---------------------------------------------------------------- admin

// GET /admin/etime/leaves?status=&month=YYYY-MM&emp_code=
func ListLeavesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		f := etimeoffice.LeaveFilter{EmpCode: q.Get("emp_code"), Status: q.Get("status")}
		if m := q.Get("month"); m != "" {
			t, err := etimeoffice.ParseDate(m + "-01")
			if err != nil {
				http.Error(w, "month must be YYYY-MM", http.StatusBadRequest)
				return
			}
			f.Month = &t
		}
		leaves, err := etimeoffice.ListLeaves(r.Context(), db, f)
		if err != nil {
			leaveError(w, "load leave", err)
			return
		}
		pending, err := etimeoffice.PendingCount(r.Context(), db)
		if err != nil {
			leaveError(w, "load leave", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"pending_count": pending, "leaves": leaves})
	}
}

// GET /admin/etime/employees/{code}/balance?month=YYYY-MM
func BalanceHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		month, err := monthParam(r)
		if err != nil {
			http.Error(w, "month must be YYYY-MM", http.StatusBadRequest)
			return
		}
		bal, err := etimeoffice.GetBalance(r.Context(), db, mux.Vars(r)["code"], month)
		if err != nil {
			leaveError(w, "load the balance", err)
			return
		}
		writeJSON(w, http.StatusOK, bal)
	}
}

// POST /admin/etime/leaves — record leave for anyone (including staff with
// no login); approved at once. {"emp_code","from","to","half_day","reason","paid","note"}
func AdminAddLeaveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body leaveBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.EmpCode == "" {
			http.Error(w, "emp_code is required", http.StatusBadRequest)
			return
		}
		paid, ok := etimeoffice.ParsePaidMode(body.Paid)
		if !ok {
			http.Error(w, "paid must be auto, paid or unpaid", http.StatusBadRequest)
			return
		}
		n, err := body.newLeave(body.EmpCode, currentUser(r))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		leave, err := etimeoffice.CreateLeave(r.Context(), db, n, true, paid, body.Note)
		if err != nil {
			leaveError(w, "add the leave", err)
			return
		}
		writeJSON(w, http.StatusCreated, leave)
	}
}

// POST /admin/etime/leaves/{id}/approve — {"paid": "auto"|"paid"|"unpaid", "note"}
func ApproveLeaveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := idParam(r)
		if !ok {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var body leaveBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		paid, ok := etimeoffice.ParsePaidMode(body.Paid)
		if !ok {
			http.Error(w, "paid must be auto, paid or unpaid", http.StatusBadRequest)
			return
		}
		leave, err := etimeoffice.Approve(r.Context(), db, id, paid, body.Note, currentUser(r))
		if err != nil {
			leaveError(w, "approve the leave", err)
			return
		}
		writeJSON(w, http.StatusOK, leave)
	}
}

// POST /admin/etime/leaves/{id}/reject — {"note"}
func RejectLeaveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := idParam(r)
		if !ok {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var body leaveBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		leave, err := etimeoffice.Reject(r.Context(), db, id, body.Note, currentUser(r))
		if err != nil {
			leaveError(w, "reject the leave", err)
			return
		}
		writeJSON(w, http.StatusOK, leave)
	}
}

// POST /admin/etime/leaves/{id}/cancel — withdraw pending or approved leave.
func AdminCancelLeaveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := idParam(r)
		if !ok {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		leave, err := etimeoffice.Cancel(r.Context(), db, id, "", currentUser(r))
		if err != nil {
			leaveError(w, "cancel the leave", err)
			return
		}
		writeJSON(w, http.StatusOK, leave)
	}
}

// GET /admin/etime/staff-logins — staff accounts an employee can be linked to.
func StaffLoginsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logins, err := etimeoffice.StaffLogins(r.Context(), db)
		if err != nil {
			leaveError(w, "load staff logins", err)
			return
		}
		writeJSON(w, http.StatusOK, logins)
	}
}

// PUT /admin/etime/leaves-per-month — {"value": 1.5} for every active employee.
func SetAllAllowanceHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Value *float64 `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Value == nil {
			http.Error(w, `body must be {"value": number}`, http.StatusBadRequest)
			return
		}
		n, err := etimeoffice.SetAllLeavesPerMonth(r.Context(), db, *body.Value)
		if err != nil {
			leaveError(w, "set the allowance", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"updated": n})
	}
}
