package jobs

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// GET /careers — public, active postings only
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := models.GetAllJobOpenings(r.Context(), db, true)
		if err != nil {
			log.Printf("list job openings error: %v", err)
			http.Error(w, "could not fetch job openings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

// GET /admin/careers — admin only, includes inactive postings
func AdminListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := models.GetAllJobOpenings(r.Context(), db, false)
		if err != nil {
			log.Printf("list job openings error: %v", err)
			http.Error(w, "could not fetch job openings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

type jobPayload struct {
	Title          string `json:"title"`
	Department     string `json:"department"`
	Location       string `json:"location"`
	EmploymentType string `json:"employment_type"`
	Description    string `json:"description"`
	IsActive       *bool  `json:"is_active"`
}

// POST /admin/careers
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req jobPayload
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Title = strings.TrimSpace(req.Title)
		req.Department = strings.TrimSpace(req.Department)
		req.Location = strings.TrimSpace(req.Location)
		req.EmploymentType = strings.TrimSpace(req.EmploymentType)
		req.Description = strings.TrimSpace(req.Description)
		if req.Title == "" || req.Department == "" || req.Location == "" || req.EmploymentType == "" || req.Description == "" {
			http.Error(w, "title, department, location, employment_type and description are required", http.StatusBadRequest)
			return
		}

		id, err := models.CreateJobOpening(r.Context(), db, req.Title, req.Department, req.Location, req.EmploymentType, req.Description)
		if err != nil {
			log.Printf("create job opening error: %v", err)
			http.Error(w, "could not create job opening", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// PUT /admin/careers/{id}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var req jobPayload
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Title = strings.TrimSpace(req.Title)
		req.Department = strings.TrimSpace(req.Department)
		req.Location = strings.TrimSpace(req.Location)
		req.EmploymentType = strings.TrimSpace(req.EmploymentType)
		req.Description = strings.TrimSpace(req.Description)
		if req.Title == "" || req.Department == "" || req.Location == "" || req.EmploymentType == "" || req.Description == "" {
			http.Error(w, "title, department, location, employment_type and description are required", http.StatusBadRequest)
			return
		}
		isActive := true
		if req.IsActive != nil {
			isActive = *req.IsActive
		}

		if err := models.UpdateJobOpening(r.Context(), db, id, req.Title, req.Department, req.Location, req.EmploymentType, req.Description, isActive); err != nil {
			log.Printf("update job opening error: %v", err)
			http.Error(w, "could not update job opening", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /admin/careers/{id}
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if err := models.DeleteJobOpening(r.Context(), db, id); err != nil {
			log.Printf("delete job opening error: %v", err)
			http.Error(w, "could not delete job opening", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// POST /careers/upload-url — public, unauthenticated (applicants aren't logged in)
func UploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
			http.Error(w, "filename is required", http.StatusBadRequest)
			return
		}
		uploadURL, key, err := utils.GeneratePresignedResumeUploadURL(req.Filename)
		if err != nil {
			log.Printf("resume presign error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"upload_url": uploadURL, "key": key})
	}
}

// POST /careers/{id}/apply — public
func ApplyHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid job id", http.StatusBadRequest)
			return
		}
		var req struct {
			Name      string `json:"name"`
			Phone     string `json:"phone"`
			Email     string `json:"email"`
			ResumeKey string `json:"resume_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		req.Phone = strings.TrimSpace(req.Phone)
		req.Email = strings.TrimSpace(req.Email)
		req.ResumeKey = strings.TrimSpace(req.ResumeKey)
		if req.Name == "" || req.Phone == "" || req.ResumeKey == "" {
			http.Error(w, "name, phone and resume are required", http.StatusBadRequest)
			return
		}

		if _, err := models.GetJobOpening(r.Context(), db, jobID); err != nil {
			http.Error(w, "job opening not found", http.StatusNotFound)
			return
		}

		id, err := models.CreateJobApplication(r.Context(), db, jobID, req.Name, req.Phone, req.Email, req.ResumeKey)
		if err != nil {
			log.Printf("create job application error: %v", err)
			http.Error(w, "could not submit application", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// GET /admin/careers/{id}/applications — admin only
func ListApplicationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid job id", http.StatusBadRequest)
			return
		}
		list, err := models.GetJobApplicationsForJob(r.Context(), db, jobID)
		if err != nil {
			log.Printf("list job applications error: %v", err)
			http.Error(w, "could not fetch applications", http.StatusInternalServerError)
			return
		}

		type applicationOut struct {
			models.JobApplication
			ResumeURL string `json:"resume_url"`
		}
		out := make([]applicationOut, 0, len(list))
		for _, a := range list {
			out = append(out, applicationOut{JobApplication: a, ResumeURL: utils.GetPublicURL(a.ResumeKey)})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}
