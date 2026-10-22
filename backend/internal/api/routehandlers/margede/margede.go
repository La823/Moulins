package margede

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margede"
)

// GET /admin/marg-bills-sync/status — schedule, last successful sync,
// any run in flight, recent runs, and how much bill data is stored.
func StatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		o, err := margede.Overview(r.Context(), db)
		if err != nil {
			log.Printf("marg bills sync status: %v", err)
			http.Error(w, "could not read bills sync status", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(o)
	}
}

// GET /admin/marg-bills?type=S&from=2026-10-01&to=2026-10-19&search=&status=&page=1
func ListBillsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		list, err := margede.ListBills(r.Context(), db, margede.BillFilter{
			Type: q.Get("type"), From: q.Get("from"), To: q.Get("to"),
			Search: q.Get("search"), Status: q.Get("status"), Page: page,
			Sort: q.Get("sort"), Dir: q.Get("dir"), Kind: q.Get("kind"), Party: q.Get("party"),
		})
		if err != nil {
			log.Printf("marg bills list: %v", err)
			http.Error(w, "could not list bills", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/marg-ledger?kind=supplier&matched=no&search=&page=1
func ListLedgerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		list, err := margede.ListLedger(r.Context(), db, margede.LedgerFilter{
			Kind: q.Get("kind"), Matched: q.Get("matched"), Search: q.Get("search"), Page: page,
		})
		if err != nil {
			log.Printf("marg ledger list: %v", err)
			http.Error(w, "could not list ledger", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/marg-stock?view=negative&company=IB&search=&page=1 — products
// with their batch-wise stock.
func ListStockHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		list, err := margede.ListStock(r.Context(), db, margede.StockFilter{
			Search: q.Get("search"), Company: q.Get("company"), View: q.Get("view"), Page: page,
		})
		if err != nil {
			log.Printf("marg stock list: %v", err)
			http.Error(w, "could not list stock", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/marg-ledger/{code} — one party: account, totals per bill
// type, top products. Its bills come from /admin/marg-bills?party={code}.
func GetPartyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := mux.Vars(r)["code"]
		d, err := margede.GetParty(r.Context(), db, code)
		if errors.Is(err, margede.ErrPartyNotFound) {
			http.Error(w, "party not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("marg party %q: %v", code, err)
			http.Error(w, "could not load party", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(d)
	}
}

// GET /admin/partners/{id}/marg-bills — a partner's Marg bills summary,
// monthly series and timeline (bills, app orders, joined), for the partner
// page. linked=false when the partner has no Marg party (rid).
func PartnerBillsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid partner id", http.StatusBadRequest)
			return
		}
		d, err := margede.GetPartnerBills(r.Context(), db, id)
		if errors.Is(err, margede.ErrPartyNotFound) {
			http.Error(w, "partner not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("partner %s marg bills: %v", id, err)
			http.Error(w, "could not load partner bills", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(d)
	}
}

// GET /admin/marg-bills/{voucher} — one bill with its lines.
func GetBillHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		voucher, err := strconv.ParseInt(mux.Vars(r)["voucher"], 10, 64)
		if err != nil {
			http.Error(w, "invalid voucher", http.StatusBadRequest)
			return
		}
		bill, err := margede.GetBill(r.Context(), db, voucher)
		if err != nil {
			http.Error(w, "bill not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(bill)
	}
}

// GET /admin/marg-bills-sync/runs/{id} — one run.
func RunHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid run id", http.StatusBadRequest)
			return
		}
		run, err := margede.GetRun(r.Context(), db, id)
		if err != nil {
			http.Error(w, "sync run not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(run)
	}
}

// POST /admin/marg-bills-sync/trigger — starts a bills sync in the
// background. Body (optional): {"datetime": "2026-10-19 09:00:00"} for only
// what changed since then; omitted = full pull of the current year, which
// takes Marg a few seconds.
func TriggerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creds, err := margede.CredentialsFromEnv()
		if err != nil {
			http.Error(w, "marg bills sync is not configured: "+err.Error(), http.StatusServiceUnavailable)
			return
		}
		var body struct {
			Datetime string `json:"datetime"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		runID, err := margede.Launch(db, creds, "manual", body.Datetime)
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			if runID != 0 {
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]any{"run_id": runID, "error": err.Error(), "already_running": true})
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]any{"run_id": runID})
	}
}

// GET /my/marg-bills — the logged-in partner's own invoices (final sale
// bills, GST included). Partners only.
func MyBillsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := partnerID(w, r)
		if !ok {
			return
		}
		out, err := margede.ListMyBills(r.Context(), db, userID)
		if err != nil {
			log.Printf("my marg bills %s: %v", userID, err)
			http.Error(w, "could not load your bills", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

// GET /my/marg-bills/{voucher} — one of the partner's own invoices with its
// lines; 404 for any bill that isn't theirs.
func MyBillHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := partnerID(w, r)
		if !ok {
			return
		}
		voucher, err := strconv.ParseInt(mux.Vars(r)["voucher"], 10, 64)
		if err != nil {
			http.Error(w, "invalid bill", http.StatusBadRequest)
			return
		}
		bill, err := margede.GetMyBill(r.Context(), db, userID, voucher)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "bill not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("my marg bill %s/%d: %v", userID, voucher, err)
			http.Error(w, "could not load the bill", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(bill)
	}
}

// partnerID is the logged-in user when they are a partner; otherwise it
// answers 403 and returns false.
func partnerID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	if role, _ := r.Context().Value("role").(string); role != "partner" {
		http.Error(w, "bills are only available to partners", http.StatusForbidden)
		return uuid.Nil, false
	}
	idStr, _ := r.Context().Value("user_id").(string)
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return uuid.Nil, false
	}
	return id, true
}
