// Package etimeoffice pulls fingerprint-scanner attendance from eTimeOffice
// (api.etimeoffice.com) into local tables for the admin dashboard.
//
// eTimeOffice publishes no API reference; this follows what the live API
// returned for our account on 15 Oct 2026. Auth is HTTP Basic whose
// *username* is "CorporateID:UserName:Password:true" with an empty password.
// Every response carries {"Error":bool,"Msg":string,...}.
//
//	GET DownloadPunchData?Empcode=ALL&FromDate=dd/MM/yyyy_HH:mm&ToDate=...
//	  PunchData: [{Empcode,Name,PunchDate:"dd/MM/yyyy HH:mm:ss",M_Flag:null|"M"}]
//	GET DownloadInOutPunchData?Empcode=ALL&FromDate=dd/MM/yyyy&ToDate=...
//	  InOutPunchData: [{Empcode,Name,DateString,INTime:"HH:MM"|"--:--",OUTTime,
//	    WorkTime,OverTime,BreakTime,Late_In,Erl_Out ("HH:MM" durations),
//	    Status:"P"|"A"|"P/2"|"WO"|"HL",Remark:"LT-EO"|"--"}]
//
// InOutPunchData lists every employee for every day, punched or not, so it
// doubles as the employee list.
package etimeoffice

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// A var so tests can point it at a stub server.
var baseURL = "https://api.etimeoffice.com/api"

// istZone is the scanner's clock; eTimeOffice reports times in it.
var istZone = time.FixedZone("IST", 5*3600+1800)

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

// Punch is one scan.
type Punch struct {
	EmpCode string
	Name    string
	Time    time.Time // IST
	Manual  bool
}

// DayRecord is eTimeOffice's summary of one employee's day.
type DayRecord struct {
	EmpCode         string
	Name            string
	Date            time.Time // IST midnight
	Status          string
	InTime          string // "HH:MM" or ""
	OutTime         string
	WorkMinutes     int
	OvertimeMinutes int
	BreakMinutes    int
	LateMinutes     int
	EarlyOutMinutes int
	Remark          string // "" when eTimeOffice sent "--"
}

var httpClient = &http.Client{Timeout: 90 * time.Second}

// FetchPunches downloads every employee's scans between from and to
// (inclusive, minute precision).
func FetchPunches(ctx context.Context, creds Credentials, from, to time.Time) ([]Punch, error) {
	var resp struct {
		PunchData []struct {
			Empcode   string  `json:"Empcode"`
			Name      string  `json:"Name"`
			PunchDate string  `json:"PunchDate"`
			MFlag     *string `json:"M_Flag"`
		} `json:"PunchData"`
	}
	const layout = "02/01/2006_15:04"
	err := get(ctx, creds, "DownloadPunchData?Empcode=ALL&FromDate="+from.Format(layout)+"&ToDate="+to.Format(layout), &resp)
	if err != nil {
		return nil, err
	}
	out := make([]Punch, 0, len(resp.PunchData))
	for _, p := range resp.PunchData {
		t, err := time.ParseInLocation("02/01/2006 15:04:05", strings.TrimSpace(p.PunchDate), istZone)
		if err != nil {
			return nil, fmt.Errorf("employee %s: unrecognised punch time %q", p.Empcode, p.PunchDate)
		}
		out = append(out, Punch{
			EmpCode: strings.TrimSpace(p.Empcode),
			Name:    strings.TrimSpace(p.Name),
			Time:    t,
			Manual:  p.MFlag != nil && strings.EqualFold(strings.TrimSpace(*p.MFlag), "M"),
		})
	}
	return out, nil
}

// FetchDays downloads the daily summary for every employee, from..to inclusive.
func FetchDays(ctx context.Context, creds Credentials, from, to time.Time) ([]DayRecord, error) {
	var resp struct {
		InOutPunchData []struct {
			Empcode    string `json:"Empcode"`
			Name       string `json:"Name"`
			DateString string `json:"DateString"`
			INTime     string `json:"INTime"`
			OUTTime    string `json:"OUTTime"`
			WorkTime   string `json:"WorkTime"`
			OverTime   string `json:"OverTime"`
			BreakTime  string `json:"BreakTime"`
			LateIn     string `json:"Late_In"`
			ErlOut     string `json:"Erl_Out"`
			Status     string `json:"Status"`
			Remark     string `json:"Remark"`
		} `json:"InOutPunchData"`
	}
	const layout = "02/01/2006"
	err := get(ctx, creds, "DownloadInOutPunchData?Empcode=ALL&FromDate="+from.Format(layout)+"&ToDate="+to.Format(layout), &resp)
	if err != nil {
		return nil, err
	}
	out := make([]DayRecord, 0, len(resp.InOutPunchData))
	for _, d := range resp.InOutPunchData {
		date, err := time.ParseInLocation(layout, strings.TrimSpace(d.DateString), istZone)
		if err != nil {
			return nil, fmt.Errorf("employee %s: unrecognised date %q", d.Empcode, d.DateString)
		}
		out = append(out, DayRecord{
			EmpCode:         strings.TrimSpace(d.Empcode),
			Name:            strings.TrimSpace(d.Name),
			Date:            date,
			Status:          strings.TrimSpace(d.Status),
			InTime:          clockOrEmpty(d.INTime),
			OutTime:         clockOrEmpty(d.OUTTime),
			WorkMinutes:     minutes(d.WorkTime),
			OvertimeMinutes: minutes(d.OverTime),
			BreakMinutes:    minutes(d.BreakTime),
			LateMinutes:     minutes(d.LateIn),
			EarlyOutMinutes: minutes(d.ErlOut),
			Remark:          strings.Trim(strings.TrimSpace(d.Remark), "-"),
		})
	}
	return out, nil
}

func get(ctx context.Context, creds Credentials, pathAndQuery string, into any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/"+pathAndQuery, nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth(creds.CorporateID+":"+creds.UserName+":"+creds.Password+":true", "")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach eTimeOffice: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return fmt.Errorf("reading eTimeOffice response: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("eTimeOffice rejected the login (HTTP %d) — check the corporate ID, username and password", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("eTimeOffice returned HTTP %d: %s", resp.StatusCode, snippet(body))
	}

	var envelope struct {
		Error bool   `json:"Error"`
		Msg   string `json:"Msg"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return fmt.Errorf("eTimeOffice sent something that is not JSON: %s", snippet(body))
	}
	if envelope.Error {
		return fmt.Errorf("eTimeOffice error: %s", envelope.Msg)
	}
	if err := json.Unmarshal(body, into); err != nil {
		return fmt.Errorf("unexpected eTimeOffice response shape: %w", err)
	}
	return nil
}

// clockOrEmpty keeps a valid "HH:MM" and turns eTimeOffice's "--:--" into "".
func clockOrEmpty(s string) string {
	s = strings.TrimSpace(s)
	if _, err := time.Parse("15:04", s); err != nil {
		return ""
	}
	return s
}

// minutes turns an "HH:MM" duration into minutes; anything else is 0.
func minutes(s string) int {
	h, m, ok := strings.Cut(strings.TrimSpace(s), ":")
	if !ok {
		return 0
	}
	hh, err1 := strconv.Atoi(h)
	mm, err2 := strconv.Atoi(m)
	if err1 != nil || err2 != nil {
		return 0
	}
	return hh*60 + mm
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 300 {
		s = s[:300] + "…"
	}
	return s
}
