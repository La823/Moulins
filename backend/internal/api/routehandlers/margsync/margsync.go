package margsync

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margsync"
)

// GET /admin/marg-sync/status — the last successful sync's data cursor
// (Marg's echoed DateTime) plus the currently running sync, if any, and the
// window choices the UI offers. One call is enough to render the whole
// control: the button, the window picker, and any live progress bar.
func StatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		lastSyncedAt, err := margsync.GetLastSyncedAt(r.Context(), db)
		if err != nil {
			log.Printf("marg sync status: failed to read last synced at: %v", err)
		}

		// Clear out any run abandoned by a backend restart before reporting,
		// so the UI doesn't show a phantom sync running forever.
		if err := margsync.ReapStaleRuns(r.Context(), db); err != nil {
			log.Printf("marg sync status: reap stale runs: %v", err)
		}
		active, _ := margsync.ActiveRun(r.Context(), db)
		recent, err := margsync.ListRuns(r.Context(), db, 10)
		if err != nil {
			log.Printf("marg sync status: failed to list runs: %v", err)
			recent = nil
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"last_synced_at": lastSyncedAt,
			"active_run":     active,
			"recent_runs":    recent,
			"windows":        margsync.SyncWindows,
		})
	}
}

// GET /admin/marg-sync/runs/{id} — one run's live progress. Polled by the
// admin panel while a sync is in flight.
func RunHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid run id", http.StatusBadRequest)
			return
		}
		run, err := margsync.GetRun(r.Context(), db, id)
		if err != nil {
			http.Error(w, "sync run not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(run)
	}
}

// POST /admin/marg-sync/trigger — starts a Marg master-data sync in the
// background and returns its run id immediately.
//
// This used to run the sync inline and block the response. That was never
// viable: a full pull moves thousands of rows and has taken over 40 minutes,
// so the request would time out long before the work finished, leaving the
// sync running invisibly with no way to see whether it worked.
//
// Body (optional): {"window": "1m"} — see margsync.SyncWindows.
func TriggerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creds, err := margsync.CredentialsFromEnv()
		if err != nil {
			http.Error(w, "marg sync is not configured: "+err.Error(), http.StatusServiceUnavailable)
			return
		}

		var body struct {
			Window string `json:"window"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Window == "" {
			body.Window = "1m" // the recommended default
		}

		runID, err := margsync.Launch(db, creds, "manual", body.Window)
		if err != nil {
			// A run already in flight isn't an error the user needs to fix —
			// hand back the existing run so the UI can just attach to it.
			if runID != 0 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]any{
					"run_id": runID, "error": err.Error(), "already_running": true,
				})
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		run, _ := margsync.GetRun(r.Context(), db, runID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]any{"run_id": runID, "run": run})
	}
}
