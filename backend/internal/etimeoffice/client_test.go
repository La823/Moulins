package etimeoffice

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Responses copied from the live API for our account (15 Oct 2026).
const punchJSON = `{"Error":false,"Msg":"Success","IsAdmin":true,"PunchData":[
 {"Name":"Jishan Rao","Empcode":"0003","PunchDate":"14/10/2026 18:37:00","M_Flag":null},
 {"Name":"Jishan Rao","Empcode":"0003","PunchDate":"14/10/2026 10:27:00","M_Flag":"M"}]}`

const inOutJSON = `{"InOutPunchData":[
 {"Empcode":"0003","INTime":"10:27","OUTTime":"18:37","WorkTime":"08:10","OverTime":"00:00","BreakTime":"00:00","Status":"P","DateString":"14/10/2026","Remark":"LT","Erl_Out":"00:00","Late_In":"00:27","Name":"Jishan Rao"},
 {"Empcode":"0001","INTime":"--:--","OUTTime":"--:--","WorkTime":"00:00","OverTime":"00:00","BreakTime":"00:00","Status":"A","DateString":"14/10/2026","Remark":"--","Erl_Out":"00:00","Late_In":"00:00","Name":"Tanmay"}],
 "Error":false,"Msg":"Success","IsAdmin":true}`

func stub(t *testing.T, body string, check func(*http.Request)) Credentials {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if check != nil {
			check(r)
		}
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	old := baseURL
	baseURL = srv.URL
	t.Cleanup(func() { baseURL = old })
	return Credentials{CorporateID: "CORP", UserName: "user", Password: "p@ss"}
}

func TestFetchPunches(t *testing.T) {
	creds := stub(t, punchJSON, func(r *http.Request) {
		if r.URL.Path != "/DownloadPunchData" {
			t.Errorf("path = %s", r.URL.Path)
		}
		if got := r.URL.RawQuery; got != "Empcode=ALL&FromDate=14/10/2026_00:00&ToDate=14/10/2026_23:59" {
			t.Errorf("query = %s", got)
		}
		want := "Basic " + base64.StdEncoding.EncodeToString([]byte("CORP:user:p@ss:true:"))
		if got := r.Header.Get("Authorization"); got != want {
			t.Errorf("auth = %s, want %s", got, want)
		}
	})
	from := time.Date(2026, 10, 14, 0, 0, 0, 0, istZone)
	got, err := FetchPunches(context.Background(), creds, from, from.Add(23*time.Hour+59*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d punches, want 2", len(got))
	}
	want := time.Date(2026, 10, 14, 18, 37, 0, 0, istZone)
	if got[0].EmpCode != "0003" || got[0].Name != "Jishan Rao" || !got[0].Time.Equal(want) || got[0].Manual {
		t.Errorf("first punch = %+v", got[0])
	}
	if !got[1].Manual {
		t.Errorf(`M_Flag "M" should be a manual punch`)
	}
}

func TestFetchDays(t *testing.T) {
	creds := stub(t, inOutJSON, nil)
	day := time.Date(2026, 10, 14, 0, 0, 0, 0, istZone)
	got, err := FetchDays(context.Background(), creds, day, day)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d days, want 2", len(got))
	}
	j := got[0]
	if j.Status != "P" || j.InTime != "10:27" || j.OutTime != "18:37" || j.WorkMinutes != 490 || j.LateMinutes != 27 || j.Remark != "LT" || !j.Date.Equal(day) {
		t.Errorf("present day = %+v", j)
	}
	a := got[1]
	if a.Status != "A" || a.InTime != "" || a.OutTime != "" || a.Remark != "" {
		t.Errorf(`absent day should turn "--:--" and "--" into empty: %+v`, a)
	}
}

func TestAPIErrorIsReported(t *testing.T) {
	creds := stub(t, `{"Error":true,"Msg":"Invalid Corporate ID"}`, nil)
	_, err := FetchDays(context.Background(), creds, time.Now(), time.Now())
	if err == nil || !strings.Contains(err.Error(), "Invalid Corporate ID") {
		t.Fatalf("err = %v, want eTimeOffice's message", err)
	}
}

func TestStateOf(t *testing.T) {
	s := func(v string) *string { return &v }
	cases := []struct {
		name          string
		status, in, o *string
		today         bool
		want          string
	}{
		{"not synced", nil, nil, nil, false, "not_synced"},
		{"present", s("P"), s("10:27"), s("18:37"), false, "present"},
		{"half day", s("P/2"), s("10:00"), s("14:00"), false, "half_day"},
		{"absent", s("A"), nil, nil, false, "absent"},
		// eTimeOffice marks today "A" until the out punch arrives.
		{"at work today", s("A"), s("10:09"), nil, true, "in"},
		{"one scan on a past day", s("A"), s("18:14"), nil, false, "missed_punch"},
		{"weekly off", s("WO"), nil, nil, false, "weekly_off"},
		{"worked on weekly off", s("WO"), s("10:00"), s("14:00"), false, "present"},
		{"holiday", s("HL"), nil, nil, false, "holiday"},
		{"unknown code", s("CL"), nil, nil, false, "other"},
	}
	for _, c := range cases {
		if got := stateOf(c.status, c.in, c.o, c.today); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestMinutes(t *testing.T) {
	for in, want := range map[string]int{"08:10": 490, "00:00": 0, "--:--": 0, "": 0, "12:5x": 0, "25:30": 1530} {
		if got := minutes(in); got != want {
			t.Errorf("minutes(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestDefaultFrom(t *testing.T) {
	d := func(y int, m time.Month, day int) time.Time { return time.Date(y, m, day, 0, 0, 0, 0, istZone) }
	cases := []struct {
		today   time.Time
		hasData bool
		want    time.Time
	}{
		// Re-pull from the 1st of last month, so eTimeOffice's after-the-fact
		// corrections (a weekly off fixed on 15 Oct rewriting 4 Oct) arrive.
		{d(2026, 10, 15), true, d(2026, 9, 1)},
		{d(2026, 1, 3), true, d(2025, 12, 1)},
		{d(2026, 3, 31), true, d(2026, 2, 1)},
		// First sync backfills the whole allowed window.
		{d(2026, 10, 15), false, d(2026, 7, 16)},
	}
	for _, c := range cases {
		got := defaultFrom(c.today, c.hasData)
		if !got.Equal(c.want) {
			t.Errorf("defaultFrom(%s, %v) = %s, want %s", c.today.Format(isoDate), c.hasData, got.Format(isoDate), c.want.Format(isoDate))
		}
		// Whatever it picks must be a window Sync accepts.
		if c.today.Sub(got) >= MaxSyncDays*24*time.Hour {
			t.Errorf("defaultFrom(%s) = %s exceeds MaxSyncDays", c.today.Format(isoDate), got.Format(isoDate))
		}
	}
}
