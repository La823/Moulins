package doctors

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

func ListDoctorsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctors, err := models.GetDoctorsByCustomer(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list doctors error: %v", err)
			http.Error(w, "could not fetch doctors", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(doctors)
	}
}

func CreateDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateDoctorRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		id, err := models.CreateDoctor(r.Context(), db, getUserID(r), req)
		if err != nil {
			log.Printf("create doctor error: %v", err)
			http.Error(w, "could not create doctor", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
	}
}

func GetDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.CustomerID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(doctor)
	}
}

func UpdateDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.CustomerID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req models.CreateDoctorRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		if err := models.UpdateDoctor(r.Context(), db, doctorID, req); err != nil {
			log.Printf("update doctor error: %v", err)
			http.Error(w, "could not update doctor", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "doctor updated"})
	}
}

func DeleteDoctorHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.CustomerID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		if err := models.DeleteDoctor(r.Context(), db, doctorID); err != nil {
			log.Printf("delete doctor error: %v", err)
			http.Error(w, "could not delete doctor", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "doctor deleted"})
	}
}

func ListDoctorProductsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.CustomerID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		products, err := models.GetDoctorProducts(r.Context(), db, doctorID)
		if err != nil {
			log.Printf("list doctor products error: %v", err)
			http.Error(w, "could not fetch products", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(products)
	}
}

func AddDoctorProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.CustomerID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		var req models.AddDoctorProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.AddDoctorProduct(r.Context(), db, doctorID, req.ProductID); err != nil {
			log.Printf("add doctor product error: %v", err)
			http.Error(w, "could not add product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "product added"})
	}
}

func RemoveDoctorProductHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doctorID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid doctor id", http.StatusBadRequest)
			return
		}

		doctor, err := models.GetDoctorByID(r.Context(), db, doctorID)
		if err != nil {
			http.Error(w, "doctor not found", http.StatusNotFound)
			return
		}
		if doctor.CustomerID != getUserID(r) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		productID, err := uuid.Parse(mux.Vars(r)["productId"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}

		if err := models.RemoveDoctorProduct(r.Context(), db, doctorID, productID); err != nil {
			log.Printf("remove doctor product error: %v", err)
			http.Error(w, "could not remove product", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "product removed"})
	}
}
