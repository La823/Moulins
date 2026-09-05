package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/mailer"
	"github.com/lavanyaarora/server/internal/models"
)

type ForgotPasswordRequest struct {
	PhoneNumber string `json:"phone_number"`
}

type ForgotPasswordResponse struct {
	Message  string `json:"message"`
	HasEmail bool   `json:"has_email"`
}

func frontendBaseURL() string {
	if u := os.Getenv("FRONTEND_URL"); u != "" {
		return u
	}
	return "https://moulinspharma.com"
}

// POST /auth/forgot-password — looks the account up by phone number. If it
// has an email on file, emails a reset link and always reports success
// either way so the endpoint doesn't leak which phone numbers are valid
// accounts. If the account has no email, reports that explicitly so the
// frontend can point the user to the admin instead of a dead end.
func ForgotPasswordHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req ForgotPasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.PhoneNumber == "" {
			http.Error(w, "phone_number is required", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByPhone(r.Context(), db, req.PhoneNumber)
		if err != nil {
			if err == pgx.ErrNoRows {
				// Don't reveal whether the phone number exists.
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(ForgotPasswordResponse{
					Message:  "If this account has an email on file, a reset link has been sent.",
					HasEmail: false,
				})
				return
			}
			log.Printf("forgot password lookup error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}

		if user.Email == nil || *user.Email == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(ForgotPasswordResponse{
				Message:  "No email is linked to this account. Please contact the admin to reset your password.",
				HasEmail: false,
			})
			return
		}

		token, err := models.GeneratePasswordResetToken(r.Context(), db, user.ID)
		if err != nil {
			log.Printf("forgot password token generation error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}

		resetLink := fmt.Sprintf("%s/reset-password?token=%s", frontendBaseURL(), token)
		name := "there"
		if user.Username != nil && *user.Username != "" {
			name = *user.Username
		}
		subject := "Reset your Moulins password"
		body := fmt.Sprintf(`
			<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
				<h2 style="color: #1A1A1A;">Reset your password</h2>
				<p>Hi %s,</p>
				<p>We received a request to reset the password for your Moulins account. This link expires in 30 minutes.</p>
				<p style="margin: 24px 0;">
					<a href="%s" style="background: #AC2528; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset Password</a>
				</p>
				<p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
			</div>
		`, name, resetLink)

		mailer.SendAsync(mailer.ConfigFromEnv(), *user.Email, subject, body)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ForgotPasswordResponse{
			Message:  "If this account has an email on file, a reset link has been sent.",
			HasEmail: true,
		})
	}
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// POST /auth/reset-password — validates the token from the emailed link and
// sets a new password, then marks the token used so it can't be replayed.
func ResetPasswordHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		var req ResetPasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Token == "" || req.NewPassword == "" {
			http.Error(w, "token and new_password are required", http.StatusBadRequest)
			return
		}
		if len(req.NewPassword) < 6 {
			http.Error(w, "password must be at least 6 characters", http.StatusBadRequest)
			return
		}

		userID, err := models.GetUserIDForResetToken(r.Context(), db, req.Token)
		if err != nil {
			if err == models.ErrInvalidResetToken {
				http.Error(w, "reset link is invalid or has expired", http.StatusBadRequest)
				return
			}
			log.Printf("reset password token lookup error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}

		if err := models.UpdateUserPassword(r.Context(), db, userID, req.NewPassword); err != nil {
			log.Printf("reset password update error: %v", err)
			http.Error(w, "something went wrong", http.StatusInternalServerError)
			return
		}

		if err := models.MarkResetTokenUsed(r.Context(), db, req.Token); err != nil {
			log.Printf("reset password mark-used error: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "password updated"})
	}
}
