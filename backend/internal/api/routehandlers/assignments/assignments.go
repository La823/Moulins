package assignments

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func ListForClientHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid client id", http.StatusBadRequest)
			return
		}

		employees, err := models.GetEmployeesForClient(r.Context(), db, clientID)
		if err != nil {
			log.Printf("list client employees error: %v", err)
			http.Error(w, "could not fetch assigned employees", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(employees)
	}
}

func AssignHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid client id", http.StatusBadRequest)
			return
		}

		var req models.AssignEmployeeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.AssignEmployeeToClient(r.Context(), db, clientID, req.EmployeeID); err != nil {
			log.Printf("assign employee error: %v", err)
			http.Error(w, "could not assign employee", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "employee assigned"})
	}
}

func RemoveHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid client id", http.StatusBadRequest)
			return
		}
		employeeID, err := uuid.Parse(mux.Vars(r)["employeeId"])
		if err != nil {
			http.Error(w, "invalid employee id", http.StatusBadRequest)
			return
		}

		if err := models.RemoveClientEmployeeAssignment(r.Context(), db, clientID, employeeID); err != nil {
			log.Printf("remove assignment error: %v", err)
			http.Error(w, "could not remove assignment", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "assignment removed"})
	}
}

func ListForEmployeeHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		employeeID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid employee id", http.StatusBadRequest)
			return
		}

		clients, err := models.GetClientsForEmployee(r.Context(), db, employeeID)
		if err != nil {
			log.Printf("list employee clients error: %v", err)
			http.Error(w, "could not fetch assigned clients", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(clients)
	}
}

func ListAllHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		assignments, err := models.GetAllAssignments(r.Context(), db)
		if err != nil {
			log.Printf("list all assignments error: %v", err)
			http.Error(w, "could not fetch assignments", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(assignments)
	}
}
