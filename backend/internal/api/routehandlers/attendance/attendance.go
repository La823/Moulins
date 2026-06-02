package attendance

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

func settingCacheKey(key string) string { return fmt.Sprintf("setting:%s", key) }

func getCachedSetting(r *http.Request, rdb *cache.Client, db *pgxpool.Pool, key string) (string, error) {
	var val string
	if rdb.GetJSON(r.Context(), settingCacheKey(key), &val) {
		return val, nil
	}
	val, err := models.GetSetting(r.Context(), db, key)
	if err != nil {
		return "", err
	}
	rdb.SetJSON(r.Context(), settingCacheKey(key), val, 5*time.Minute)
	return val, nil
}

// Admin: mark attendance for an employee
func MarkAttendanceHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.MarkAttendanceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.EmployeeID == uuid.Nil || req.Date == "" || req.CheckInTime == "" {
			http.Error(w, "employee_id, date, and check_in_time are required", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "present"
		}

		id, err := models.MarkAttendance(r.Context(), db, req, getUserID(r))
		if err != nil {
			log.Printf("mark attendance error: %v", err)
			http.Error(w, "could not mark attendance", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

// Admin: get attendance for a specific date
func GetAttendanceByDateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date := r.URL.Query().Get("date")
		if date == "" {
			http.Error(w, "date query param is required (YYYY-MM-DD)", http.StatusBadRequest)
			return
		}

		records, err := models.GetAttendanceByDate(r.Context(), db, date)
		if err != nil {
			log.Printf("get attendance by date error: %v", err)
			http.Error(w, "could not fetch attendance", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(records)
	}
}

// Admin: get attendance for a whole month
func GetAttendanceByMonthHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		yearStr := r.URL.Query().Get("year")
		monthStr := r.URL.Query().Get("month")
		if yearStr == "" || monthStr == "" {
			http.Error(w, "year and month query params are required", http.StatusBadRequest)
			return
		}

		year, err := strconv.Atoi(yearStr)
		if err != nil {
			http.Error(w, "invalid year", http.StatusBadRequest)
			return
		}
		month, err := strconv.Atoi(monthStr)
		if err != nil {
			http.Error(w, "invalid month", http.StatusBadRequest)
			return
		}

		records, err := models.GetAttendanceByMonth(r.Context(), db, year, month)
		if err != nil {
			log.Printf("get attendance by month error: %v", err)
			http.Error(w, "could not fetch attendance", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(records)
	}
}

// Admin: delete an attendance record
func DeleteAttendanceHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteAttendance(r.Context(), db, id); err != nil {
			log.Printf("delete attendance error: %v", err)
			http.Error(w, "could not delete attendance", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "attendance deleted"})
	}
}

// Employee: get own attendance for a month
func GetMyAttendanceHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		visible, err := getCachedSetting(r, rdb, db, "employee_attendance_visible")
		if err != nil || visible != "true" {
			http.Error(w, "attendance viewing is not enabled", http.StatusForbidden)
			return
		}

		yearStr := r.URL.Query().Get("year")
		monthStr := r.URL.Query().Get("month")
		if yearStr == "" || monthStr == "" {
			http.Error(w, "year and month query params are required", http.StatusBadRequest)
			return
		}

		year, err := strconv.Atoi(yearStr)
		if err != nil {
			http.Error(w, "invalid year", http.StatusBadRequest)
			return
		}
		month, err := strconv.Atoi(monthStr)
		if err != nil {
			http.Error(w, "invalid month", http.StatusBadRequest)
			return
		}

		records, err := models.GetEmployeeAttendanceByMonth(r.Context(), db, getUserID(r), year, month)
		if err != nil {
			log.Printf("get my attendance error: %v", err)
			http.Error(w, "could not fetch attendance", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(records)
	}
}

// Employee: check if attendance is visible
func GetAttendanceVisibilityHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		visible, err := getCachedSetting(r, rdb, db, "employee_attendance_visible")
		if err != nil {
			visible = "false"
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"visible": visible})
	}
}

// Admin: get settings
func GetSettingsHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		visible, _ := getCachedSetting(r, rdb, db, "employee_attendance_visible")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"employee_attendance_visible": visible,
		})
	}
}

// Admin: update settings
func UpdateSettingsHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		for key, value := range body {
			if err := models.SetSetting(r.Context(), db, key, value); err != nil {
				log.Printf("update setting error: %v", err)
				http.Error(w, "could not update setting", http.StatusInternalServerError)
				return
			}
			rdb.Del(r.Context(), settingCacheKey(key))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "settings updated"})
	}
}
