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

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// MyAssignmentsHandler is the self-service counterpart to the admin-only
// list endpoints: a client sees their assigned employees, an employee sees
// their assigned clients — used to populate "who can I chat with" contact
// lists without needing admin access.
func MyAssignmentsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		role, _ := r.Context().Value("role").(string)

		var result []models.AssignedUser
		var err error
		if role == "employee" {
			result, err = models.GetClientsForEmployee(r.Context(), db, userID)
		} else {
			result, err = models.GetEmployeesForClient(r.Context(), db, userID)
		}
		if err != nil {
			log.Printf("my assignments error: %v", err)
			http.Error(w, "could not fetch assignments", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// ChatContactsHandler lists everyone the current user is allowed to start a
// chat with, mirroring the CanMessage rule: admins can reach every
// customer/employee, and customers/employees can reach admins plus whoever
// they're assigned to.
func ChatContactsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		role, _ := r.Context().Value("role").(string)

		if role == "admin" {
			customers, err := models.GetUsersByRole(r.Context(), db, "customer")
			if err != nil {
				log.Printf("chat contacts (customers) error: %v", err)
				http.Error(w, "could not fetch contacts", http.StatusInternalServerError)
				return
			}
			employees, err := models.GetUsersByRole(r.Context(), db, "employee")
			if err != nil {
				log.Printf("chat contacts (employees) error: %v", err)
				http.Error(w, "could not fetch contacts", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(append(customers, employees...))
			return
		}

		var assigned []models.AssignedUser
		var err error
		if role == "employee" {
			assigned, err = models.GetClientsForEmployee(r.Context(), db, userID)
		} else {
			assigned, err = models.GetEmployeesForClient(r.Context(), db, userID)
		}
		if err != nil {
			log.Printf("chat contacts (assigned) error: %v", err)
			http.Error(w, "could not fetch contacts", http.StatusInternalServerError)
			return
		}

		admins, err := models.GetUsersByRole(r.Context(), db, "admin")
		if err != nil {
			log.Printf("chat contacts (admins) error: %v", err)
			admins = []models.User{}
		}

		contacts := make([]models.AssignedUser, 0, len(assigned)+len(admins))
		contacts = append(contacts, assigned...)
		for _, a := range admins {
			contacts = append(contacts, models.AssignedUser{
				ID:          a.ID,
				Username:    a.Username,
				PhoneNumber: a.PhoneNumber,
				Email:       a.Email,
				Role:        a.Role,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(contacts)
	}
}

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
