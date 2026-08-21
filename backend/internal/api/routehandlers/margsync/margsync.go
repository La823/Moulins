package margsync

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/margsync"
)

// GET /admin/marg-sync/status — the last successful sync's data cursor
// (Marg's echoed DateTime), so the UI can show "Last synced: ..." and staff
// know not to trigger another sync too soon given Marg's rate limit.
func StatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		lastSyncedAt, err := margsync.GetLastSyncedAt(r.Context(), db)
		if err != nil {
			log.Printf("marg sync status: failed to read last synced at: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"last_synced_at": lastSyncedAt})
	}
}

// POST /admin/marg-sync/trigger — runs a Marg MST2017 sync (delta pull if a
// prior sync recorded a cursor, otherwise a full pull) and reports row
// counts. Synchronous — the sync typically completes in a few seconds.
func TriggerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creds, err := margsync.CredentialsFromEnv()
		if err != nil {
			http.Error(w, "marg sync is not configured: "+err.Error(), http.StatusServiceUnavailable)
			return
		}

		lastSyncedAt, err := margsync.GetLastSyncedAt(r.Context(), db)
		if err != nil {
			log.Printf("marg sync: failed to read last synced at: %v", err)
		}

		result, dateTime, err := margsync.RunSync(r.Context(), db, creds, lastSyncedAt)
		if err != nil {
			log.Printf("marg sync error: %v", err)
			http.Error(w, "marg sync failed: "+err.Error(), http.StatusBadGateway)
			return
		}

		cursorWarning := ""
		if err := margsync.SetLastSyncedAt(r.Context(), db, dateTime); err != nil {
			log.Printf("marg sync: failed to persist last synced at: %v", err)
			cursorWarning = "sync completed but the last-synced cursor could not be saved — the next sync may re-pull the same data"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"products_upserted": result.ProductsUpserted,
			"batches_upserted":  result.BatchesUpserted,
			"parties_upserted":  result.PartiesUpserted,
			"cursor_warning":    cursorWarning,
		})
	}
}
