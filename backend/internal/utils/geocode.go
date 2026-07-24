package utils

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
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
	apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	if apiKey == "" || pincode == "" {
		return GeocodeResult{}, false
	}

	client := http.Client{Timeout: 5 * time.Second}
	endpoint := fmt.Sprintf(
		"https://maps.googleapis.com/maps/api/geocode/json?address=%s&key=%s",
		url.QueryEscape(pincode+", India"),
		apiKey,
	)

	resp, err := client.Get(endpoint)
	if err != nil {
		return GeocodeResult{}, false
	}
	defer resp.Body.Close()

	var parsed geocodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return GeocodeResult{}, false
	}

	if parsed.Status != "OK" || len(parsed.Results) == 0 {
		return GeocodeResult{}, false
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

	return result, true
}
