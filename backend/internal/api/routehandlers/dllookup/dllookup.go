// Package dllookup proxies the internal dl-scraper microservice (a separate
// Python/Flask container, see backend/dl-scraper) so the frontend never
// talks to it directly — it isn't exposed outside the docker network, only
// reachable at http://dl-scraper:5002 from other containers.
package dllookup

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"
)

func scraperBaseURL() string {
	if u := os.Getenv("DL_SCRAPER_URL"); u != "" {
		return u
	}
	return "http://dl-scraper:5002"
}

var httpClient = &http.Client{Timeout: 20 * time.Second}

// GET /dl-lookup/details?license_no=... — unlike the GST lookup this is a
// single-shot call, no captcha/session step: the government portal's
// license-verification endpoint doesn't require one.
func GetDetailsHandler(w http.ResponseWriter, r *http.Request) {
	licenseNo := r.URL.Query().Get("license_no")
	if licenseNo == "" {
		http.Error(w, "license_no is required", http.StatusBadRequest)
		return
	}

	target := scraperBaseURL() + "/api/v1/getDLDetails?licenseNo=" + url.QueryEscape(licenseNo)
	resp, err := httpClient.Get(target)
	if err != nil {
		log.Printf("dl-scraper lookup error: %v", err)
		http.Error(w, "Drug license lookup service is unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Drug license lookup service is unavailable", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}
