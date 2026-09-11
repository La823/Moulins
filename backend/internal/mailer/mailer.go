// Package mailer sends transactional email via Microsoft Graph, using an
// Azure AD app-only (client-credentials) grant so mail always goes out as
// the fixed MAIL_SENDER mailbox regardless of who's logged into the app.
package mailer

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
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
		Subject string `json:"subject"`
		Body    struct {
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

// SendMultiple is Send for more than one recipient (e.g. a manufacturer with
// several contact emails on file) — all addresses go in To, one message.
func SendMultiple(ctx context.Context, c Config, tos []string, subject, htmlBody string) error {
	if !c.enabled() {
		log.Printf("mailer: not configured, skipping email %q to %v", subject, tos)
		return nil
	}
	if len(tos) == 0 {
		return fmt.Errorf("mailer: no recipients")
	}

	accessToken, err := token(ctx, c)
	if err != nil {
		return fmt.Errorf("mailer: token: %w", err)
	}

	var reqBody sendMailRequest
	reqBody.Message.Subject = subject
	reqBody.Message.Body.ContentType = "HTML"
	reqBody.Message.Body.Content = htmlBody
	for _, to := range tos {
		if to == "" {
			continue
		}
		reqBody.Message.ToRecipients = append(reqBody.Message.ToRecipients, toRecipient(to))
	}
	if len(reqBody.Message.ToRecipients) == 0 {
		return fmt.Errorf("mailer: no recipients")
	}
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

// ReplyToMessage sends a reply-to-sender-only (not reply-all) to an
// existing message via Graph's /reply action. Unlike composing a brand new
// message via SendMultiple, this preserves proper email threading
// (In-Reply-To/References set by Graph itself) automatically — used for
// replying to a manufacturer's reply from within the panel.
func ReplyToMessage(ctx context.Context, c Config, messageID, comment string) error {
	if !c.enabled() {
		log.Printf("mailer: not configured, skipping reply to message %s", messageID)
		return nil
	}
	if messageID == "" {
		return fmt.Errorf("mailer: message id is required")
	}

	accessToken, err := token(ctx, c)
	if err != nil {
		return fmt.Errorf("mailer: token: %w", err)
	}

	payload, err := json.Marshal(map[string]string{"comment": comment})
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s/messages/%s/reply", c.Sender, messageID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewBuffer(payload))
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
		return fmt.Errorf("mailer: reply failed: %d %s", resp.StatusCode, errBody.String())
	}
	return nil
}

// SendMultipleTracked sends exactly like SendMultiple (the same /sendMail
// action, which only needs Mail.Send) and, best-effort, also looks up the
// message it just placed in Sent Items to return its id/conversationId for
// later reply lookups. That lookup needs Mail.Read — if the app registration
// doesn't have it yet (or the lookup fails for any other reason), the send
// itself has already succeeded, so this only logs and returns empty ids
// rather than failing the whole call. Delivery never depends on tracking.
func SendMultipleTracked(ctx context.Context, c Config, tos []string, subject, htmlBody string) (messageID, conversationID, internetMessageID string, err error) {
	// Captured before the send so findSentMessage can reject anything Sent
	// Items returns that predates this call — a timestamp guard alone.
	sentAfter := time.Now().Add(-10 * time.Second)

	// A per-send random token, hidden in the body, is the real disambiguator:
	// PO emails reuse the same subject on every send, so subject+timestamp
	// alone previously risked matching a stale Sent Items entry if the new
	// one hadn't finished indexing yet. The token makes the match exact
	// instead of "closest guess" — subject and timestamp are kept as
	// additional checks (cheaper to filter on, and a safety net if the
	// token were ever stripped in transit).
	trackingToken := newTrackingToken()
	taggedBody := injectTrackingToken(htmlBody, trackingToken)

	if err := SendMultiple(ctx, c, tos, subject, taggedBody); err != nil {
		return "", "", "", err
	}
	if !c.enabled() {
		return "", "", "", nil
	}

	id, convID, imid, lookupErr := findSentMessage(ctx, c, subject, sentAfter, trackingToken)
	if lookupErr != nil {
		log.Printf("mailer: sent, but could not look up message for tracking: %v", lookupErr)
		return "", "", "", nil
	}
	return id, convID, imid, nil
}

// newTrackingToken returns a short random hex string, unique enough per
// send that a body-text match against it is effectively unambiguous.
func newTrackingToken() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is effectively unheard of; fall back to a
		// timestamp so tracking degrades to "less unique" rather than panics.
		return fmt.Sprintf("fallback%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// injectTrackingToken hides the token in a zero-height span at the top of
// the body — invisible in any HTML-rendering mail client, but still present
// as plain text in Graph's bodyPreview (which is a naive text extraction
// that doesn't respect CSS visibility), which is exactly what makes it
// findable in the Sent Items lookup below.
func injectTrackingToken(htmlBody, trackingToken string) string {
	return fmt.Sprintf(`<span style="display:none">po-track:%s</span>%s`, trackingToken, htmlBody)
}

// findSentMessage looks in Sent Items for the message SendMultipleTracked
// just sent: matching on subject (server-side $filter), sentDateTime at or
// after sentAfter, and — the real disambiguator — the hidden tracking token
// appearing in bodyPreview. Retries a few times with a short delay in case
// Sent Items hasn't finished indexing the new message yet.
// internetMessageId (the RFC 5322 Message-ID header) is what actually lets
// replies be matched reliably later: any mail client that replies sets
// In-Reply-To/References to it, unlike Graph's own conversationId which
// doesn't reliably carry over across mail providers.
func findSentMessage(ctx context.Context, c Config, subject string, sentAfter time.Time, trackingToken string) (messageID, conversationID, internetMessageID string, err error) {
	const maxAttempts = 5
	const retryDelay = 1500 * time.Millisecond

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		id, convID, imid, found, lookupErr := findSentMessageOnce(ctx, c, subject, sentAfter, trackingToken)
		if lookupErr != nil {
			return "", "", "", lookupErr
		}
		if found {
			return id, convID, imid, nil
		}
		if attempt == maxAttempts {
			return "", "", "", fmt.Errorf("no message with subject %q and matching tracking token found in Sent Items after %d attempts", subject, maxAttempts)
		}
		select {
		case <-ctx.Done():
			return "", "", "", ctx.Err()
		case <-time.After(retryDelay):
		}
	}
	return "", "", "", fmt.Errorf("unreachable")
}

// findSentMessageOnce does a single Sent Items lookup. found is false if no
// candidate matches subject + sentAfter + trackingToken — not necessarily an
// error, just "not indexed yet".
func findSentMessageOnce(ctx context.Context, c Config, subject string, sentAfter time.Time, trackingToken string) (messageID, conversationID, internetMessageID string, found bool, err error) {
	accessToken, err := token(ctx, c)
	if err != nil {
		return "", "", "", false, fmt.Errorf("mailer: token: %w", err)
	}

	// No $orderby here — combining $filter and $orderby on non-indexed
	// properties triggers Graph's "InefficientFilter" error unless the
	// request opts into advanced query support. Fetch a generous page
	// unsorted and pick the best match client-side below instead.
	filter := fmt.Sprintf("subject eq '%s'", strings.ReplaceAll(subject, "'", "''"))
	q := url.Values{}
	q.Set("$filter", filter)
	q.Set("$top", "25")
	q.Set("$select", "id,conversationId,internetMessageId,sentDateTime,bodyPreview")

	reqURL := fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s/mailFolders/SentItems/messages?%s", c.Sender, q.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return "", "", "", false, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", "", false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		return "", "", "", false, fmt.Errorf("sent items lookup failed: %d %s (needs Mail.Read application permission)", resp.StatusCode, errBody.String())
	}

	var body struct {
		Value []struct {
			ID                string    `json:"id"`
			ConversationID    string    `json:"conversationId"`
			InternetMessageID string    `json:"internetMessageId"`
			SentDateTime      time.Time `json:"sentDateTime"`
			BodyPreview       string    `json:"bodyPreview"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", "", "", false, fmt.Errorf("decode sent items response: %w", err)
	}

	for _, m := range body.Value {
		if m.SentDateTime.Before(sentAfter) {
			continue
		}
		if !strings.Contains(m.BodyPreview, trackingToken) {
			continue
		}
		return m.ID, m.ConversationID, m.InternetMessageID, true, nil
	}
	return "", "", "", false, nil
}

// ConversationMessage is one message Graph returned for a conversation —
// either the original sent PO email or a reply to it.
type ConversationMessage struct {
	ID               string    `json:"id"`
	Subject          string    `json:"subject"`
	From             string    `json:"from"`
	ReceivedDateTime time.Time `json:"received_at"`
	BodyPreview      string    `json:"body_preview"`
	IsFromSender     bool      `json:"is_from_sender"`
}

// FetchRepliesByInReplyTo looks in Inbox for messages whose In-Reply-To or
// References header contains internetMessageID — the RFC 5322 Message-ID of
// the message this PO's email was sent as. This is a hard match on actual
// mail-protocol threading (virtually every client, Gmail included, sets
// these headers on reply), unlike matching on Graph's conversationId (which
// doesn't reliably carry over across mail providers) or subject/timing
// (ambiguous when a PO's been emailed more than once).
func FetchRepliesByInReplyTo(ctx context.Context, c Config, internetMessageID string) ([]ConversationMessage, error) {
	if !c.enabled() {
		return nil, fmt.Errorf("mailer: not configured")
	}
	if internetMessageID == "" {
		return nil, nil
	}

	accessToken, err := token(ctx, c)
	if err != nil {
		return nil, fmt.Errorf("mailer: token: %w", err)
	}

	// internetMessageHeaders isn't filterable server-side, so pull the most
	// recent Inbox messages with their headers and match client-side.
	q := url.Values{}
	q.Set("$top", "50")
	q.Set("$select", "id,subject,from,receivedDateTime,bodyPreview,internetMessageHeaders")

	reqURL := fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s/mailFolders/Inbox/messages?%s", c.Sender, q.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		return nil, fmt.Errorf("mailer: fetch inbox failed: %d %s", resp.StatusCode, errBody.String())
	}

	type internetMessageHeader struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}
	var body struct {
		Value []struct {
			ID      string `json:"id"`
			Subject string `json:"subject"`
			From    struct {
				EmailAddress struct {
					Address string `json:"address"`
				} `json:"emailAddress"`
			} `json:"from"`
			ReceivedDateTime       time.Time               `json:"receivedDateTime"`
			BodyPreview            string                  `json:"bodyPreview"`
			InternetMessageHeaders []internetMessageHeader `json:"internetMessageHeaders"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("mailer: decode inbox response: %w", err)
	}

	messages := make([]ConversationMessage, 0)
	for _, m := range body.Value {
		referenced := false
		for _, h := range m.InternetMessageHeaders {
			if !strings.EqualFold(h.Name, "In-Reply-To") && !strings.EqualFold(h.Name, "References") {
				continue
			}
			if strings.Contains(h.Value, internetMessageID) {
				referenced = true
				break
			}
		}
		if !referenced {
			continue
		}
		from := m.From.EmailAddress.Address
		messages = append(messages, ConversationMessage{
			ID:               m.ID,
			Subject:          m.Subject,
			From:             from,
			ReceivedDateTime: m.ReceivedDateTime,
			BodyPreview:      m.BodyPreview,
			IsFromSender:     strings.EqualFold(from, c.Sender),
		})
	}
	sort.Slice(messages, func(i, j int) bool {
		return messages[i].ReceivedDateTime.Before(messages[j].ReceivedDateTime)
	})
	return messages, nil
}

var replySubjectPrefix = regexp.MustCompile(`(?i)^(re|fw|fwd)\s*:\s*`)

func normalizeSubject(s string) string {
	for {
		trimmed := replySubjectPrefix.ReplaceAllString(s, "")
		if trimmed == s {
			return strings.TrimSpace(s)
		}
		s = trimmed
	}
}

// FetchRepliesBySubject looks in Inbox for messages received after sentAt
// whose subject matches originalSubject once "Re:"/"Fwd:" prefixes are
// stripped. This is used instead of matching on Graph's conversationId,
// which doesn't reliably carry over on a reply from an external mail
// provider (e.g. Gmail replying to a message sent from this Exchange
// mailbox) — subject + timing is a much more robust signal across
// providers than relying on Graph's own thread-linking.
// before is exclusive and optional (zero value = no upper bound) — pass the
// next-more-recent send's time when a PO has been emailed more than once,
// so a reply gets attributed to the send it was actually replying to
// instead of showing up under every earlier send too.
func FetchRepliesBySubject(ctx context.Context, c Config, originalSubject string, sentAt, before time.Time) ([]ConversationMessage, error) {
	if !c.enabled() {
		return nil, fmt.Errorf("mailer: not configured")
	}

	accessToken, err := token(ctx, c)
	if err != nil {
		return nil, fmt.Errorf("mailer: token: %w", err)
	}

	// No $filter/$orderby at all here — just page through the most recent
	// Inbox messages and match client-side, sidestepping Graph's
	// InefficientFilter restriction entirely.
	q := url.Values{}
	q.Set("$top", "50")
	q.Set("$select", "id,subject,from,receivedDateTime,bodyPreview")

	reqURL := fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s/mailFolders/Inbox/messages?%s", c.Sender, q.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		return nil, fmt.Errorf("mailer: fetch inbox failed: %d %s", resp.StatusCode, errBody.String())
	}

	var body struct {
		Value []struct {
			ID      string `json:"id"`
			Subject string `json:"subject"`
			From    struct {
				EmailAddress struct {
					Address string `json:"address"`
				} `json:"emailAddress"`
			} `json:"from"`
			ReceivedDateTime time.Time `json:"receivedDateTime"`
			BodyPreview      string    `json:"bodyPreview"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("mailer: decode inbox response: %w", err)
	}

	wantSubject := normalizeSubject(originalSubject)
	// A minute of slack absorbs clock skew between Graph timestamps and the
	// send-tracking lookup, without pulling in unrelated older mail.
	cutoff := sentAt.Add(-time.Minute)

	messages := make([]ConversationMessage, 0)
	for _, m := range body.Value {
		if m.ReceivedDateTime.Before(cutoff) {
			continue
		}
		if !before.IsZero() && !m.ReceivedDateTime.Before(before) {
			continue
		}
		if normalizeSubject(m.Subject) != wantSubject {
			continue
		}
		from := m.From.EmailAddress.Address
		messages = append(messages, ConversationMessage{
			ID:               m.ID,
			Subject:          m.Subject,
			From:             from,
			ReceivedDateTime: m.ReceivedDateTime,
			BodyPreview:      m.BodyPreview,
			IsFromSender:     strings.EqualFold(from, c.Sender),
		})
	}
	sort.Slice(messages, func(i, j int) bool {
		return messages[i].ReceivedDateTime.Before(messages[j].ReceivedDateTime)
	})
	return messages, nil
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
