package cheques

// The cheque register (admin panel › Cheque Register), admin only: payments
// to suppliers, the POs they pay, and the POs still to be paid.

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cheques"
)

const duesFromKey = "dues_from"

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func validDate(s *string) bool {
	if s == nil || strings.TrimSpace(*s) == "" {
		return true
	}
	_, err := time.Parse("2006-01-02", strings.TrimSpace(*s))
	return err == nil
}

func actorID(r *http.Request) *uuid.UUID {
	s, _ := r.Context().Value("user_id").(string)
	id, err := uuid.Parse(s)
	if err != nil {
		return nil
	}
	return &id
}

func pathID(r *http.Request) int64 {
	id, _ := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	return id
}

// GET /admin/cheques/register?status=&method=cheque|transfer&linked=yes|no&search=&page=
func ListPaymentsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		if page < 1 {
			page = 1
		}
		f := cheques.Filter{Status: q.Get("status"), Method: q.Get("method"), Linked: q.Get("linked"), Search: q.Get("search"), Limit: 50, Offset: (page - 1) * 50}
		if f.Status != "" && !cheques.Valid(cheques.Statuses, f.Status) {
			http.Error(w, "unknown status", http.StatusBadRequest)
			return
		}
		ps, total, counts, err := cheques.ListPayments(r.Context(), db, f)
		if err != nil {
			log.Printf("cheque register list: %v", err)
			http.Error(w, "could not load payments", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"payments": ps, "total": total, "counts": counts, "page": page, "page_size": f.Limit})
	}
}

// GET /admin/cheques/register/{id} — with the POs it pays and its history.
func GetPaymentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, err := cheques.GetPayment(r.Context(), db, pathID(r))
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque register get: %v", err)
			http.Error(w, "could not load payment", http.StatusInternalServerError)
			return
		}
		writeJSON(w, p)
	}
}

// checkPayment validates a payment from the page; the message says what is wrong.
func checkPayment(in *cheques.PaymentInput, isNew bool) string {
	if in.Method == "" {
		in.Method = "cheque"
	}
	if !cheques.Valid(cheques.Methods, in.Method) {
		return "unknown payment method"
	}
	if strings.TrimSpace(in.Payee) == "" {
		return "who is it paid to?"
	}
	if in.ManufacturerID == nil && !in.OtherPayee {
		return "pick the manufacturer, or tick Other payee"
	}
	if in.Amount <= 0 || math.IsNaN(in.Amount) || in.Amount > 1e11 {
		return "enter the amount"
	}
	if in.Method == "cheque" && (in.ChequeNo == nil || strings.TrimSpace(*in.ChequeNo) == "") {
		return "enter the cheque number"
	}
	if !validDate(in.PaymentDate) {
		return "the date is not valid"
	}
	if isNew {
		if in.Status == "" {
			in.Status = "made"
			if in.Method != "cheque" {
				in.Status = "cleared" // a transfer is done when it is made
			}
		}
		if !cheques.Valid(cheques.Statuses, in.Status) {
			return "unknown status"
		}
		if in.Source != "print" {
			in.Source = "app"
		}
	}
	seen, sum := map[int]bool{}, 0.0
	for _, a := range in.Allocations {
		if a.POID <= 0 || seen[a.POID] || a.Amount < 0 {
			return "each PO can be linked once, with an amount of zero or more"
		}
		seen[a.POID] = true
		sum += a.Amount
	}
	if sum > in.Amount+0.005 {
		return "the amounts split over the POs add up to more than the payment"
	}
	return ""
}

func savePayment(db *pgxpool.Pool, isNew bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in cheques.PaymentInput
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
			http.Error(w, "invalid payment", http.StatusBadRequest)
			return
		}
		if msg := checkPayment(&in, isNew); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		var id int64
		if !isNew {
			id = pathID(r)
		}
		id, err := cheques.SavePayment(r.Context(), db, id, in, actorID(r))
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque register save: %v", err)
			http.Error(w, "could not save payment", http.StatusInternalServerError)
			return
		}
		p, err := cheques.GetPayment(r.Context(), db, id)
		if err != nil {
			log.Printf("cheque register reload %d: %v", id, err)
			http.Error(w, "saved, but could not reload it", http.StatusInternalServerError)
			return
		}
		if isNew {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(p)
			return
		}
		writeJSON(w, p)
	}
}

// POST /admin/cheques/register — records a payment (also called when a cheque is printed).
func CreatePaymentHandler(db *pgxpool.Pool) http.HandlerFunc { return savePayment(db, true) }

// PUT /admin/cheques/register/{id} — edits a payment and the POs it pays.
func UpdatePaymentHandler(db *pgxpool.Pool) http.HandlerFunc { return savePayment(db, false) }

