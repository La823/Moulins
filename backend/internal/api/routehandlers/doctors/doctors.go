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

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
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
func syncDoctorBirthdayMeeting(r *http.Request, db *pgxpool.Pool, doctorID, customerID uuid.UUID, dob *time.Time) {
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
	if _, err := models.CreateMeeting(ctx, db, customerID, req); err != nil {
		log.Printf("sync doctor birthday meeting: failed to create entry: %v", err)
	}
}

// GET /admin/doctors — every doctor with a pinned clinic location, across
// all customers, for the admin-only doctors map.
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
		doctors, err := models.GetDoctorsByCustomer(r.Context(), db, getUserID(r))
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

		userID := getUserID(r)
		id, err := models.CreateDoctor(r.Context(), db, userID, req)
		if err != nil {
			log.Printf("create doctor error: %v", err)
			http.Error(w, "could not create doctor", http.StatusInternalServerError)
			return
		}
		if req.DOB != nil {
			syncDoctorBirthdayMeeting(r, db, id, userID, req.DOB)
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
		if doctor.CustomerID != getUserID(r) {
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
		if doctor.CustomerID != getUserID(r) {
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
			log.Printf("update doctor error: %v", err)
			http.Error(w, "could not update doctor", http.StatusInternalServerError)
			return
		}
		syncDoctorBirthdayMeeting(r, db, doctorID, doctor.CustomerID, req.DOB)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "doctor updated"})
	}
}

func DeleteDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		if doctor.CustomerID != getUserID(r) {
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
		if doctor.CustomerID != getUserID(r) {
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
		if doctor.CustomerID != getUserID(r) {
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
		if doctor.CustomerID != getUserID(r) {
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
		if doctor.CustomerID != getUserID(r) {
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
