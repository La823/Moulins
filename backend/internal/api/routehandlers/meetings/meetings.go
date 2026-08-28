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

// getUserID returns the requesting user's effective partner id — for a
// team member this resolves to their owning partner's id, so meetings are
// automatically shared across the partner and their whole team instead of
// being scoped to the team member's own account.
func getUserID(r *http.Request, db *pgxpool.Pool) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	owner, err := models.ResolveOwnerID(r.Context(), db, id)
	if err != nil {
		return id
	}
	return owner
}

// rawUserID is the actual logged-in user's own id, unresolved — needed to
// know who a meeting is assigned to / who is submitting a visit log,
// distinct from getUserID's pooled partner id.
func rawUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

func getRole(r *http.Request) string {
	role, _ := r.Context().Value("role").(string)
	return role
}

// canAccessMeeting allows the pooled owner (the partner, who can see and
// manage every meeting under their account) or the specific team member the
// meeting is assigned to.
func canAccessMeeting(meeting *models.Meeting, ownerID, rawID uuid.UUID) bool {
	if meeting.UserID == ownerID {
		return true
	}
	return meeting.AssignedTo != nil && *meeting.AssignedTo == rawID
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

		ownerID := getUserID(r, db)

		if req.DoctorID != nil {
			doctor, err := models.GetDoctorByID(r.Context(), db, *req.DoctorID)
			if err != nil {
				http.Error(w, "doctor not found", http.StatusNotFound)
				return
			}
			if doctor.PartnerID != ownerID {
				http.Error(w, "not authorized", http.StatusForbidden)
				return
			}
		}

		// Defaults to whoever is scheduling it; a partner can instead assign
		// it to one of their own team members so it shows up on that team
		// member's portal.
		assignedTo := rawUserID(r)
		if req.AssignedTo != nil {
			ok, err := models.ValidateAssignee(r.Context(), db, ownerID, *req.AssignedTo)
			if err != nil {
				log.Printf("validate assignee error: %v", err)
				http.Error(w, "could not validate assignee", http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, "assignee must be yourself or one of your team members", http.StatusForbidden)
				return
			}
			assignedTo = *req.AssignedTo
		}

		id, err := models.CreateMeeting(r.Context(), db, ownerID, assignedTo, req)
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

		// A team member only sees meetings assigned to them; the partner
		// (whether logged in directly or resolved as the owner) sees
		// everything pooled under their account.
		var assigneeID *uuid.UUID
		if getRole(r) == "team_member" {
			id := rawUserID(r)
			assigneeID = &id
		}

		meetings, err := models.GetMeetingsForUser(r.Context(), db, getUserID(r, db), assigneeID, doctorID,
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
		if !canAccessMeeting(meeting, getUserID(r, db), rawUserID(r)) {
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
		if meeting.UserID != getUserID(r, db) {
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
			if doctor.PartnerID != getUserID(r, db) {
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
		if !canAccessMeeting(meeting, getUserID(r, db), rawUserID(r)) {
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
		if !canAccessMeeting(meeting, getUserID(r, db), rawUserID(r)) {
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

// POST /meetings/{id}/visit-log — the assignee (or the partner themselves)
// logs their location and a timestamp as proof they attended, visible back
// on the partner's portal.
func CreateVisitLogHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		if !canAccessMeeting(meeting, getUserID(r, db), rawUserID(r)) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req struct {
			Latitude  *float64 `json:"latitude"`
			Longitude *float64 `json:"longitude"`
			Notes     *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Latitude == nil || req.Longitude == nil {
			http.Error(w, "latitude and longitude are required", http.StatusBadRequest)
			return
		}

		logID, err := models.CreateMeetingVisitLog(r.Context(), db, id, rawUserID(r), *req.Latitude, *req.Longitude, req.Notes)
		if err != nil {
			log.Printf("create meeting visit log error: %v", err)
			http.Error(w, "could not save visit log", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": logID.String()})
	}
}

// GET /meetings/{id}/visit-log
func ListVisitLogsHandler(db *pgxpool.Pool) http.HandlerFunc {
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
		if !canAccessMeeting(meeting, getUserID(r, db), rawUserID(r)) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		logs, err := models.GetVisitLogsForMeeting(r.Context(), db, id)
		if err != nil {
			log.Printf("list meeting visit logs error: %v", err)
			http.Error(w, "could not fetch visit logs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"logs": logs})
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
		if meeting.UserID != getUserID(r, db) {
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
