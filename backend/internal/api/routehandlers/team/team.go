package team

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

func getRole(r *http.Request) string {
	role, _ := r.Context().Value("role").(string)
	return role
}

// POST /team — a partner creates a login for a new team member.
func CreateTeamMemberHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if getRole(r) != "partner" {
			http.Error(w, "only partners can create team members", http.StatusForbidden)
			return
		}

		var body struct {
			PhoneNumber string  `json:"phone_number"`
			Password    string  `json:"password"`
			Username    *string `json:"username"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.PhoneNumber == "" || body.Password == "" {
			http.Error(w, "phone_number and password are required", http.StatusBadRequest)
			return
		}
		if err := utils.ValidatePasswordStrength(body.Password); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id, err := models.CreateTeamMember(r.Context(), db, getUserID(r), body.PhoneNumber, body.Password, body.Username)
		if err != nil {
			log.Printf("create team member error: %v", err)
			http.Error(w, "could not create team member", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": id})
	}
}

// GET /team — a partner lists their own team members.
func ListTeamMembersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if getRole(r) != "partner" {
			http.Error(w, "only partners have a team", http.StatusForbidden)
			return
		}

		members, err := models.GetTeamMembers(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list team members error: %v", err)
			http.Error(w, "could not fetch team members", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(members)
	}
}

// requireOwnedMember verifies the requester is a partner and id belongs to
// one of their team members. Returns the target's id and true on success;
// writes the error response and returns false otherwise.
func requireOwnedMember(w http.ResponseWriter, r *http.Request, db *pgxpool.Pool) (uuid.UUID, bool) {
	if getRole(r) != "partner" {
		http.Error(w, "only partners can manage team members", http.StatusForbidden)
		return uuid.Nil, false
	}
	id, err := uuid.Parse(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "invalid team member id", http.StatusBadRequest)
		return uuid.Nil, false
	}
	target, err := models.GetUserByID(r.Context(), db, id)
	if err != nil || target.TeamOwnerID == nil || *target.TeamOwnerID != getUserID(r) {
		http.Error(w, "team member not found", http.StatusNotFound)
		return uuid.Nil, false
	}
	return id, true
}

// PUT /team/{id} — update a team member's password/username.
func UpdateTeamMemberHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := requireOwnedMember(w, r, db)
		if !ok {
			return
		}

		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.Password == "" {
			http.Error(w, "password is required", http.StatusBadRequest)
			return
		}
		if err := utils.ValidatePasswordStrength(body.Password); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := models.UpdateUserPassword(r.Context(), db, id, body.Password); err != nil {
			log.Printf("update team member error: %v", err)
			http.Error(w, "could not update team member", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	}
}

// DELETE /team/{id} — remove a team member's account entirely.
func DeleteTeamMemberHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := requireOwnedMember(w, r, db)
		if !ok {
			return
		}

		if err := models.DeleteUser(r.Context(), db, id); err != nil {
			log.Printf("delete team member error: %v", err)
			http.Error(w, "could not delete team member", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}
