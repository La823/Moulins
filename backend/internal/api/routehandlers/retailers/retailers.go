// Package retailers serves partners' retailers: the partner adds and
// manages them, and handles the orders they place (accept with rates,
// decline, dispatch, deliver, forward to Moulins); the retailer places,
// follows and cancels their own orders. See 180_retailers.sql.
package retailers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/middleware"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/services"
	"github.com/lavanyaarora/server/internal/utils"
)

// Shown to people as they are.
const (
	msgPartnersOnly   = "Only partner accounts can manage retailers."
	msgRetailersOnly  = "Only retailer accounts can place orders with a partner."
	msgBadRequest     = "The request could not be read. Please update the app and try again."
	msgNameRequired   = "Please enter the retailer's name."
	msgPhoneInvalid   = "Please enter a valid 10-digit mobile number."
	msgPhoneTaken     = "This phone number is already registered to another account. Please use a phone number that has not been registered before."
	msgNotFound       = "This retailer could not be found."
	msgOrderNotFound  = "This order could not be found."
	msgOrderState     = "This order can no longer be changed in this way."
	msgNoItems        = "Please add at least one product to the order."
	msgBadQuantity    = "Each product must have a quantity of at least 1."
	msgProductHidden  = "One of the products is no longer available. Please remove it from your cart and try again."
	msgNoPartner      = "Your retailer account is not linked to a partner. Please contact your partner."
	msgRatesRequired  = "Please enter a rate for every product in the order."
	msgAlreadyForward = "This order has already been sent to Moulins."
	msgServerError    = "This could not be completed at this time. Please try again in a few minutes."
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func me(r *http.Request) (uuid.UUID, string) {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	role, _ := r.Context().Value("role").(string)
	return id, role
}

func partnerOnly(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, role := me(r)
	if role != "partner" {
		http.Error(w, msgPartnersOnly, http.StatusForbidden)
		return uuid.Nil, false
	}
	return id, true
}

func pathID(w http.ResponseWriter, r *http.Request, msg string) (uuid.UUID, bool) {
	id, err := uuid.Parse(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, msg, http.StatusNotFound)
		return uuid.Nil, false
	}
	return id, true
}

// tenDigits strips +91 / spaces / dashes; "" if what's left isn't 10 digits.
func tenDigits(s string) string {
	s = strings.NewReplacer(" ", "", "-", "").Replace(strings.TrimSpace(s))
	s = strings.TrimPrefix(s, "+91")
	if len(s) == 12 && strings.HasPrefix(s, "91") {
		s = s[2:]
	}
	if len(s) != 10 {
		return ""
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return ""
		}
	}
	return s
}

func readInput(w http.ResponseWriter, r *http.Request) (models.RetailerInput, bool) {
	var in models.RetailerInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, msgBadRequest, http.StatusBadRequest)
		return in, false
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		http.Error(w, msgNameRequired, http.StatusBadRequest)
		return in, false
	}
	for _, p := range []**string{&in.ShopName, &in.Address, &in.City} {
		if *p != nil {
			if v := strings.TrimSpace(**p); v == "" {
				*p = nil
			} else {
				*p = &v
			}
		}
	}
	return in, true
}

// GET /retailers — the partner's retailers.
func ListHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		list, err := models.ListRetailers(r.Context(), db, partner)
		if err != nil {
			log.Printf("list retailers: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// POST /retailers — adds a retailer; their phone number is their login and
// first password. Re-adding one this partner removed brings them back.
func CreateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		in, ok := readInput(w, r)
		if !ok {
			return
		}
		if in.Phone = tenDigits(in.Phone); in.Phone == "" {
			http.Error(w, msgPhoneInvalid, http.StatusBadRequest)
			return
		}
		existing, _, _, _, found, err := models.PhoneOwner(r.Context(), db, in.Phone)
		if err != nil {
			log.Printf("create retailer: phone lookup: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		if found {
			removedHere, err := models.RemovedRetailerOf(r.Context(), db, partner, existing)
			if err != nil || !removedHere {
				http.Error(w, msgPhoneTaken, http.StatusConflict)
				return
			}
			if err := models.RestoreRetailer(r.Context(), db, partner, existing, in); err != nil {
				log.Printf("restore retailer %s: %v", existing, err)
				http.Error(w, msgServerError, http.StatusInternalServerError)
				return
			}
			middleware.RestoreUser(existing)
			writeJSON(w, http.StatusCreated, map[string]any{"id": existing, "restored": true})
			return
		}
		id, err := models.CreateRetailer(r.Context(), db, partner, in)
		if err != nil {
			if strings.Contains(err.Error(), "users_phone_number_key") {
				http.Error(w, msgPhoneTaken, http.StatusConflict)
				return
			}
			log.Printf("create retailer: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": id})
	}
}

func retailerErr(w http.ResponseWriter, err error, what string) {
	if errors.Is(err, models.ErrNotYourRetailer) {
		http.Error(w, msgNotFound, http.StatusNotFound)
		return
	}
	log.Printf("%s: %v", what, err)
	http.Error(w, msgServerError, http.StatusInternalServerError)
}

// PUT /retailers/{id} — name and shop details (the phone is the login).
func UpdateHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgNotFound)
		if !ok {
			return
		}
		in, ok := readInput(w, r)
		if !ok {
			return
		}
		if err := models.UpdateRetailer(r.Context(), db, partner, id, in); err != nil {
			retailerErr(w, err, "update retailer")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "The retailer's details have been updated."})
	}
}

