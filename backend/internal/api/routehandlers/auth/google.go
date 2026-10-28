package auth

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
	"google.golang.org/api/idtoken"
)

// POST /auth/google  { "credential": "<Google ID token>" }
//
// "Sign up with Google" for visitors. The website gets the ID token from
// Google's sign-in button; we check it was issued for our client id
// (GOOGLE_CLIENT_ID) and log the person in as a visitor, creating the
// visitor on first sign-in. Someone whose email already belongs to an
// account is sent to the normal login instead, so a partner never ends up
// with a second, locked-down visitor login.
func GoogleSignInHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
		clientID := os.Getenv("GOOGLE_CLIENT_ID")
		if clientID == "" {
			http.Error(w, "Google sign-in isn't set up yet", http.StatusServiceUnavailable)
			return
		}
		var req struct {
			Credential string `json:"credential"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Credential == "" {
			http.Error(w, "credential is required", http.StatusBadRequest)
			return
		}

		payload, err := idtoken.Validate(r.Context(), req.Credential, clientID)
		if err != nil {
			http.Error(w, "Google sign-in failed — please try again", http.StatusUnauthorized)
			return
		}
		claim := func(k string) string { s, _ := payload.Claims[k].(string); return s }
		email := claim("email")
		if verified, _ := payload.Claims["email_verified"].(bool); !verified || email == "" || payload.Subject == "" {
			http.Error(w, "your Google account's email isn't verified", http.StatusUnauthorized)
			return
		}

		taken, err := models.EmailHasAccount(r.Context(), db, email)
		if err != nil {
			log.Printf("google sign-in: account email check error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}
		if taken {
			// the website matches on this wording to offer "Go to Partner login"
			http.Error(w, "You already have a Moulins account with this email. Use Partner login with your phone number and password.", http.StatusConflict)
			return
		}

		v, err := models.UpsertGoogleVisitor(r.Context(), db, payload.Subject, email, claim("name"), claim("picture"))
		if err != nil {
			log.Printf("google sign-in: visitor upsert error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}
		token, err := utils.GenerateToken(v.ID, models.RoleVisitor)
		if err != nil {
			log.Printf("google sign-in: token error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"token": token, "user": v})
	}
}
