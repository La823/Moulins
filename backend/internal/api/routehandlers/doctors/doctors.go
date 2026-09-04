package doctors

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// getUserID returns the requesting user's effective partner id — for a
// team member this resolves to their owning partner's id, so every
// doctor list/create/edit/delete below is automatically shared with the
// partner (and the rest of the partner's team) instead of being scoped to
// the team member's own account.
func getUserID(r *http.Request, db *pgxpool.Pool) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	owner, err := models.ResolveOwnerID(r.Context(), db, id)
	if err != nil {
		return id
	}
	return owner
}

func getRole(r *http.Request) string {
	role, _ := r.Context().Value("role").(string)
	return role
}

// nextBirthdayOccurrence returns the next upcoming date (this year, or next
// year if this year's has already passed) that shares dob's month/day, at
// noon local time to stay clear of any midnight DST edge cases.
func nextBirthdayOccurrence(dob time.Time, now time.Time) time.Time {
	next := time.Date(now.Year(), dob.Month(), dob.Day(), 12, 0, 0, 0, now.Location())
	if next.Before(now) {
		next = next.AddDate(1, 0, 0)
	}
	return next
}

// syncDoctorBirthdayMeeting drops any not-yet-happened auto-created
// "Birthday" entry for the doctor and, if a DOB is set, adds a fresh one on
// the next occurrence — so the calendar always reflects the doctor's actual
// current DOB after create or edit.
func syncDoctorBirthdayMeeting(r *http.Request, db *pgxpool.Pool, doctorID, partnerID uuid.UUID, dob *time.Time) {
	ctx := r.Context()
	if err := models.DeleteUpcomingBirthdayMeeting(ctx, db, doctorID); err != nil {
		log.Printf("sync doctor birthday meeting: failed to clear old entry: %v", err)
	}
	if dob == nil {
		return
	}
	next := nextBirthdayOccurrence(*dob, time.Now())
	title := "Birthday"
	notes := "Doctor's birthday"
	req := models.CreateMeetingRequest{DoctorID: &doctorID, Title: &title, ScheduledAt: next, Notes: &notes}
	if _, err := models.CreateMeeting(ctx, db, partnerID, partnerID, req); err != nil {
		log.Printf("sync doctor birthday meeting: failed to create entry: %v", err)
	}
}

// syncDoctorAnniversaryMeeting mirrors syncDoctorBirthdayMeeting for the
// doctor's anniversary date.
func syncDoctorAnniversaryMeeting(r *http.Request, db *pgxpool.Pool, doctorID, partnerID uuid.UUID, anniversary *time.Time) {
	ctx := r.Context()
	if err := models.DeleteUpcomingAnniversaryMeeting(ctx, db, doctorID); err != nil {
		log.Printf("sync doctor anniversary meeting: failed to clear old entry: %v", err)
	}
	if anniversary == nil {
		return
	}
	next := nextBirthdayOccurrence(*anniversary, time.Now())
	title := "Anniversary"
	notes := "Doctor's anniversary"
	req := models.CreateMeetingRequest{DoctorID: &doctorID, Title: &title, ScheduledAt: next, Notes: &notes}
	if _, err := models.CreateMeeting(ctx, db, partnerID, partnerID, req); err != nil {
		log.Printf("sync doctor anniversary meeting: failed to create entry: %v", err)
	}
}

