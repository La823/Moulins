// Package mailer sends transactional email via Microsoft Graph, using an
// Azure AD app-only (client-credentials) grant so mail always goes out as
// the fixed MAIL_SENDER mailbox regardless of who's logged into the app.
package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// Config is read once from the environment; a nil/zero-value Config means
// mail sending is disabled (Send becomes a no-op) so local dev and any
// deploy that hasn't configured Graph yet doesn't need special-casing at
// every call site.
type Config struct {
	TenantID     string
	ClientID     string
	ClientSecret string
	Sender       string
}

func ConfigFromEnv() Config {
	return Config{
		TenantID:     os.Getenv("MS_GRAPH_TENANT_ID"),
		ClientID:     os.Getenv("MS_GRAPH_CLIENT_ID"),
		ClientSecret: os.Getenv("MS_GRAPH_CLIENT_SECRET"),
		Sender:       os.Getenv("MAIL_SENDER"),
	}
}

func (c Config) enabled() bool {
	return c.TenantID != "" && c.ClientID != "" && c.ClientSecret != "" && c.Sender != ""
}

var (
	tokenMu     sync.Mutex
	cachedToken string
	tokenExpiry time.Time
)

// token returns a cached app-only Graph access token, refreshing it via the
// client-credentials grant a minute before it actually expires.
func token(ctx context.Context, c Config) (string, error) {
	tokenMu.Lock()
	defer tokenMu.Unlock()

	if cachedToken != "" && time.Now().Before(tokenExpiry) {
		return cachedToken, nil
	}

	form := fmt.Sprintf(
		"client_id=%s&client_secret=%s&scope=https%%3A%%2F%%2Fgraph.microsoft.com%%2F.default&grant_type=client_credentials",
		c.ClientID, c.ClientSecret,
	)
	url := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", c.TenantID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBufferString(form))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var body struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK || body.AccessToken == "" {
		return "", fmt.Errorf("graph token request failed: %d %s: %s", resp.StatusCode, body.Error, body.ErrorDesc)
	}

	cachedToken = body.AccessToken
	tokenExpiry = time.Now().Add(time.Duration(body.ExpiresIn-60) * time.Second)
	return cachedToken, nil
}

type recipient struct {
	EmailAddress struct {
		Address string `json:"address"`
	} `json:"emailAddress"`
}

func toRecipient(address string) recipient {
	var r recipient
	r.EmailAddress.Address = address
	return r
}

type sendMailRequest struct {
	Message struct {
		Subject      string      `json:"subject"`
		Body         struct {
			ContentType string `json:"contentType"`
			Content     string `json:"content"`
		} `json:"body"`
		ToRecipients []recipient `json:"toRecipients"`
	} `json:"message"`
	SaveToSentItems bool `json:"saveToSentItems"`
}

// Send emails htmlBody to `to` with the given subject, as the configured
// MAIL_SENDER mailbox. If mail isn't configured (Config.enabled() is
// false), it logs and returns nil — callers should treat email as
// best-effort and never fail the caller's own operation because mail
// didn't go out.
func Send(ctx context.Context, c Config, to, subject, htmlBody string) error {
	if !c.enabled() {
		log.Printf("mailer: not configured, skipping email %q to %s", subject, to)
		return nil
	}
	if to == "" {
		return nil
	}

	accessToken, err := token(ctx, c)
	if err != nil {
		return fmt.Errorf("mailer: token: %w", err)
	}

	var reqBody sendMailRequest
	reqBody.Message.Subject = subject
	reqBody.Message.Body.ContentType = "HTML"
	reqBody.Message.Body.Content = htmlBody
	reqBody.Message.ToRecipients = []recipient{toRecipient(to)}
	reqBody.SaveToSentItems = true

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s/sendMail", c.Sender)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		return fmt.Errorf("mailer: sendMail failed: %d %s", resp.StatusCode, errBody.String())
	}
	return nil
}

// SendAsync fires Send in a background goroutine with its own timeout,
// logging failures instead of propagating them — the pattern every order-
// event call site uses so a slow/broken mail provider never blocks or
// fails the request that triggered it.
func SendAsync(c Config, to, subject, htmlBody string) {
	if to == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := Send(ctx, c, to, subject, htmlBody); err != nil {
			log.Printf("mailer: failed to send %q to %s: %v", subject, to, err)
		}
	}()
}
