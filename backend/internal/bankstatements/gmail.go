package bankstatements

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Gmail access uses the OAuth Desktop client "MoulinsEmailReader" (Google
// Cloud project moulinsemail-514509, owned by arora.pardeep1973) with the
// read-only scope. The client id/secret come from the environment; the
// refresh token from one sign-in is kept in stored_credentials. A refresh
// token stops working if that Google account's password is changed or the
// app's access is removed — the sign-in then has to be done again.

var httpClient = &http.Client{Timeout: 90 * time.Second}

// ErrGmailSignedOut means Google refused the refresh token.
var ErrGmailSignedOut = errors.New("Gmail sign-in has expired or was removed; sign in again")

type gmail struct {
	token string
}

func newGmail(ctx context.Context, refreshToken string) (*gmail, error) {
	id, secret := strings.TrimSpace(os.Getenv("GMAIL_READER_CLIENT_ID")), strings.TrimSpace(os.Getenv("GMAIL_READER_CLIENT_SECRET"))
	if id == "" || secret == "" {
		return nil, errors.New("GMAIL_READER_CLIENT_ID / GMAIL_READER_CLIENT_SECRET are not set")
	}
	form := url.Values{"client_id": {id}, "client_secret": {secret}, "refresh_token": {refreshToken}, "grant_type": {"refresh_token"}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("google token answer: %w", err)
	}
	if out.Error == "invalid_grant" {
		return nil, ErrGmailSignedOut
	}
	if out.AccessToken == "" {
		return nil, fmt.Errorf("google token refused: %s", out.Error)
	}
	return &gmail{token: out.AccessToken}, nil
}

func (g *gmail) get(ctx context.Context, path string, q url.Values, into any) error {
	u := "https://gmail.googleapis.com/gmail/v1/users/me/" + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("Authorization", "Bearer "+g.token)
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 500))
		return fmt.Errorf("gmail %s: %d %s", path, res.StatusCode, b)
	}
	return json.NewDecoder(res.Body).Decode(into)
}

// search returns the ids of messages matching a Gmail search, newest first.
func (g *gmail) search(ctx context.Context, query string, max int) ([]string, error) {
	var ids []string
	page := ""
	for len(ids) < max {
		q := url.Values{"q": {query}, "maxResults": {"100"}}
		if page != "" {
			q.Set("pageToken", page)
		}
		var r struct {
			Messages []struct {
				ID string `json:"id"`
			} `json:"messages"`
			NextPageToken string `json:"nextPageToken"`
		}
		if err := g.get(ctx, "messages", q, &r); err != nil {
			return nil, err
		}
		for _, m := range r.Messages {
			ids = append(ids, m.ID)
		}
		if r.NextPageToken == "" {
			break
		}
		page = r.NextPageToken
	}
	return ids, nil
}

type mailPart struct {
	MimeType string `json:"mimeType"`
	Headers  []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"headers"`
	Body struct {
		Data string `json:"data"`
	} `json:"body"`
	Parts []mailPart `json:"parts"`
}

// email is the part of a message the job needs.
type email struct {
	ID         string
	From       string
	Subject    string
	ReceivedAt time.Time
	HTML       string
}

func (g *gmail) message(ctx context.Context, id string) (*email, error) {
	var m struct {
		InternalDate string   `json:"internalDate"`
		Payload      mailPart `json:"payload"`
	}
	if err := g.get(ctx, "messages/"+id, url.Values{"format": {"full"}}, &m); err != nil {
		return nil, err
	}
	e := &email{ID: id}
	for _, h := range m.Payload.Headers {
		switch strings.ToLower(h.Name) {
		case "from":
			e.From = h.Value
		case "subject":
			e.Subject = h.Value
		}
	}
	if ms, err := strconv.ParseInt(m.InternalDate, 10, 64); err == nil {
		e.ReceivedAt = time.UnixMilli(ms)
	}
	var walk func(p mailPart)
	walk = func(p mailPart) {
		if p.MimeType == "text/html" && p.Body.Data != "" && e.HTML == "" {
			if b, err := base64.URLEncoding.DecodeString(p.Body.Data); err == nil {
				e.HTML = string(b)
			} else if b, err := base64.RawURLEncoding.DecodeString(p.Body.Data); err == nil {
				e.HTML = string(b)
			}
		}
		for _, c := range p.Parts {
			walk(c)
		}
	}
	walk(m.Payload)
	return e, nil
}

var statementLinkRe = regexp.MustCompile(`href="(https://smartstatements\.hdfc\.bank\.in/[^"]*GetStatement\.jsp\?[^"]+)"`)

// statementLink is the "View your SmartStatement" link in an HDFC email —
// the whole URL: the bank answers 404 to the jobkey alone.
func statementLink(emailHTML string) string {
	m := statementLinkRe.FindStringSubmatch(emailHTML)
	if m == nil {
		return ""
	}
	return html.UnescapeString(m[1])
}
