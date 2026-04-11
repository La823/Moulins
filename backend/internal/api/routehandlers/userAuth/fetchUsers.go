package userauth

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func GetLastUsersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		users, err := models.GetLastUsers(r.Context(), db, 20)
		if err != nil {
			log.Printf("failed to fetch users: %v", err)
			http.Error(w, "could not fetch users", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

func GetEmployeesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := models.GetUsersByRole(r.Context(), db, "employee")
		if err != nil {
			log.Printf("failed to fetch employees: %v", err)
			http.Error(w, "could not fetch employees", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}
