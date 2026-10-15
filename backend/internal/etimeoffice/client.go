// Package etimeoffice pulls fingerprint-scanner punches from eTimeOffice
// (api.etimeoffice.com) into local tables and derives the attendance
// dashboard from them.
//
// eTimeOffice publishes no public API reference. The request shape follows
// the pyetimeoffice client (github.com/KSreethul/pyetimeoffice): HTTP Basic
// auth whose *username* is "CorporateID:UserName:Password:true" with an empty
// password, and GET DownloadPunchData?Empcode=ALL&FromDate=dd/MM/yyyy_HH:mm
// &ToDate=dd/MM/yyyy_HH:mm, answering {"Error":false,"Msg":"...",
// "PunchData":[{"Empcode","Name","PunchDate":"dd/MM/yyyy HH:mm:ss",...}]}.
// Keys are matched case-insensitively since their exact casing is not
// documented.
package etimeoffice

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const baseURL = "https://api.etimeoffice.com/api"

// istZone is the scanners' clock; eTimeOffice reports punch times in it.
var istZone = time.FixedZone("IST", 5*3600+1800)

// Credentials are the eTimeOffice web login with API access enabled.
type Credentials struct {
	CorporateID string
	UserName    string
	Password    string
}

// CredentialsFromEnv reads ETIMEOFFICE_CORPORATE_ID / ETIMEOFFICE_USERNAME /
// ETIMEOFFICE_PASSWORD. An error (not a fatal) so a missing integration
// only disables this module.
func CredentialsFromEnv() (Credentials, error) {
	c := Credentials{
		CorporateID: strings.TrimSpace(os.Getenv("ETIMEOFFICE_CORPORATE_ID")),
		UserName:    strings.TrimSpace(os.Getenv("ETIMEOFFICE_USERNAME")),
		Password:    os.Getenv("ETIMEOFFICE_PASSWORD"),
	}
	if c.CorporateID == "" || c.UserName == "" || c.Password == "" {
		return Credentials{}, fmt.Errorf("ETIMEOFFICE_CORPORATE_ID, ETIMEOFFICE_USERNAME and ETIMEOFFICE_PASSWORD must all be set")
	}
	return c, nil
}

// Punch is one scan as eTimeOffice reports it.
type Punch struct {
	EmpCode string
	Name    string
	Time    time.Time // IST wall-clock
	MFlag   string
	MCID    string
}

var httpClient = &http.Client{Timeout: 60 * time.Second}

// apiDateTime is eTimeOffice's query format, e.g. 25/03/2025_09:00.
const apiDateTime = "02/01/2006_15:04"

// FetchPunches downloads every employee's punches between from and to
// (inclusive, IST wall-clock, minute precision).
func FetchPunches(ctx context.Context, creds Credentials, from, to time.Time) ([]Punch, error) {
	q := url.Values{}
	q.Set("Empcode", "ALL")
	q.Set("FromDate", from.Format(apiDateTime))
	q.Set("ToDate", to.Format(apiDateTime))
	// url.Values escapes "/" and ":" — eTimeOffice is not documented to
	// decode them, so send the dates literally as its own clients do.
	rawQuery := strings.NewReplacer("%2F", "/", "%3A", ":").Replace(q.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/DownloadPunchData?"+rawQuery, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(creds.CorporateID+":"+creds.UserName+":"+creds.Password+":true", "")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("eTimeOffice request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("reading eTimeOffice response: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("eTimeOffice rejected the login (HTTP %d) — check the corporate ID, username and password, and that API access is enabled on the account", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("eTimeOffice returned HTTP %d: %s", resp.StatusCode, snippet(body))
	}
	return parsePunchResponse(body)
}

func parsePunchResponse(body []byte) ([]Punch, error) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("eTimeOffice sent something that is not JSON: %s", snippet(body))
	}
	if raw, ok := lookup(envelope, "Error"); ok {
		var isErr bool
		if json.Unmarshal(raw, &isErr) == nil && isErr {
			msg := ""
			if m, ok := lookup(envelope, "Msg"); ok {
				_ = json.Unmarshal(m, &msg)
			}
			// An empty window is reported by some accounts as an error
			// rather than an empty list.
			if strings.Contains(strings.ToLower(msg), "no record") || strings.Contains(strings.ToLower(msg), "not found") {
				return nil, nil
			}
			return nil, fmt.Errorf("eTimeOffice error: %s", msg)
		}
	}

	raw, ok := lookup(envelope, "PunchData")
	if !ok || string(raw) == "null" {
		return nil, nil
	}
	var rows []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, fmt.Errorf("unexpected PunchData shape: %w", err)
	}

	punches := make([]Punch, 0, len(rows))
	for _, row := range rows {
		code := field(row, "Empcode")
		when := field(row, "PunchDate")
		if code == "" || when == "" {
			continue
		}
		t, err := parsePunchTime(when)
		if err != nil {
			return nil, fmt.Errorf("employee %s: %w", code, err)
		}
		punches = append(punches, Punch{
			EmpCode: code,
			Name:    field(row, "Name"),
			Time:    t,
			MFlag:   field(row, "M_Flag"),
			MCID:    field(row, "mcid"),
		})
	}
	return punches, nil
}

var punchLayouts = []string{
	"02/01/2006 15:04:05",
	"02/01/2006 15:04",
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05",
}

func parsePunchTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	for _, layout := range punchLayouts {
		if t, err := time.ParseInLocation(layout, s, istZone); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised punch time %q", s)
}

func lookup(m map[string]json.RawMessage, key string) (json.RawMessage, bool) {
	if v, ok := m[key]; ok {
		return v, true
	}
	for k, v := range m {
		if strings.EqualFold(k, key) {
			return v, true
		}
	}
	return nil, false
}

// field reads a key as text whether eTimeOffice sent a string or a number.
func field(m map[string]json.RawMessage, key string) string {
	raw, ok := lookup(m, key)
	if !ok {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return strings.TrimSpace(s)
	}
	var n json.Number
	if json.Unmarshal(raw, &n) == nil {
		return n.String()
	}
	return ""
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 300 {
		s = s[:300] + "…"
	}
	return s
}
