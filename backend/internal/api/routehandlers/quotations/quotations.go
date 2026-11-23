// Package quotations is the staff register of prices quoted (one product
// per entry): GET /admin/quotations lists them, POST/PUT/DELETE change them.
// quotations_view sees the list; quotations_edit also adds, changes and
// removes entries. Admins can do everything.
package quotations

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func userID(r *http.Request) uuid.UUID {
	s, _ := r.Context().Value("user_id").(string)
	id, _ := uuid.Parse(s)
	return id
}

func can(r *http.Request, db *pgxpool.Pool, permission string) bool {
	if role, _ := r.Context().Value("role").(string); role == "admin" {
		return true
	}
	ok, err := models.HasPermission(r.Context(), db, userID(r), permission)
	return err == nil && ok
}

func canView(r *http.Request, db *pgxpool.Pool) bool {
	return can(r, db, "quotations_view") || can(r, db, "quotations_edit")
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// a form mistake goes back as 400 with its message; anything else is a 500
func saveError(w http.ResponseWriter, what string, err error) {
	var bad models.ErrQuotationInvalid
	if errors.As(err, &bad) {
		http.Error(w, bad.Msg, http.StatusBadRequest)
		return
	}
	log.Printf("quotations %s: %v", what, err)
	http.Error(w, "could not save the quotation", http.StatusInternalServerError)
}

// India's day boundaries for the date filter
var ist = func() *time.Location {
	if l, err := time.LoadLocation("Asia/Kolkata"); err == nil {
		return l
	}
	return time.FixedZone("IST", 5*3600+1800)
}()

// GET /admin/quotations?search=&kind=&product_id=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canView(r, db) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		q := r.URL.Query()
		f := models.QuotationFilter{Search: q.Get("search"), Kind: q.Get("kind")}
		f.Page, _ = strconv.Atoi(q.Get("page"))
		if id, err := uuid.Parse(q.Get("product_id")); err == nil {
			f.ProductID = &id
		}
		if d, err := time.ParseInLocation("2006-01-02", q.Get("from"), ist); err == nil {
			f.From = &d
		}
		if d, err := time.ParseInLocation("2006-01-02", q.Get("to"), ist); err == nil {
			end := d.AddDate(0, 0, 1)
			f.To = &end
		}
		list, total, err := models.ListQuotations(r.Context(), db, f)
		if err != nil {
			log.Printf("quotations list: %v", err)
			http.Error(w, "could not load quotations", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{
			"quotations": list, "total": total, "page": max(f.Page, 1), "page_size": models.QuotationPageSize,
			"can_edit": can(r, db, "quotations_edit"),
		})
	}
}

// POST /admin/quotations
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !can(r, db, "quotations_edit") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var in models.QuotationInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		id, err := models.CreateQuotation(r.Context(), db, in, userID(r))
		if err != nil {
			saveError(w, "create", err)
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]any{"id": id})
	}
}

// PUT /admin/quotations/{id}
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !can(r, db, "quotations_edit") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		var in models.QuotationInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		found, err := models.UpdateQuotation(r.Context(), db, id, in, userID(r))
		if err != nil {
			saveError(w, "update", err)
			return
		}
		if !found {
			http.Error(w, "quotation not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /admin/quotations/{id}
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !can(r, db, "quotations_edit") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		found, err := models.DeleteQuotation(r.Context(), db, id)
		if err != nil {
			log.Printf("quotations delete: %v", err)
			http.Error(w, "could not remove the quotation", http.StatusInternalServerError)
			return
		}
		if !found {
			http.Error(w, "quotation not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /admin/quotations/options?customers=<q>|products=<q>|staff=1 — the
// pickers on the form (quotations_edit, or view for the filters).
func OptionsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canView(r, db) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		q := r.URL.Query()
		var (
			out []models.QuotationOption
			err error
		)
		switch {
		case q.Has("staff"):
			out, err = models.QuotationStaff(r.Context(), db)
		case q.Has("customers"):
			out, err = models.QuotationCustomers(r.Context(), db, q.Get("customers"))
		case q.Has("products"):
			out, err = models.QuotationProducts(r.Context(), db, q.Get("products"))
		default:
			http.Error(w, "say which options: staff, customers or products", http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Printf("quotations options: %v", err)
			http.Error(w, "could not load the options", http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	}
}