// DELETE /retailers/{id} — removes the retailer and closes their login;
// their orders are kept.
func DeleteHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgNotFound)
		if !ok {
			return
		}
		if err := models.RemoveRetailer(r.Context(), db, partner, id); err != nil {
			retailerErr(w, err, "remove retailer")
			return
		}
		middleware.RevokeUser(id)
		writeJSON(w, http.StatusOK, map[string]string{"message": "The retailer has been removed."})
	}
}

// POST /retailers/{id}/reset-password — back to their phone number.
func ResetPasswordHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgNotFound)
		if !ok {
			return
		}
		if err := models.ResetRetailerPassword(r.Context(), db, partner, id); err != nil {
			retailerErr(w, err, "reset retailer password")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "The password has been reset to the retailer's phone number."})
	}
}

// ---- GST number and drug licences ----

var gstinPattern = regexp.MustCompile(`^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$`)

// GET /retailers/{id}/documents
func ListDocumentsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgNotFound)
		if !ok {
			return
		}
		docs, err := models.ListRetailerDocuments(r.Context(), db, partner, id)
		if err != nil {
			retailerErr(w, err, "list retailer documents")
			return
		}
		writeJSON(w, http.StatusOK, docs)
	}
}

// POST /retailers/{id}/documents {kind: gst|dl, number, details}
// details is the government portal's answer from a check (GST / DL lookup);
// without it the number is saved unchecked.
func SaveDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgNotFound)
		if !ok {
			return
		}
		var body struct {
			Kind    string          `json:"kind"`
			Number  string          `json:"number"`
			Details json.RawMessage `json:"details"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, msgBadRequest, http.StatusBadRequest)
			return
		}
		number := strings.ToUpper(strings.Join(strings.Fields(body.Number), ""))
		switch body.Kind {
		case "gst":
			if !gstinPattern.MatchString(number) {
				http.Error(w, "Please enter a valid 15-character GST number.", http.StatusBadRequest)
				return
			}
		case "dl":
			number = strings.ToUpper(strings.TrimSpace(body.Number))
			if number == "" || len(number) > 80 {
				http.Error(w, "Please enter the drug licence number.", http.StatusBadRequest)
				return
			}
		default:
			http.Error(w, msgBadRequest, http.StatusBadRequest)
			return
		}
		docID, err := models.SaveRetailerDocument(r.Context(), db, partner, id, body.Kind, number, body.Details)
		if err != nil {
			retailerErr(w, err, "save retailer document")
			return
		}
		msg := "The number has been saved."
		if len(body.Details) > 0 && string(body.Details) != "null" {
			msg = "The number has been checked and saved."
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": docID, "message": msg})
	}
}

// DELETE /retailers/{id}/documents/{docId}
func DeleteDocumentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgNotFound)
		if !ok {
			return
		}
		docID, err := uuid.Parse(mux.Vars(r)["docId"])
		if err != nil {
			http.Error(w, msgNotFound, http.StatusNotFound)
			return
		}
		if err := models.DeleteRetailerDocument(r.Context(), db, partner, id, docID); err != nil {
			retailerErr(w, err, "delete retailer document")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "The number has been removed."})
	}
}

// ---- orders ----

// POST /retailer-orders — a retailer orders from their partner (usually
// their whole cart, which is emptied).
func PlaceOrderHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		retailer, role := me(r)
		if role != models.RoleRetailer {
			http.Error(w, msgRetailersOnly, http.StatusForbidden)
			return
		}
		var body struct {
			Items []models.PlaceRetailerOrderItem `json:"items"`
			Notes *string                         `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, msgBadRequest, http.StatusBadRequest)
			return
		}
		if len(body.Items) == 0 {
			http.Error(w, msgNoItems, http.StatusBadRequest)
			return
		}
		for _, it := range body.Items {
			if it.Quantity < 1 {
				http.Error(w, msgBadQuantity, http.StatusBadRequest)
				return
			}
		}
		if body.Notes != nil && strings.TrimSpace(*body.Notes) == "" {
			body.Notes = nil
		}
		partner, ok, err := models.RetailerPartner(r.Context(), db, retailer)
		if err != nil {
			log.Printf("place retailer order: partner: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, msgNoPartner, http.StatusForbidden)
			return
		}
		id, no, err := models.PlaceRetailerOrder(r.Context(), db, retailer, partner, body.Items, body.Notes)
		if err != nil {
			if errors.Is(err, models.ErrProductNotVisible) {
				http.Error(w, msgProductHidden, http.StatusBadRequest)
				return
			}
			log.Printf("place retailer order: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		go notifyPartnerNewOrder(db, id, no, partner, retailer, len(body.Items))
		writeJSON(w, http.StatusCreated, map[string]any{"id": id, "order_no": no})
	}
}

// GET /retailer-orders — the retailer's own orders (?status= to filter).
func ListMineHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		retailer, role := me(r)
		if role != models.RoleRetailer {
			http.Error(w, msgRetailersOnly, http.StatusForbidden)
			return
		}
		list, err := models.ListRetailerOrders(r.Context(), db, retailer, true, r.URL.Query().Get("status"))
		if err != nil {
			log.Printf("list my retailer orders: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// GET /retailer-orders/incoming — orders the partner's retailers placed.
func ListIncomingHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		list, err := models.ListRetailerOrders(r.Context(), db, partner, false, r.URL.Query().Get("status"))
		if err != nil {
			log.Printf("list incoming retailer orders: %v", err)
			http.Error(w, msgServerError, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// GET /retailer-orders/{id} — for its retailer or its partner.
func GetOrderHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, _ := me(r)
		id, ok := pathID(w, r, msgOrderNotFound)
		if !ok {
			return
		}
		o, err := models.GetRetailerOrder(r.Context(), db, id, user)
		if err != nil {
			orderErr(w, err, "get retailer order")
			return
		}
		writeJSON(w, http.StatusOK, o)
	}
}

func orderErr(w http.ResponseWriter, err error, what string) {
	switch {
	case errors.Is(err, models.ErrRetailerOrderNotFound):
		http.Error(w, msgOrderNotFound, http.StatusNotFound)
	case errors.Is(err, models.ErrRetailerOrderState):
		http.Error(w, msgOrderState, http.StatusConflict)
	case errors.Is(err, models.ErrAlreadyForwarded):
		http.Error(w, msgAlreadyForward, http.StatusConflict)
	default:
		log.Printf("%s: %v", what, err)
		http.Error(w, msgServerError, http.StatusInternalServerError)
	}
}

// PUT /retailer-orders/{id}/cancel — the retailer, before the partner accepts.
func CancelHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		retailer, role := me(r)
		if role != models.RoleRetailer {
			http.Error(w, msgRetailersOnly, http.StatusForbidden)
			return
		}
		id, ok := pathID(w, r, msgOrderNotFound)
		if !ok {
			return
		}
		if err := models.CancelRetailerOrder(r.Context(), db, id, retailer); err != nil {
			orderErr(w, err, "cancel retailer order")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "The order has been cancelled."})
	}
}