// POST /admin/cheques/register/{id}/status {status, note}
func SetStatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Status string `json:"status"`
			Note   string `json:"note"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil || !cheques.Valid(cheques.Statuses, body.Status) {
			http.Error(w, "unknown status", http.StatusBadRequest)
			return
		}
		err := cheques.SetStatus(r.Context(), db, pathID(r), body.Status, body.Note, actorID(r))
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque register status: %v", err)
			http.Error(w, "could not change status", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// POST /admin/cheques/register/{id}/remarks {note}
func AddRemarkHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Note string `json:"note"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil || strings.TrimSpace(body.Note) == "" {
			http.Error(w, "write a remark", http.StatusBadRequest)
			return
		}
		err := cheques.AddRemark(r.Context(), db, pathID(r), body.Note, actorID(r))
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque register remark: %v", err)
			http.Error(w, "could not save remark", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/cheques/dues?older=1&search= — received POs not fully paid,
// counted from the shared start date.
func DuesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		from := cheques.Setting(r.Context(), db, duesFromKey, "2026-10-01")
		ds, err := cheques.Dues(r.Context(), db, from, r.URL.Query().Get("older") == "1", r.URL.Query().Get("search"))
		if err != nil {
			log.Printf("cheque dues: %v", err)
			http.Error(w, "could not load dues", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"dues": ds, "from": from})
	}
}

// PUT /admin/cheques/dues/from {from: "2026-10-01"}
func SetDuesFromHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			From string `json:"from"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil || !dateRe.MatchString(body.From) || !validDate(&body.From) {
			http.Error(w, "send a date like 2026-10-01", http.StatusBadRequest)
			return
		}
		if err := cheques.SetSetting(r.Context(), db, duesFromKey, body.From); err != nil {
			log.Printf("cheque dues from: %v", err)
			http.Error(w, "could not save the date", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/cheques/pos?search=&open=1 — PO lines to link or receive.
func FindPOsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		if len(search) < 2 {
			writeJSON(w, map[string]any{"pos": []cheques.Due{}})
			return
		}
		ps, err := cheques.FindPOs(r.Context(), db, search, r.URL.Query().Get("open") == "1")
		if err != nil {
			log.Printf("cheque po search: %v", err)
			http.Error(w, "could not search POs", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"pos": ps})
	}
}

// POST /admin/cheques/pos/{id}/receive {received_on, qty_received, bill_number, bill_date, bill_amount}
func ReceivePOHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rc cheques.Receipt
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&rc); err != nil {
			http.Error(w, "invalid receipt", http.StatusBadRequest)
			return
		}
		if !dateRe.MatchString(rc.ReceivedOn) || !validDate(&rc.ReceivedOn) || !validDate(rc.BillDate) {
			http.Error(w, "enter the date the goods arrived (and a valid bill date)", http.StatusBadRequest)
			return
		}
		if (rc.BillAmount != nil && *rc.BillAmount < 0) || (rc.QtyReceived != nil && *rc.QtyReceived < 0) {
			http.Error(w, "amounts can't be negative", http.StatusBadRequest)
			return
		}
		err := cheques.Receive(r.Context(), db, int(pathID(r)), rc, actorID(r))
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "PO not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque po receive: %v", err)
			http.Error(w, "could not save", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/cheques/suppliers — manufacturers with their credit periods.
func SuppliersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ss, err := cheques.Suppliers(r.Context(), db)
		if err != nil {
			log.Printf("cheque suppliers: %v", err)
			http.Error(w, "could not load suppliers", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"suppliers": ss})
	}
}

// PUT /admin/cheques/suppliers/{id}/credit-days {credit_days: 60 | null}
func SetCreditDaysHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		var body struct {
			CreditDays *int `json:"credit_days"`
		}
		if err != nil || json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body) != nil ||
			(body.CreditDays != nil && (*body.CreditDays < 0 || *body.CreditDays > 365)) {
			http.Error(w, "send credit_days between 0 and 365, or null", http.StatusBadRequest)
			return
		}
		err = cheques.SetCreditDays(r.Context(), db, id, body.CreditDays)
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "supplier not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque credit days: %v", err)
			http.Error(w, "could not save", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/cheques/marg-parties?search= — Marg ledger suppliers to link.
func MargPartiesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		if len(search) < 2 {
			writeJSON(w, map[string]any{"parties": []cheques.MargParty{}})
			return
		}
		ps, err := cheques.MargParties(r.Context(), db, search)
		if err != nil {
			log.Printf("cheque marg parties: %v", err)
			http.Error(w, "could not search Marg", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"parties": ps})
	}
}

// PUT /admin/cheques/suppliers/{id}/marg {party_codes: ["HVS"], rename: true, name: ""}
// — links a manufacturer to its Marg parties; with rename it takes Marg's
// name (or name, for one Marg cut short) and its POs follow.
func LinkMargHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		var body struct {
			PartyCodes []string `json:"party_codes"`
			Rename     bool     `json:"rename"`
			Name       string   `json:"name"`
		}
		if err != nil || json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body) != nil || len(body.PartyCodes) > 10 {
			http.Error(w, "send party_codes (up to 10)", http.StatusBadRequest)
			return
		}
		codes := []string{}
		for _, c := range body.PartyCodes {
			if c = strings.TrimSpace(c); c != "" {
				codes = append(codes, c)
			}
		}
		err = cheques.LinkMargParties(r.Context(), db, id, codes, body.Rename, body.Name, actorID(r))
		switch {
		case errors.Is(err, cheques.ErrNotFound):
			http.Error(w, "manufacturer not found", http.StatusNotFound)
		case errors.Is(err, cheques.ErrNameTaken):
			http.Error(w, err.Error(), http.StatusConflict)
		case err != nil:
			log.Printf("cheque link marg: %v", err)
			http.Error(w, "could not link", http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}
}
