package team

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/middleware"
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
// The messages are shown to the partner as they are, so they say what went
// wrong and what to do.
const (
	msgTeamPartnersOnly  = "Only partner accounts can add team members."
	msgTeamBadRequest    = "The request could not be read. Please update the app and try again."
	msgTeamPhoneRequired = "Please enter the team member's phone number and a password."
	msgTeamWeakPassword  = "The password must be at least 8 characters long and include an uppercase letter, a lowercase letter and a number."
	msgTeamPhoneTaken    = "This phone number is already registered to another account. Please use a phone number that has not been registered before."
	msgTeamServerError   = "The team member could not be added at this time. Please try again in a few minutes."
)

func CreateTeamMemberHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if getRole(r) != "partner" {
			http.Error(w, msgTeamPartnersOnly, http.StatusForbidden)
			return
		}

		var body struct {
			PhoneNumber string  `json:"phone_number"`
			Password    string  `json:"password"`
			Username    *string `json:"username"`
			Email       *string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, msgTeamBadRequest, http.StatusBadRequest)
			return
		}
		if body.PhoneNumber == "" || body.Password == "" {
			http.Error(w, msgTeamPhoneRequired, http.StatusBadRequest)
			return
		}
		if err := utils.ValidatePasswordStrength(body.Password); err != nil {
			http.Error(w, msgTeamWeakPassword, http.StatusBadRequest)
			return
		}
		if body.Email != nil && *body.Email == "" {
			body.Email = nil
		}
		if body.Username != nil && *body.Username == "" {
			body.Username = nil
		}

		// A phone number has one login. One of this partner's own removed
		// members is brought back (same account, so their history returns
		// with them); anyone else's number is refused with a reason.
		ownerID := getUserID(r)
		existing, role, teamOwner, removed, found, err := models.PhoneOwner(r.Context(), db, body.PhoneNumber)
		if err != nil {
			log.Printf("create team member: phone lookup: %v", err)
			http.Error(w, msgTeamServerError, http.StatusInternalServerError)
			return
		}
		if found {
			if role == "team_member" && removed && teamOwner != nil && *teamOwner == ownerID {
				if err := models.RestoreTeamMember(r.Context(), db, existing, body.Password, body.Username, body.Email); err != nil {
					log.Printf("create team member: restore %s: %v", existing, err)
					http.Error(w, msgTeamServerError, http.StatusInternalServerError)
					return
				}
				middleware.RestoreUser(existing)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusCreated)
				json.NewEncoder(w).Encode(map[string]any{"id": existing, "restored": true})
				return
			}
			http.Error(w, msgTeamPhoneTaken, http.StatusConflict)
			return
		}

		id, err := models.CreateTeamMember(r.Context(), db, ownerID, body.PhoneNumber, body.Password, body.Username, body.Email)
		if err != nil {
			log.Printf("create team member error: %v", err)
			// Two partners adding the same number at the same moment.
			if strings.Contains(err.Error(), "users_phone_number_key") {
				http.Error(w, msgTeamPhoneTaken, http.StatusConflict)
				return
			}
			http.Error(w, msgTeamServerError, http.StatusInternalServerError)
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
	// removed members are gone from the team as far as these routes go
	active, err := models.IsActiveTeamMember(r.Context(), db, getUserID(r), id)
	if err != nil || !active {
		http.Error(w, "team member not found", http.StatusNotFound)
		return uuid.Nil, false
	}
	return id, true
}

// GET /team/{id} — a partner views one of their own team member's details,
// including their login credentials (plain_password is stored precisely so
// a partner who forgets what they set can look it up).
func GetTeamMemberHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := requireOwnedMember(w, r, db)
		if !ok {
			return
		}

		member, err := models.GetUserByIDFull(r.Context(), db, id)
		if err != nil {
			log.Printf("get team member error: %v", err)
			http.Error(w, "could not fetch team member", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(member)
	}
}

// PUT /team/{id} — update a team member's password and/or email. Either
// field may be omitted; password, if given, must still pass strength checks.
func UpdateTeamMemberHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := requireOwnedMember(w, r, db)
		if !ok {
			return
		}

		var body struct {
			Password string  `json:"password"`
			Email    *string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.Password == "" && body.Email == nil {
			http.Error(w, "nothing to update", http.StatusBadRequest)
			return
		}

		if body.Password != "" {
			if err := utils.ValidatePasswordStrength(body.Password); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := models.UpdateUserPassword(r.Context(), db, id, body.Password); err != nil {
				log.Printf("update team member error: %v", err)
				http.Error(w, "could not update team member", http.StatusInternalServerError)
				return
			}
		}

		if body.Email != nil {
			if err := models.UpdateEmail(r.Context(), db, id, *body.Email); err != nil {
				log.Printf("update team member email error: %v", err)
				http.Error(w, "could not update team member", http.StatusInternalServerError)
				return
			}
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

		// Marked removed, never deleted: their attendance, logs, visits and
		// meetings stay, with their name on them.
		if err := models.SoftDeleteTeamMember(r.Context(), db, id); err != nil {
			log.Printf("delete team member error: %v", err)
			http.Error(w, "could not delete team member", http.StatusInternalServerError)
			return
		}
		middleware.RevokeUser(id)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}
