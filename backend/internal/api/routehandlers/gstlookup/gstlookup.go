// Package gstlookup proxies the internal gst-scraper microservice (a
// separate Python/Flask container, see backend/gst-scraper) so the
// frontend never talks to it directly — it isn't exposed outside the
// docker network, only reachable at http://gst-scraper:5001 from other
// containers.
package gstlookup

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

func scraperBaseURL() string {
	if u := os.Getenv("GST_SCRAPER_URL"); u != "" {
		return u
	}
	return "http://gst-scraper:5001"
}

var httpClient = &http.Client{Timeout: 20 * time.Second}

// GET /gst-lookup/captcha — fetches a fresh captcha image + session id from
// the scraper so the user can read and type it in.
func GetCaptchaHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := httpClient.Get(scraperBaseURL() + "/api/v1/getCaptcha")
	if err != nil {
		log.Printf("gst-scraper captcha error: %v", err)
		http.Error(w, "GST lookup service is unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "GST lookup service is unavailable", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

type getDetailsRequest struct {
	SessionID string `json:"session_id"`
	GSTIN     string `json:"gstin"`
	Captcha   string `json:"captcha"`
}

// POST /gst-lookup/details — the partner has read the captcha and typed it
// in; submit it alongside the GSTIN to fetch the registered business
// details for them to review before continuing.
func GetDetailsHandler(w http.ResponseWriter, r *http.Request) {
	var req getDetailsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.SessionID == "" || req.GSTIN == "" || req.Captcha == "" {
		http.Error(w, "session_id, gstin and captcha are required", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(map[string]string{
		"sessionId": req.SessionID,
		"GSTIN":     req.GSTIN,
		"captcha":   req.Captcha,
	})

	resp, err := httpClient.Post(scraperBaseURL()+"/api/v1/getGSTDetails", "application/json", bytes.NewReader(payload))
	if err != nil {
		log.Printf("gst-scraper details error: %v", err)
		http.Error(w, "GST lookup service is unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "GST lookup service is unavailable", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}
