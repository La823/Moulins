package team

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// One doctor or retailer of the partner, and whether it is hidden from the
// team member — for the partner's "what this member sees" list.
type visibilityItem struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Detail string    `json:"detail,omitempty"` // clinic / shop and city
	Hidden bool      `json:"hidden"`
}

type settingsResponse struct {
	models.TeamSettings
	Doctors   []visibilityItem `json:"doctors"`
	Retailers []visibilityItem `json:"retailers"`
}

// GET /team/{id}/settings — what the partner allows this team member, with
// every doctor and retailer of the partner marked hidden or not.
func GetSettingsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		member, ok := requireOwnedMember(w, r, db)
		if !ok {
			return
		}
		partner := getUserID(r)
		ctx := r.Context()
		s, err := models.GetTeamSettings(ctx, db, member)
		if err != nil {
			log.Printf("team settings %s: %v", member, err)
			http.Error(w, "could not load the settings", http.StatusInternalServerError)
			return
		}
		out := settingsResponse{TeamSettings: s, Doctors: []visibilityItem{}, Retailers: []visibilityItem{}}

		hiddenDocs, err := models.HiddenFromMember(ctx, db, member, "doctor")
		if err == nil {
			var docs []models.DoctorListItem
			docs, err = models.GetDoctorsByPartner(ctx, db, partner)
			for _, d := range docs {
				out.Doctors = append(out.Doctors, visibilityItem{ID: d.ID, Name: d.Name, Detail: doctorDetail(d), Hidden: hiddenDocs[d.ID]})
			}
		}
		if err == nil {
			var hiddenRet map[uuid.UUID]bool
			hiddenRet, err = models.HiddenFromMember(ctx, db, member, "retailer")
			if err == nil {
				var rets []models.Retailer
				rets, err = models.ListRetailers(ctx, db, partner)
				for _, rt := range rets {
					detail := ""
					if rt.ShopName != nil {
						detail = *rt.ShopName
					}
					if rt.City != nil && *rt.City != "" {
						if detail != "" {
							detail += ", "
						}
						detail += *rt.City
					}
					out.Retailers = append(out.Retailers, visibilityItem{ID: rt.ID, Name: rt.Name, Detail: detail, Hidden: hiddenRet[rt.ID]})
				}
			}
		}
		if err != nil {
			log.Printf("team settings %s lists: %v", member, err)
			http.Error(w, "could not load the settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func doctorDetail(d models.DoctorListItem) string {
	if d.ClinicName != nil && *d.ClinicName != "" {
		return *d.ClinicName
	}
	if d.Speciality != nil {
		return *d.Speciality
	}
	return ""
}

// PUT /team/{id}/settings — saves the switches and the full lists of hidden
// doctors and retailers (anything not listed is shown).
func SaveSettingsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		member, ok := requireOwnedMember(w, r, db)
		if !ok {
			return
		}
		var body struct {
			models.TeamSettings
			HiddenDoctorIDs   []uuid.UUID `json:"hidden_doctor_ids"`
			HiddenRetailerIDs []uuid.UUID `json:"hidden_retailer_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, msgTeamBadRequest, http.StatusBadRequest)
			return
		}
		if !body.OrderToPartner && !body.OrderToMoulins {
			http.Error(w, "Please let this team member send orders somewhere: to you, to Moulins, or both.", http.StatusBadRequest)
			return
		}
		if err := models.SaveTeamSettings(r.Context(), db, getUserID(r), member, body.TeamSettings, body.HiddenDoctorIDs, body.HiddenRetailerIDs); err != nil {
			log.Printf("save team settings %s: %v", member, err)
			http.Error(w, "The settings could not be saved. Please try again.", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Settings saved."})
	}
}
