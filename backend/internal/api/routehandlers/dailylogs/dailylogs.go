package dailylogs

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

// POST /my-daily-log — a team member submits (or replaces) their log entry
// for a given day.
func SubmitMyDailyLogHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Date      string   `json:"date"`
			Notes     string   `json:"notes"`
			Latitude  *float64 `json:"latitude"`
			Longitude *float64 `json:"longitude"`
			Address   *string  `json:"address"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.Date == "" || body.Notes == "" {
			http.Error(w, "date and notes are required", http.StatusBadRequest)
			return
		}
		if body.Latitude == nil || body.Longitude == nil {
			http.Error(w, "current location is required to submit a daily log", http.StatusBadRequest)
			return
		}

		id, err := models.UpsertDailyLog(r.Context(), db, getUserID(r), body.Date, body.Notes, body.Latitude, body.Longitude, body.Address)
		if err != nil {
			log.Printf("submit daily log error: %v", err)
			http.Error(w, "could not save daily log", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

func parseYearMonth(r *http.Request) (int, int, error) {
	year, err := strconv.Atoi(r.URL.Query().Get("year"))
	if err != nil {
		return 0, 0, err
	}
	month, err := strconv.Atoi(r.URL.Query().Get("month"))
	if err != nil {
		return 0, 0, err
	}
	return year, month, nil
}

// GET /my-daily-log?year=&month= — a team member views their own logs.
func GetMyDailyLogsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		year, month, err := parseYearMonth(r)
		if err != nil {
			http.Error(w, "year and month query params are required", http.StatusBadRequest)
			return
		}

		logs, err := models.GetDailyLogsByMemberMonth(r.Context(), db, getUserID(r), year, month)
		if err != nil {
			log.Printf("get my daily logs error: %v", err)
			http.Error(w, "could not fetch daily logs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(logs)
	}
}

// GET /team/{id}/daily-logs?year=&month= — a partner reviews one team
// member's logs.
func GetTeamMemberDailyLogsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		role, _ := r.Context().Value("role").(string)
		if role != "partner" {
			http.Error(w, "only partners can review team daily logs", http.StatusForbidden)
			return
		}

		memberID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid team member id", http.StatusBadRequest)
			return
		}
		member, err := models.GetUserByID(r.Context(), db, memberID)
		if err != nil || member.TeamOwnerID == nil || *member.TeamOwnerID != getUserID(r) {
			http.Error(w, "team member not found", http.StatusNotFound)
			return
		}

		year, month, err := parseYearMonth(r)
		if err != nil {
			http.Error(w, "year and month query params are required", http.StatusBadRequest)
			return
		}

		logs, err := models.GetDailyLogsByMemberMonth(r.Context(), db, memberID, year, month)
		if err != nil {
			log.Printf("get team member daily logs error: %v", err)
			http.Error(w, "could not fetch daily logs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(logs)
	}
}
