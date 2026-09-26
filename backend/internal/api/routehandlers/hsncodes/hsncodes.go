// Package hsncodes serves lookups against the HSN/SAC reference master.
package hsncodes

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// GET /admin/hsn-codes/{code}  — also accepts /admin/hsn-codes?code=...
// Returns the code's details as JSON, with its parent chain so a valid code
// that isn't in the sheet still resolves to something useful.
func LookupHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := mux.Vars(r)["code"]
		if code == "" {
			code = r.URL.Query().Get("code")
		}
		if code == "" {
			http.Error(w, "code is required", http.StatusBadRequest)
			return
		}
		result, err := models.LookupHsnCode(r.Context(), db, code)
		if err != nil {
			log.Printf("hsn lookup %q: %v", code, err)
			http.Error(w, "could not look up hsn code", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}
