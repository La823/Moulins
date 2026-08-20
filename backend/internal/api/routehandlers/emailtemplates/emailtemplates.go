// Package emailtemplates lets admins view and edit the copy of every
// system email — both the automated ones (fired by backend events) and the
// manual ones (sent by staff from an entity's detail page) — without a
// code deploy.
package emailtemplates

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// GET /admin/email-templates
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		templates, err := models.ListEmailTemplates(r.Context(), db)
		if err != nil {
			log.Printf("list email templates error: %v", err)
			http.Error(w, "could not fetch email templates", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"templates": templates})
	}
}

// GET /admin/email-templates/{key}
func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := mux.Vars(r)["key"]
		t, err := models.GetEmailTemplateByKey(r.Context(), db, key)
		if err != nil {
			http.Error(w, "template not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(t)
	}
}

// PUT /admin/email-templates/{key} — edits subject/body only; key and
// trigger_mode are fixed at the code level that invokes each template.
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := mux.Vars(r)["key"]

		var body struct {
			Subject  string `json:"subject"`
			BodyHTML string `json:"body_html"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.Subject == "" || body.BodyHTML == "" {
			http.Error(w, "subject and body_html are required", http.StatusBadRequest)
			return
		}

		if err := models.UpdateEmailTemplate(r.Context(), db, key, body.Subject, body.BodyHTML); err != nil {
			log.Printf("update email template error: %v", err)
			http.Error(w, "could not update template", http.StatusInternalServerError)
			return
		}

		t, err := models.GetEmailTemplateByKey(r.Context(), db, key)
		if err != nil {
			http.Error(w, "template not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(t)
	}
}
