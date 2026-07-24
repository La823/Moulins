package meetings

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// POST /meetings
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateMeetingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ScheduledAt.IsZero() {
			http.Error(w, "scheduled_at is required", http.StatusBadRequest)
			return
		}
		if req.DoctorID == nil && (req.Title == nil || *req.Title == "") {
			http.Error(w, "either doctor_id or title is required", http.StatusBadRequest)
			return
		}

		if req.DoctorID != nil {
			doctor, err := models.GetDoctorByID(r.Context(), db, *req.DoctorID)
			if err != nil {
				http.Error(w, "doctor not found", http.StatusNotFound)
				return
			}
			if doctor.PartnerID != getUserID(r) {
				http.Error(w, "not authorized", http.StatusForbidden)
				return
			}
		}

		id, err := models.CreateMeeting(r.Context(), db, getUserID(r), req)
		if err != nil {
			log.Printf("create meeting error: %v", err)
			http.Error(w, "could not create meeting", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// GET /meetings?doctor_id=&status=&from=&to=
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var doctorID *uuid.UUID
		if raw := r.URL.Query().Get("doctor_id"); raw != "" {
			if parsed, err := uuid.Parse(raw); err == nil {
				doctorID = &parsed
			}
		}
		meetings, err := models.GetMeetingsForUser(r.Context(), db, getUserID(r), doctorID,
			r.URL.Query().Get("status"), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
		if err != nil {
			log.Printf("list meetings error: %v", err)
			http.Error(w, "could not fetch meetings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(meetings)
	}
}

// GET /meetings/{id}
func GetHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid meeting id", http.StatusBadRequest)
			return
		}

		meeting, err := models.GetMeetingByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "meeting not found", http.StatusNotFound)
			return
		}
		if meeting.UserID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(meeting)
	}
}

// PUT /meetings/{id}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid meeting id", http.StatusBadRequest)
			return
		}

		meeting, err := models.GetMeetingByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "meeting not found", http.StatusNotFound)
			return
		}
		if meeting.UserID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req models.UpdateMeetingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.ScheduledAt.IsZero() {
			http.Error(w, "scheduled_at is required", http.StatusBadRequest)
			return
		}
		if req.DoctorID == nil && (req.Title == nil || *req.Title == "") {
			http.Error(w, "either doctor_id or title is required", http.StatusBadRequest)
			return
		}

		if req.DoctorID != nil {
			doctor, err := models.GetDoctorByID(r.Context(), db, *req.DoctorID)
			if err != nil {
				http.Error(w, "doctor not found", http.StatusNotFound)
				return
			}
			if doctor.PartnerID != getUserID(r) {
				http.Error(w, "not authorized", http.StatusForbidden)
				return
			}
		}

		if err := models.UpdateMeeting(r.Context(), db, id, req); err != nil {
			log.Printf("update meeting error: %v", err)
			http.Error(w, "could not update meeting", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PUT /meetings/{id}/mom
func UpdateMomHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid meeting id", http.StatusBadRequest)
			return
		}

		meeting, err := models.GetMeetingByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "meeting not found", http.StatusNotFound)
			return
		}
		if meeting.UserID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req struct {
			Mom *string `json:"mom"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateMeetingMom(r.Context(), db, id, req.Mom); err != nil {
			log.Printf("update meeting mom error: %v", err)
			http.Error(w, "could not update meeting notes", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// PUT /meetings/{id}/status
func UpdateStatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid meeting id", http.StatusBadRequest)
			return
		}

		meeting, err := models.GetMeetingByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "meeting not found", http.StatusNotFound)
			return
		}
		if meeting.UserID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Status != "upcoming" && req.Status != "completed" && req.Status != "cancelled" {
			http.Error(w, "status must be upcoming, completed or cancelled", http.StatusBadRequest)
			return
		}

		if err := models.UpdateMeetingStatus(r.Context(), db, id, req.Status); err != nil {
			log.Printf("update meeting status error: %v", err)
			http.Error(w, "could not update meeting status", http.StatusInternalServerError)
			return
		}

		if req.Status == "completed" && meeting.DoctorID != nil {
			notes := meeting.Mom
			if notes == nil || *notes == "" {
				notes = meeting.Notes
			}
			if err := models.SyncDoctorLastMeetingFromCompletedMeeting(r.Context(), db, *meeting.DoctorID, meeting.ScheduledAt, notes); err != nil {
				log.Printf("sync doctor last meeting error: %v", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /meetings/{id}
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid meeting id", http.StatusBadRequest)
			return
		}

		meeting, err := models.GetMeetingByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "meeting not found", http.StatusNotFound)
			return
		}
		if meeting.UserID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		if err := models.DeleteMeeting(r.Context(), db, id); err != nil {
			log.Printf("delete meeting error: %v", err)
			http.Error(w, "could not delete meeting", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// GET /admin/meetings?user_id=&doctor_id=&status=&from=&to=&page=&limit=
func AdminListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()

		filters := models.AdminMeetingFilters{
			Status: q.Get("status"),
			From:   q.Get("from"),
			To:     q.Get("to"),
		}
		if uid := q.Get("user_id"); uid != "" {
			parsed, err := uuid.Parse(uid)
			if err != nil {
				http.Error(w, "invalid user_id", http.StatusBadRequest)
				return
			}
			filters.UserID = &parsed
		}
		if did := q.Get("doctor_id"); did != "" {
			parsed, err := uuid.Parse(did)
			if err != nil {
				http.Error(w, "invalid doctor_id", http.StatusBadRequest)
				return
			}
			filters.DoctorID = &parsed
		}

		page, _ := strconv.Atoi(q.Get("page"))
		if page < 1 {
			page = 1
		}
		limit, _ := strconv.Atoi(q.Get("limit"))
		if limit < 1 || limit > 200 {
			limit = 50
		}

		meetingsList, total, err := models.GetAllMeetings(r.Context(), db, filters, limit, (page-1)*limit)
		if err != nil {
			log.Printf("admin list meetings error: %v", err)
			http.Error(w, "could not fetch meetings", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"meetings": meetingsList,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}
