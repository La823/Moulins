package utils

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type geocodeResponse struct {
	Status  string `json:"status"`
	Results []struct {
		Geometry struct {
			Location struct {
				Lat float64 `json:"lat"`
				Lng float64 `json:"lng"`
			} `json:"location"`
		} `json:"geometry"`
		FormattedAddress  string `json:"formatted_address"`
		AddressComponents []struct {
			LongName string   `json:"long_name"`
			Types    []string `json:"types"`
		} `json:"address_components"`
	} `json:"results"`
}

// GeocodeResult is the parsed, application-facing shape of a pincode lookup.
type GeocodeResult struct {
	Lat   float64
	Lng   float64
	City  string
	State string
}

func hasType(types []string, target string) bool {
	for _, t := range types {
		if t == target {
			return true
		}
	}
	return false
}

// GeocodePincode resolves an Indian pincode to coordinates + city/state using
// the Google Geocoding API. Returns ok=false if the pincode couldn't be
// resolved — callers should treat that as non-fatal (e.g. the partner is
// still created, just without a map marker / city / state).
func GeocodePincode(pincode string) (GeocodeResult, bool) {
	pincode = strings.Trim(strings.TrimSpace(pincode), ".,")
	apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	if apiKey == "" || pincode == "" {
		return GeocodeResult{}, false
	}
	// One retry: a single slow or failed call used to leave a partner with
	// no coordinates for good (three partners created on 18-20 Aug 2026
	// never appeared on the map although Google knows their pincodes).
	// ZERO_RESULTS is a real answer and isn't retried.
	result, ok, retry := geocodeOnce(apiKey, pincode)
	if !ok && retry {
		time.Sleep(time.Second)
		result, ok, _ = geocodeOnce(apiKey, pincode)
	}
	if !ok {
		log.Printf("geocode: could not locate pincode %q", pincode)
	}
	return result, ok
}

// geocodeOnce is one Geocoding API call; retry reports whether a failure
// was transient (network, timeout, Google-side error) rather than "no such
// place".
func geocodeOnce(apiKey, pincode string) (GeocodeResult, bool, bool) {

	client := http.Client{Timeout: 5 * time.Second}
	endpoint := fmt.Sprintf(
		"https://maps.googleapis.com/maps/api/geocode/json?address=%s&key=%s",
		url.QueryEscape(pincode+", India"),
		apiKey,
	)

	resp, err := client.Get(endpoint)
	if err != nil {
		return GeocodeResult{}, false, true
	}
	defer resp.Body.Close()

	var parsed geocodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return GeocodeResult{}, false, true
	}

	if parsed.Status != "OK" || len(parsed.Results) == 0 {
		return GeocodeResult{}, false, parsed.Status != "ZERO_RESULTS"
	}

	top := parsed.Results[0]
	result := GeocodeResult{
		Lat: top.Geometry.Location.Lat,
		Lng: top.Geometry.Location.Lng,
	}

	for _, c := range top.AddressComponents {
		if hasType(c.Types, "locality") && result.City == "" {
			result.City = c.LongName
		}
		if hasType(c.Types, "administrative_area_level_3") && result.City == "" {
			result.City = c.LongName
		}
		if hasType(c.Types, "administrative_area_level_1") {
			result.State = c.LongName
		}
	}

	return result, true, false
}

// ReverseGeocode turns a GPS point into a short, readable place name for
// people to read — "Sector 22, Chandigarh" rather than a full postal address
// or raw coordinates. Neighbourhood (sublocality) + city when Google has
// them, else the first two parts of its formatted address. ok=false when it
// can't be resolved; callers keep the coordinates either way.
func ReverseGeocode(lat, lng float64) (string, bool) {
	apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	if apiKey == "" {
		return "", false
	}

	client := http.Client{Timeout: 5 * time.Second}
	endpoint := fmt.Sprintf(
		"https://maps.googleapis.com/maps/api/geocode/json?latlng=%f,%f&key=%s",
		lat, lng, apiKey,
	)
	resp, err := client.Get(endpoint)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()

	var parsed geocodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", false
	}
	if parsed.Status != "OK" || len(parsed.Results) == 0 {
		return "", false
	}

	// Results run most specific first. The area is the best-ranked kind
	// found in any of them — a sector/locality name over a "neighbourhood",
	// which in India is often a shop label like "SCO:" — and junk labels
	// (punctuation, no real word) are skipped.
	areaKinds := []string{"sublocality_level_1", "sublocality", "neighborhood"}
	var area, city string
	bestRank := len(areaKinds)
	for _, res := range parsed.Results {
		for _, c := range res.AddressComponents {
			for rank, kind := range areaKinds {
				if rank < bestRank && hasType(c.Types, kind) && readablePlace(c.LongName) {
					area, bestRank = c.LongName, rank
				}
			}
			if city == "" && hasType(c.Types, "locality") {
				city = c.LongName
			}
		}
	}
	switch {
	case area != "" && city != "" && area != city:
		return area + ", " + city, true
	case city != "":
		return city, true
	case area != "":
		return area, true
	}

	// fall back to the start of the formatted address, minus a leading
	// plus code ("8Q7X+5V Chandigarh, ...")
	parts := strings.Split(parsed.Results[0].FormattedAddress, ", ")
	if len(parts) > 0 && strings.Contains(parts[0], "+") {
		parts = parts[1:]
	}
	if len(parts) > 2 {
		parts = parts[:2]
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, ", "), true
}

// readablePlace rejects labels that aren't a place name a person would
// recognise: too short, or carrying ':' / digits-only shop codes.
func readablePlace(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 3 || strings.ContainsAny(s, ":;") {
		return false
	}
	letters := 0
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			letters++
		}
	}
	return letters >= 3
}
