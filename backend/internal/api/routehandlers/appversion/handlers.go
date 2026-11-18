package appversion

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lavanyaarora/server/internal/appversion"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// GET /app-version?app=client|team&platform=android|ios — public: the apps
// ask on open, before anyone signs in.
func CheckHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		app, platform := r.URL.Query().Get("app"), r.URL.Query().Get("platform")
		if _, ok := appversion.Apps[app]; !ok || !appversion.Platforms[platform] {
			http.Error(w, "app must be client or team, platform android or ios", http.StatusBadRequest)
			return
		}
		v, err := appversion.Get(r.Context(), db, app, platform)
		if err != nil {
			log.Printf("app version check: %v", err)
			http.Error(w, "could not load the app version", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"latest_build": v.LatestBuild,
			"latest_name":  v.LatestName,
			"min_build":    v.MinBuild,
			"message":      v.Message,
			"update_url":   v.UpdateURL,
		})
	}
}

// GET /admin/app-versions — the settings and how many phones run each build.
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		versions, err := appversion.List(r.Context(), db)
		if err != nil {
			log.Printf("app versions list: %v", err)
			http.Error(w, "could not load app versions", http.StatusInternalServerError)
			return
		}
		devices, err := appversion.Devices(r.Context(), db)
		if err != nil {
			log.Printf("app versions devices: %v", err)
			http.Error(w, "could not load app versions", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"versions":    versions,
			"devices":     devices,
			"active_days": appversion.ActiveDays,
		})
	}
}

// PUT /admin/app-versions/{app}/{platform}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		app, platform := mux.Vars(r)["app"], mux.Vars(r)["platform"]
		if _, ok := appversion.Apps[app]; !ok || !appversion.Platforms[platform] {
			http.Error(w, "unknown app or platform", http.StatusBadRequest)
			return
		}
		var in appversion.Input
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := in.Validate(); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		by, _ := uuid.Parse(r.Context().Value("user_id").(string))
		if err := appversion.Update(r.Context(), db, app, platform, in, by); err != nil {
			log.Printf("app version update: %v", err)
			http.Error(w, "could not save", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "saved"})
	}
}

// POST /admin/app-versions/remind-old — a push asking phones on an app from
// before the update check to update; the only way to reach them. Partner
// and staff logins get their own text.
func RemindOldHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PartnerTitle string `json:"partner_title"`
			PartnerBody  string `json:"partner_body"`
			StaffTitle   string `json:"staff_title"`
			StaffBody    string `json:"staff_body"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		for _, s := range []*string{&body.PartnerTitle, &body.PartnerBody, &body.StaffTitle, &body.StaffBody} {
			*s = strings.TrimSpace(*s)
		}
		if body.PartnerTitle == "" || body.PartnerBody == "" || body.StaffTitle == "" || body.StaffBody == "" {
			http.Error(w, "a title and message are needed for both partners and staff", http.StatusBadRequest)
			return
		}
		staff, partners, err := appversion.OldAppTokens(r.Context(), db)
		if err != nil {
			log.Printf("app versions remind: tokens: %v", err)
			http.Error(w, "could not load the phones", http.StatusInternalServerError)
			return
		}
		sent, failed := 0, 0
		var invalid []string
		for _, g := range []struct {
			tokens      []string
			title, text string
		}{{partners, body.PartnerTitle, body.PartnerBody}, {staff, body.StaffTitle, body.StaffBody}} {
			ok, bad, inv, err := utils.SendMulticast(r.Context(), g.tokens, g.title, g.text, "", map[string]string{"type": "app_update"})
			if err != nil {
				log.Printf("app versions remind: send: %v", err)
			}
			sent, failed, invalid = sent+ok, failed+bad, append(invalid, inv...)
		}
		if len(invalid) > 0 {
			if err := models.DeactivateDeviceTokens(r.Context(), db, invalid); err != nil {
				log.Printf("app versions remind: prune: %v", err)
			}
		}
		log.Printf("app versions remind: %d partner + %d staff phones, %d sent, %d failed", len(partners), len(staff), sent, failed)
		writeJSON(w, http.StatusOK, map[string]int{
			"partner_phones": len(partners), "staff_phones": len(staff), "sent": sent, "failed": failed,
		})
	}
}
