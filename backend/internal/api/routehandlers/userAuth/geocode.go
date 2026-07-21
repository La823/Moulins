package userauth

import (
	"encoding/json"
	"net/http"

	"github.com/lavanyaarora/server/internal/utils"
)

type geocodePincodeResponse struct {
	Found bool    `json:"found"`
	City  string  `json:"city,omitempty"`
	State string  `json:"state,omitempty"`
	Lat   float64 `json:"lat,omitempty"`
	Lng   float64 `json:"lng,omitempty"`
}

// GET /admin/geocode/pincode?pincode=110001
// Used by the "Add Customer" form to live-autofill city/state as the
// admin types a pincode. Kept server-side so the Geocoding API key never
// reaches the browser.
func GeocodePincodeHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pincode := r.URL.Query().Get("pincode")
		w.Header().Set("Content-Type", "application/json")

		if pincode == "" {
			json.NewEncoder(w).Encode(geocodePincodeResponse{Found: false})
			return
		}

		result, ok := utils.GeocodePincode(pincode)
		if !ok {
			json.NewEncoder(w).Encode(geocodePincodeResponse{Found: false})
			return
		}

		json.NewEncoder(w).Encode(geocodePincodeResponse{
			Found: true,
			City:  result.City,
			State: result.State,
			Lat:   result.Lat,
			Lng:   result.Lng,
		})
	}
}
