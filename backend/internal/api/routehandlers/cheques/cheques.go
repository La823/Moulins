package cheques

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cheques"
)

// The cheque writer's bank layouts and payee lookup (admin panel › Cheques),
// admin only.

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// GET /admin/cheques/profiles — every bank layout.
func ListProfilesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ps, err := cheques.ListProfiles(r.Context(), db)
		if err != nil {
			log.Printf("cheque profiles: %v", err)
			http.Error(w, "could not load layouts", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"profiles": ps})
	}
}

// validProfile checks a layout's name and that its data is a JSON object.
func validProfile(p cheques.Profile) bool {
	return strings.TrimSpace(p.Name) != "" && len(p.Data) > 0 && p.Data[0] == '{' && json.Valid(p.Data)
}

// POST /admin/cheques/profiles {"profiles": [{name, data, sort_order}]} —
// adds layouts and returns them with their ids.
func CreateProfilesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Profiles []cheques.Profile `json:"profiles"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 20<<20)).Decode(&body); err != nil || len(body.Profiles) == 0 || len(body.Profiles) > 50 {
			http.Error(w, "send 1-50 layouts", http.StatusBadRequest)
			return
		}
		for _, p := range body.Profiles {
			if !validProfile(p) {
				http.Error(w, "each layout needs a name and a data object", http.StatusBadRequest)
				return
			}
		}
		ps, err := cheques.CreateProfiles(r.Context(), db, body.Profiles)
		if err != nil {
			log.Printf("cheque profiles create: %v", err)
			http.Error(w, "could not save layouts", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"profiles": ps})
	}
}

// PUT /admin/cheques/profiles/{id} {name, data} — saves a layout.
func UpdateProfileHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, _ := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
		var p cheques.Profile
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 10<<20)).Decode(&p); err != nil || !validProfile(p) {
			http.Error(w, "a layout needs a name and a data object", http.StatusBadRequest)
			return
		}
		p.ID = id
		out, err := cheques.UpdateProfile(r.Context(), db, p)
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "layout not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque profile %d update: %v", id, err)
			http.Error(w, "could not save layout", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}

// DELETE /admin/cheques/profiles/{id}
func DeleteProfileHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, _ := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
		err := cheques.DeleteProfile(r.Context(), db, id)
		if errors.Is(err, cheques.ErrNotFound) {
			http.Error(w, "layout not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("cheque profile %d delete: %v", id, err)
			http.Error(w, "could not delete layout", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/cheques/payees?search=alp — Marg ledger parties to pay.
func PayeesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		if len(search) < 2 {
			writeJSON(w, map[string]any{"payees": []cheques.Payee{}})
			return
		}
		ps, err := cheques.Payees(r.Context(), db, search)
		if err != nil {
			log.Printf("cheque payees: %v", err)
			http.Error(w, "could not search payees", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"payees": ps})
	}
}