// PUT /admin/doctors/{id}/contact-name — set/clear the internal-only
// contact name used by staff for data cleanup. Never readable or writable
// by partners.
func UpdateDoctorContactNameHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		var req struct {
			ContactName *string `json:"contact_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateDoctorInternalContactName(r.Context(), db, doctorID, req.ContactName); err != nil {
			log.Printf("update doctor contact name error: %v", err)
			http.Error(w, "could not update contact name", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

// GET /admin/doctors — every doctor with a pinned clinic location, across
// all partners, for the admin-only doctors map.
func AdminListDoctorsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctors, err := models.GetAllDoctorsWithLocation(r.Context(), db)
		if err != nil {
			log.Printf("admin list doctors error: %v", err)
			http.Error(w, "could not fetch doctors", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(doctors)
	}
}

func ListDoctorsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctors, err := models.GetDoctorsByPartner(r.Context(), db, getUserID(r, db))
		if err != nil {
			log.Printf("list doctors error: %v", err)
			http.Error(w, "could not fetch doctors", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(doctors)
	}
}

func CreateDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateDoctorRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		userID := getUserID(r, db)
		id, err := models.CreateDoctor(r.Context(), db, userID, req)
		if err != nil {
			if err == models.ErrDoctorPhoneRequired || err == models.ErrDoctorPhoneTaken {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			log.Printf("create doctor error: %v", err)
			http.Error(w, "could not create doctor", http.StatusInternalServerError)
			return
		}
		if req.DOB != nil {
			dob := req.DOB.Time()
			syncDoctorBirthdayMeeting(r, db, id, userID, &dob)
		}
		if req.Anniversary != nil {
			anniversary := req.Anniversary.Time()
			syncDoctorAnniversaryMeeting(r, db, id, userID, &anniversary)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

func GetDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(doctor)
	}
}

func UpdateDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req models.CreateDoctorRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		if err := models.UpdateDoctor(r.Context(), db, doctorID, req); err != nil {
			if err == models.ErrDoctorPhoneRequired || err == models.ErrDoctorPhoneTaken {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			log.Printf("update doctor error: %v", err)
			http.Error(w, "could not update doctor", http.StatusInternalServerError)
			return
		}
		var dob, anniversary *time.Time
		if req.DOB != nil {
			t := req.DOB.Time()
			dob = &t
		}
		if req.Anniversary != nil {
			t := req.Anniversary.Time()
			anniversary = &t
		}
		syncDoctorBirthdayMeeting(r, db, doctorID, doctor.PartnerID, dob)
		syncDoctorAnniversaryMeeting(r, db, doctorID, doctor.PartnerID, anniversary)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "doctor updated"})
	}
}

func DeleteDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Team members share their owning partner's doctor list (list,
		// create, edit) but can't remove a doctor the partner relies on —
		// only the partner themselves (or Moulins staff, who reach this
		// same handler) can delete.
		role := getRole(r)
		if role == "team_member" {
			http.Error(w, "only the partner can delete a doctor", http.StatusForbidden)
			return
		}

		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		if err := models.DeleteDoctor(r.Context(), db, doctorID); err != nil {
			log.Printf("delete doctor error: %v", err)
			http.Error(w, "could not delete doctor", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "doctor deleted"})
	}
}

// PUT /doctors/{id}/last-meeting — manually set/correct the doctor's last
// meeting date + notes (also kept in sync automatically when a meeting
// with this doctor is marked completed).
func UpdateDoctorLastMeetingHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req models.UpdateDoctorLastMeetingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateDoctorLastMeeting(r.Context(), db, doctorID, req); err != nil {
			log.Printf("update doctor last meeting error: %v", err)
			http.Error(w, "could not update last meeting", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

func ListDoctorProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		products, err := models.GetDoctorProducts(r.Context(), db, doctorID)
		if err != nil {
			log.Printf("list doctor products error: %v", err)
			http.Error(w, "could not fetch products", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(products)
	}
}

func AddDoctorProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req models.AddDoctorProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.AddDoctorProduct(r.Context(), db, doctorID, req.ProductID); err != nil {
			log.Printf("add doctor product error: %v", err)
			http.Error(w, "could not add product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "product added"})
	}
}

// GET /doctor/me — a doctor-role user's own linked doctor record. Doesn't
// use getUserID/ResolveOwnerID (that resolves team_member → partner, not
// applicable to a doctor login), so it looks up the doctors row directly by
// user_id.
func GetMyDoctorProfileHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(r.Context().Value("user_id").(string))
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		doctor, err := models.GetDoctorByUserID(r.Context(), db, userID)
		if err != nil {
			http.Error(w, "doctor profile not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(doctor)
	}
}

// PUT /doctor/me — a doctor edits their own name/email/clinic details and
// location. Phone stays fixed (it's their login identity, only staff can
// change it) and speciality isn't part of the self-service profile.
func UpdateMyDoctorProfileHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(r.Context().Value("user_id").(string))
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		doctor, err := models.GetDoctorByUserID(r.Context(), db, userID)
		if err != nil {
			http.Error(w, "doctor profile not found", http.StatusNotFound)
			return
		}

		var req models.UpdateDoctorSelfRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		if err := models.UpdateDoctorSelf(r.Context(), db, doctor.ID, req); err != nil {
			log.Printf("update my doctor profile error: %v", err)
			http.Error(w, "could not update profile", http.StatusInternalServerError)
			return
		}

		updated, err := models.GetDoctorByUserID(r.Context(), db, userID)
		if err != nil {
			http.Error(w, "doctor profile not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(updated)
	}
}

func RemoveDoctorProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.PartnerID != getUserID(r, db) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		if err := models.RemoveDoctorProduct(r.Context(), db, doctorID, productID); err != nil {
			log.Printf("remove doctor product error: %v", err)
			http.Error(w, "could not remove product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "product removed"})
	}
}