// PUT /retailer-orders/{id}/accept {rates: {item_id: rate}, note}
func AcceptHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgOrderNotFound)
		if !ok {
			return
		}
		var body struct {
			Rates map[uuid.UUID]float64 `json:"rates"`
			Note  string                `json:"note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, msgBadRequest, http.StatusBadRequest)
			return
		}
		o, err := models.GetRetailerOrder(r.Context(), db, id, partner)
		if err != nil || o.PartnerID != partner {
			orderErr(w, models.ErrRetailerOrderNotFound, "accept retailer order")
			return
		}
		for _, it := range o.Items {
			if v, ok := body.Rates[it.ID]; !ok || v < 0 {
				http.Error(w, msgRatesRequired, http.StatusBadRequest)
				return
			}
		}
		if err := models.AcceptRetailerOrder(r.Context(), db, id, partner, body.Rates, strings.TrimSpace(body.Note)); err != nil {
			orderErr(w, err, "accept retailer order")
			return
		}
		go notifyRetailer(db, id, "accepted")
		writeJSON(w, http.StatusOK, map[string]string{"message": "The order has been accepted."})
	}
}

// statusHandler is reject / dispatch / deliver: {note} (the reason, for a rejection).
func statusHandler(db *pgxpool.Pool, change func(context.Context, *pgxpool.Pool, uuid.UUID, uuid.UUID, string) error, status, done string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgOrderNotFound)
		if !ok {
			return
		}
		var body struct {
			Note string `json:"note"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if err := change(r.Context(), db, id, partner, strings.TrimSpace(body.Note)); err != nil {
			orderErr(w, err, status+" retailer order")
			return
		}
		go notifyRetailer(db, id, status)
		writeJSON(w, http.StatusOK, map[string]string{"message": done})
	}
}

