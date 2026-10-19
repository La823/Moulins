package margede

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
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
			Sort: q.Get("sort"), Dir: q.Get("dir"), Kind: q.Get("kind"),
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
