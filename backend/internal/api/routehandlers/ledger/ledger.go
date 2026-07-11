package ledger

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/services"
	"github.com/lavanyaarora/server/internal/utils"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// POST /admin/ledger/upload-url — presigned S3 URL for a ledger PDF (staff)
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

		uploadURL, key, err := utils.GeneratePresignedLedgerUploadURL(req.Filename)
		if err != nil {
			log.Printf("presign error: %v", err)
			http.Error(w, "could not generate upload url", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"upload_url": uploadURL,
			"key":        key,
		})
	}
}

// PUT /admin/customers/{id}/ledger — upload/replace a customer's ledger (staff)
func UpsertLedgerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		customerID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid customer id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			FileKey string `json:"file_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileKey == "" {
			http.Error(w, "file_key is required", http.StatusBadRequest)
			return
		}

		if err := models.UpsertLedger(r.Context(), db, customerID, req.FileKey, getUserID(r)); err != nil {
			log.Printf("upsert ledger error: %v", err)
			http.Error(w, "could not save ledger", http.StatusInternalServerError)
			return
		}

		deepLink := "/dashboard"
		if err := services.SendDirectNotification(r.Context(), db, customerID, "Ledger Updated", "Your account ledger has been updated. Tap to view.", &deepLink); err != nil {
			log.Printf("ledger notification error: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "ledger saved"})
	}
}

// GET /admin/customers/{id}/ledger — current ledger for a customer (staff)
func GetLedgerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		customerID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid customer id", http.StatusBadRequest)
			return
		}
		respondLedger(w, r, db, customerID)
	}
}

// GET /ledger — the current user's own ledger (self-service, customers)
func GetMyLedgerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondLedger(w, r, db, getUserID(r))
	}
}

func respondLedger(w http.ResponseWriter, r *http.Request, db *pgxpool.Pool, userID uuid.UUID) {
	l, err := models.GetLedgerByUserID(r.Context(), db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(nil)
			return
		}
		log.Printf("get ledger error: %v", err)
		http.Error(w, "could not fetch ledger", http.StatusInternalServerError)
		return
	}
	l.FileURL = utils.GetPublicURL(l.FileKey)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(l)
}