func RejectHandler(db *pgxpool.Pool) http.HandlerFunc {
	return statusHandler(db, models.RejectRetailerOrder, "rejected", "The order has been declined.")
}

func DispatchHandler(db *pgxpool.Pool) http.HandlerFunc {
	return statusHandler(db, models.DispatchRetailerOrder, "dispatched", "The order has been marked as dispatched.")
}

func DeliverHandler(db *pgxpool.Pool) http.HandlerFunc {
	return statusHandler(db, models.DeliverRetailerOrder, "delivered", "The order has been marked as delivered.")
}

// POST /retailer-orders/{id}/forward — places the order's products as the
// partner's own order to Moulins.
// notifyStaff is orders.NotifyNewPartnerOrder (passed in: orders imports nothing of this package).
func ForwardHandler(db *pgxpool.Pool, notifyStaff func(db *pgxpool.Pool, orderID, partnerID uuid.UUID)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		partner, ok := partnerOnly(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, msgOrderNotFound)
		if !ok {
			return
		}
		orderID, err := models.ForwardRetailerOrder(r.Context(), db, id, partner)
		if err != nil {
			orderErr(w, err, "forward retailer order")
			return
		}
		notifyStaff(db, orderID, partner)
		writeJSON(w, http.StatusCreated, map[string]any{
			"order_id": orderID,
			"message":  "The order has been sent to Moulins as your order.",
		})
	}
}

// ---- notifications ----

func notifyPartnerNewOrder(db *pgxpool.Pool, orderID uuid.UUID, no int64, partner, retailer uuid.UUID, items int) {
	ctx := context.Background()
	o, err := models.GetRetailerOrder(ctx, db, orderID, partner)
	if err != nil {
		log.Printf("retailer order notify: %v", err)
		return
	}
	who := o.RetailerName
	if o.ShopName != nil && *o.ShopName != "" {
		who = *o.ShopName
	}
	plural := "s"
	if items == 1 {
		plural = ""
	}
	link := fmt.Sprintf("/partner-panel/retailer-orders/%s", orderID)
	body := fmt.Sprintf("%s placed order RO-%d with %d product%s.", who, no, items, plural)
	if err := services.SendDirectNotificationOn(ctx, db, utils.OrderPush, partner, "New order from a retailer", body, &link); err != nil {
		log.Printf("retailer order notify partner: %v", err)
	}
}

var statusWords = map[string]string{
	"accepted":   "has been accepted",
	"rejected":   "has been declined",
	"dispatched": "has been dispatched",
	"delivered":  "has been delivered",
}

func notifyRetailer(db *pgxpool.Pool, orderID uuid.UUID, status string) {
	ctx := context.Background()
	var retailer uuid.UUID
	var no int64
	var partnerName string
	err := db.QueryRow(ctx, `
		SELECT o.retailer_id, o.order_no, COALESCE(u.username, u.phone_number)
		FROM retailer_orders o JOIN users u ON u.id = o.partner_id WHERE o.id = $1`, orderID).Scan(&retailer, &no, &partnerName)
	if err != nil {
		log.Printf("retailer status notify: %v", err)
		return
	}
	link := fmt.Sprintf("/retailer-panel/orders/%s", orderID)
	body := fmt.Sprintf("Your order RO-%d %s by %s.", no, statusWords[status], partnerName)
	if err := services.SendDirectNotification(ctx, db, retailer, "Order update", body, &link); err != nil {
		log.Printf("retailer status notify: %v", err)
	}
}
