package presentations

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// getUserID resolves the requesting user's effective partner id — a team
// member's presentations are shared with their owning partner's team,
// same convention as doctors/meetings.
func getUserID(r *http.Request, db *pgxpool.Pool) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	owner, err := models.ResolveOwnerID(r.Context(), db, id)
	if err != nil {
		return id
	}
	return owner
}

type createRequest struct {
	Name     string     `json:"name"`
	DoctorID *uuid.UUID `json:"doctor_id"`
}

// validateDoctorLink confirms a doctor to link a deck to actually belongs
// to the requesting partner — nil is always fine (a deck doesn't have to
// be tied to a doctor).
func validateDoctorLink(r *http.Request, db *pgxpool.Pool, doctorID *uuid.UUID, partnerID uuid.UUID) error {
	if doctorID == nil {
		return nil
	}
	doctor, err := models.GetDoctorByID(r.Context(), db, *doctorID)
	if err != nil {
		return fmt.Errorf("doctor not found")
	}
	if doctor.PartnerID != partnerID {
		return fmt.Errorf("that doctor doesn't belong to you")
	}
	return nil
}

// GET /presentations
func ListPresentationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := models.ListPresentationsByPartner(r.Context(), db, getUserID(r, db))
		if err != nil {
			log.Printf("list presentations error: %v", err)
			http.Error(w, "could not fetch presentations", http.StatusInternalServerError)
			return
		}
		for i := range list {
			urls := make([]string, len(list[i].PreviewKeys))
			for j, key := range list[i].PreviewKeys {
				urls[j] = utils.GetPublicURL(key)
			}
			list[i].PreviewURLs = urls
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// POST /presentations
func CreatePresentationHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		partnerID := getUserID(r, db)
		if err := validateDoctorLink(r, db, req.DoctorID, partnerID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		id, err := models.CreatePresentation(r.Context(), db, partnerID, req.Name, req.DoctorID)
		if err != nil {
			log.Printf("create presentation error: %v", err)
			http.Error(w, "could not create presentation", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

type presentationWithSlides struct {
	models.Presentation
	Slides []models.PresentationSlide `json:"slides"`
}

// GET /presentations/{id}
func GetPresentationHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid presentation id", http.StatusBadRequest)
			return
		}

		p, err := models.GetPresentationByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "presentation not found", http.StatusNotFound)
			return
		}
		if p.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		slides, err := models.GetPresentationSlides(r.Context(), db, id)
		if err != nil {
			log.Printf("get presentation slides error: %v", err)
			http.Error(w, "could not fetch presentation", http.StatusInternalServerError)
			return
		}
		for i := range slides {
			slides[i].ImageURL = utils.GetPublicURL(slides[i].ImageKey)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(presentationWithSlides{Presentation: *p, Slides: slides})
	}
}

// PUT /presentations/{id} — renames the deck and sets/clears its linked
// doctor (doctor_id: null clears the link).
func UpdatePresentationHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid presentation id", http.StatusBadRequest)
			return
		}

		p, err := models.GetPresentationByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "presentation not found", http.StatusNotFound)
			return
		}
		partnerID := getUserID(r, db)
		if p.PartnerID != partnerID {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req createRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := validateDoctorLink(r, db, req.DoctorID, partnerID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := models.UpdatePresentation(r.Context(), db, id, req.Name, req.DoctorID); err != nil {
			log.Printf("update presentation error: %v", err)
			http.Error(w, "could not update presentation", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "presentation updated"})
	}
}

type replaceSlidesRequest struct {
	ProductImageIDs []uuid.UUID `json:"product_image_ids"`
}

// PUT /presentations/{id}/slides — replaces the deck's whole slide list
// with the given images in the given order, the natural save shape for a
// drag-and-drop builder.
func ReplaceSlidesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid presentation id", http.StatusBadRequest)
			return
		}

		p, err := models.GetPresentationByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "presentation not found", http.StatusNotFound)
			return
		}
		if p.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req replaceSlidesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := models.ReplaceSlides(r.Context(), db, id, req.ProductImageIDs); err != nil {
			log.Printf("replace presentation slides error: %v", err)
			http.Error(w, "could not save slides", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "slides saved"})
	}
}

// DELETE /presentations/{id}
func DeletePresentationHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid presentation id", http.StatusBadRequest)
			return
		}

		p, err := models.GetPresentationByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "presentation not found", http.StatusNotFound)
			return
		}
		if p.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		if err := models.DeletePresentation(r.Context(), db, id); err != nil {
			log.Printf("delete presentation error: %v", err)
			http.Error(w, "could not delete presentation", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "presentation deleted"})
	}
}

// POST /doctors/{id}/generate-presentation — (re)builds the doctor's one
// default deck from every visual_aid image of every product assigned to
// them. Safe to call repeatedly (e.g. after assigning more products) —
// it regenerates the same deck rather than creating duplicates.
func GenerateDefaultPresentationHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		partnerID := getUserID(r, db)
		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != partnerID {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		id, err := models.GenerateDefaultPresentationForDoctor(r.Context(), db, partnerID, doctorID, doctor.Name)
		if err != nil {
			log.Printf("generate default presentation error: %v", err)
			http.Error(w, "could not generate presentation", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// PATCH /admin/products/images/{imgId}/visual-aid — staff-only curation
// flag: marks an image as recommended for partners building a deck.
type visualAidRequest struct {
	VisualAid bool `json:"visual_aid"`
}

func SetImageVisualAidHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imgID, err := uuid.Parse(mux.Vars(r)["imgId"])
		if err != nil {
			http.Error(w, "invalid image id", http.StatusBadRequest)
			return
		}

		var req visualAidRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.SetImageVisualAid(r.Context(), db, imgID, req.VisualAid); err != nil {
			log.Printf("set image visual_aid error: %v", err)
			http.Error(w, "could not update image", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}
