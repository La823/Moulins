package orders

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/mailer"
	"github.com/lavanyaarora/server/internal/margsync"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/services"
	"github.com/lavanyaarora/server/internal/utils"
)

// orderStatusEmailable is the set of statuses that get a customer-facing
// email — "pending" (initial state) and "transferred" (internal handoff)
// aren't meaningful to a customer, so they're skipped.
var orderStatusEmailable = map[string]bool{
	"confirmed": true, "shipped": true, "delivered": true,
	"cancelled": true, "refunded": true,
}

// notifyOrderStatusEmail looks up the order's customer and, if they have an
// email on file, sends a best-effort status-change notification. Runs
// async so a slow/unconfigured mail provider never delays the response.
func notifyOrderStatusEmail(db *pgxpool.Pool, orderID uuid.UUID, status string) {
	if !orderStatusEmailable[status] {
		return
	}
	go func() {
		ctx := context.Background()
		order, err := models.GetOrderByID(ctx, db, orderID)
		if err != nil {
			log.Printf("order status email: failed to load order %s: %v", orderID, err)
			return
		}
		user, err := models.GetUserByID(ctx, db, order.UserID)
		if err != nil || user.Email == nil || *user.Email == "" {
			return
		}
		name := "there"
		if user.Username != nil && *user.Username != "" {
			name = *user.Username
		}
		data := buildOrderEmailData(order, user)
		data.CustomerName = name
		data.StatusLabel = orderStatusLabels[status]
		subject, body, err := mailer.Render(ctx, db, "order_status_changed", data)
		if err != nil {
			log.Printf("order status email: render failed: %v", err)
			return
		}
		if err := mailer.Send(ctx, mailer.ConfigFromEnv(), *user.Email, subject, body); err != nil {
			log.Printf("order status email: send failed: %v", err)
			return
		}
		if err := models.LogEmailSend(ctx, db, "order_status_changed", "email", "order", orderID, *user.Email, nil); err != nil {
			log.Printf("order status email: log send failed: %v", err)
		}
	}()
}

var orderStatusLabels = map[string]string{
	"confirmed": "Confirmed",
	"shipped":   "Shipped",
	"delivered": "Delivered",
	"cancelled": "Cancelled",
	"refunded":  "Refunded",
}

// orderEmailItem is one order line as shown in a customer email.
type orderEmailItem struct {
	ProductName string
	Quantity    int
}

// orderEmailData is the shared set of order fields every order-related
// email template can reference — built once per send from the loaded
// order + user, reused by both the "order placed" and "status changed"
// templates.
type orderEmailData struct {
	CustomerName    string
	OrderCode       string
	StatusLabel     string
	Items           []orderEmailItem
	ItemCount       int
	TransportMode   string
	ShippingAddress string
}

func buildOrderEmailData(order *models.Order, user *models.User) orderEmailData {
	items := make([]orderEmailItem, 0, len(order.Items))
	for _, it := range order.Items {
		items = append(items, orderEmailItem{ProductName: it.ProductName, Quantity: it.Quantity})
	}

	transportMode := order.TransportMode
	if transportMode != "" {
		transportMode = strings.ToUpper(transportMode[:1]) + transportMode[1:]
	}

	shippingAddress := ""
	if user.ShippingAddress != nil {
		shippingAddress = *user.ShippingAddress
	}

	return orderEmailData{
		OrderCode:       order.ID.String()[:8],
		Items:           items,
		ItemCount:       len(items),
		TransportMode:   transportMode,
		ShippingAddress: shippingAddress,
	}
}

// notifyStaffNewOrder pings every admin and employee that an order has come
// in — an in-app notification plus a push to their registered devices.
//
// Async and best-effort, like the order emails: a push failure must never
// stop an order being placed, and FCM is slow enough that doing it inline
// would be felt by whoever is checking out.
//
// excludeUserID keeps a staff member from being told about an order they
// just created themselves; pass uuid.Nil for a customer's own checkout.
func notifyStaffNewOrder(db *pgxpool.Pool, orderID uuid.UUID, excludeUserID uuid.UUID) {
	go func() {
		ctx := context.Background()
		order, err := models.GetOrderByID(ctx, db, orderID)
		if err != nil {
			log.Printf("staff order notification: failed to load order %s: %v", orderID, err)
			return
		}

		customer := "a customer"
		if user, err := models.GetUserByID(ctx, db, order.UserID); err == nil {
			if user.Username != nil && *user.Username != "" {
				customer = *user.Username
			} else if user.PhoneNumber != "" {
				customer = user.PhoneNumber
			}
		}

		items := len(order.Items)
		body := fmt.Sprintf("%s placed an order with %d item%s", customer, items, plural(items))

		staff, err := models.GetStaffUserIDs(ctx, db)
		if err != nil {
			log.Printf("staff order notification: failed to list staff: %v", err)
			return
		}

		// Points at the order's page in the panel; the app currently just
		// opens on tap, which is why this is not load-bearing.
		deepLink := "/panel/orders/" + orderID.String()
		for _, uid := range staff {
			if uid == excludeUserID {
				continue
			}
			if err := services.SendDirectNotification(ctx, db, uid, "New order received", body, &deepLink); err != nil {
				// One bad device must not stop the rest being told.
				log.Printf("staff order notification: send to %s failed: %v", uid, err)
			}
		}
	}()
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// notifyOrderPlacedEmail sends the initial order-received confirmation.
// Same async, best-effort pattern as notifyOrderStatusEmail.
func notifyOrderPlacedEmail(db *pgxpool.Pool, orderID uuid.UUID) {
	go func() {
		ctx := context.Background()
		order, err := models.GetOrderByID(ctx, db, orderID)
		if err != nil {
			log.Printf("order placed email: failed to load order %s: %v", orderID, err)
			return
		}
		user, err := models.GetUserByID(ctx, db, order.UserID)
		if err != nil || user.Email == nil || *user.Email == "" {
			return
		}
		name := "there"
		if user.Username != nil && *user.Username != "" {
			name = *user.Username
		}
		data := buildOrderEmailData(order, user)
		data.CustomerName = name
		subject, body, err := mailer.Render(ctx, db, "order_placed", data)
		if err != nil {
			log.Printf("order placed email: render failed: %v", err)
			return
		}
		if err := mailer.Send(ctx, mailer.ConfigFromEnv(), *user.Email, subject, body); err != nil {
			log.Printf("order placed email: send failed: %v", err)
			return
		}
		if err := models.LogEmailSend(ctx, db, "order_placed", "email", "order", orderID, *user.Email, nil); err != nil {
			log.Printf("order placed email: log send failed: %v", err)
		}
	}()
}

// GET /admin/orders/{id}/whatsapp-message?key=order_received_whatsapp — staff
// gets the rendered text for a manual whatsapp template plus the
// customer's phone, so the frontend can build a wa.me deep link (opens
// WhatsApp with the message prefilled — no WhatsApp Business API needed).
func OrderWhatsAppMessageHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}
		key := r.URL.Query().Get("key")
		if key == "" {
			key = "order_received_whatsapp"
		}

		order, err := models.GetOrderByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		user, err := models.GetUserByID(r.Context(), db, order.UserID)
		if err != nil {
			http.Error(w, "could not load customer", http.StatusInternalServerError)
			return
		}
		if user.PhoneNumber == "" {
			http.Error(w, "this partner has no phone number on file", http.StatusBadRequest)
			return
		}

		name := "there"
		if user.Username != nil && *user.Username != "" {
			name = *user.Username
		}
		data := buildOrderEmailData(order, user)
		data.CustomerName = name

		message, err := mailer.RenderText(r.Context(), db, key, data)
		if err != nil {
			log.Printf("order whatsapp message: render failed: %v", err)
			http.Error(w, "could not render message", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": message,
			"phone":   user.PhoneNumber,
		})
	}
}

// POST /admin/orders/{id}/whatsapp-sent — logs that staff opened the wa.me
// link for this order (called by the frontend right after window.open
// succeeds). There's no WhatsApp Business API here, so this is the
// closest signal to "sent" available — it can't confirm delivery, only
// that staff drafted and launched the message.
func MarkOrderWhatsAppSentHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		var body struct {
			Key   string `json:"key"`
			Phone string `json:"phone"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.Key == "" {
			body.Key = "order_received_whatsapp"
		}
		if body.Phone == "" {
			http.Error(w, "phone is required", http.StatusBadRequest)
			return
		}

		if err := models.LogEmailSend(r.Context(), db, body.Key, "whatsapp", "order", id, body.Phone, actorID(r)); err != nil {
			log.Printf("mark whatsapp sent: log failed: %v", err)
			http.Error(w, "could not log send", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "logged"})
	}
}

// GET /admin/orders/{id}/send-log — every recorded email/whatsapp send for
// this order, most recent first, so the order page can show "sent ✓" and
// when instead of staff guessing or re-sending blind.
func OrderSendLogHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}
		entries, err := models.ListEmailSendLog(r.Context(), db, "order", id)
		if err != nil {
			log.Printf("order send log error: %v", err)
			http.Error(w, "could not fetch send log", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"entries": entries})
	}
}

// GET /admin/orders/customers/search?q=... — customer picker for the
// "place order on behalf of a customer" admin form. Scoped to the orders
// package (rather than reusing /admin/users/search) so it's gated purely by
// orders_view, not the notifications/broadcast-list permissions that
// endpoint happens to require.
func SearchCustomersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 20
		if q == "" {
			limit = 300
		}
		users, err := models.SearchUsers(r.Context(), db, q, limit)
		if err != nil {
			log.Printf("search customers error: %v", err)
			http.Error(w, "could not search customers", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

// POST /orders — partner places an order from their cart
func CreateOrderHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req models.CreateOrderRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if len(req.Items) == 0 {
			http.Error(w, "order must have at least one item", http.StatusBadRequest)
			return
		}

		for _, item := range req.Items {
			if item.Quantity < 1 {
				http.Error(w, "quantity must be at least 1", http.StatusBadRequest)
				return
			}
		}

		// An invalid/omitted transport_mode isn't rejected here — CreateOrder
		// validates it against the admin-managed transport_modes list and
		// falls back to the partner's saved default if it doesn't check out.
		if req.TransportID != nil {
			transport, err := models.GetTransportByID(r.Context(), db, *req.TransportID)
			if err != nil {
				http.Error(w, "invalid transport_id", http.StatusBadRequest)
				return
			}
			if req.TransportMode != nil && *req.TransportMode != transport.Mode {
				http.Error(w, "transport_id does not belong to the given transport_mode", http.StatusBadRequest)
				return
			}
			// The chosen transport implies its mode — no need to also
			// require the caller to pass a matching transport_mode.
			req.TransportMode = &transport.Mode
		}

		orderID, err := models.CreateOrder(r.Context(), db, userID, req)
		if err != nil {
			log.Printf("create order error: %v", err)
			http.Error(w, "could not create order", http.StatusInternalServerError)
			return
		}
		notifyOrderPlacedEmail(db, orderID)
		// A customer's own checkout: nobody on staff is the author, so
		// everyone gets told.
		notifyStaffNewOrder(db, orderID, uuid.Nil)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"order_id": orderID})
	}
}

// POST /admin/orders — staff places an order on behalf of a customer.
// Mirrors CreateOrderHandler's validation, but the customer is named
// explicitly in the body (customer_id) instead of being taken from the
// caller's own JWT, and the acting staff member's id is recorded as the
// order.created event's actor rather than the customer's.
func CreateOrderForCustomerHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		staffIDStr, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		staffID, err := uuid.Parse(staffIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			CustomerID uuid.UUID `json:"customer_id"`
			models.CreateOrderRequest
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.CustomerID == uuid.Nil {
			http.Error(w, "customer_id is required", http.StatusBadRequest)
			return
		}
		customer, err := models.GetUserByID(r.Context(), db, req.CustomerID)
		if err != nil || customer == nil {
			http.Error(w, "customer not found", http.StatusBadRequest)
			return
		}
		if customer.Role != "partner" {
			http.Error(w, "customer_id must belong to a partner account", http.StatusBadRequest)
			return
		}

		if len(req.Items) == 0 {
			http.Error(w, "order must have at least one item", http.StatusBadRequest)
			return
		}
		for _, item := range req.Items {
			if item.Quantity < 1 {
				http.Error(w, "quantity must be at least 1", http.StatusBadRequest)
				return
			}
		}

		if req.TransportID != nil {
			transport, err := models.GetTransportByID(r.Context(), db, *req.TransportID)
			if err != nil {
				http.Error(w, "invalid transport_id", http.StatusBadRequest)
				return
			}
			if req.TransportMode != nil && *req.TransportMode != transport.Mode {
				http.Error(w, "transport_id does not belong to the given transport_mode", http.StatusBadRequest)
				return
			}
			req.TransportMode = &transport.Mode
		}

		orderID, err := models.CreateOrderForCustomer(r.Context(), db, req.CustomerID, staffID, req.CreateOrderRequest)
		if err != nil {
			log.Printf("create order for customer error: %v", err)
			http.Error(w, "could not create order", http.StatusInternalServerError)
			return
		}
		notifyOrderPlacedEmail(db, orderID)
		// Staff placed this one on a customer's behalf; they do not need
		// telling about their own action.
		notifyStaffNewOrder(db, orderID, staffID)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"order_id": orderID})
	}
}

// GET /orders — partner's own orders
func ListMyOrdersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userIDStr, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ownerID, err := models.ResolveOwnerID(r.Context(), db, userID)
		if err != nil {
			log.Printf("list my orders resolve owner error: %v", err)
			ownerID = userID
		}

		orders, err := models.GetOrdersByUser(r.Context(), db, ownerID)
		if err != nil {
			log.Printf("list my orders error: %v", err)
			http.Error(w, "could not fetch orders", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(orders)
	}
}

// GET /admin/orders — all orders (staff)
func ListAllOrdersHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		offset := (page - 1) * limit

		filters := models.OrderFilters{
			Status: r.URL.Query().Get("status"),
			Search: r.URL.Query().Get("search"),
			Sort:   r.URL.Query().Get("sort"),
		}

		orders, total, err := models.GetAllOrders(r.Context(), db, limit, offset, filters)
		if err != nil {
			log.Printf("list all orders error: %v", err)
			http.Error(w, "could not fetch orders", http.StatusInternalServerError)
			return
		}

		totalPages := int(math.Ceil(float64(total) / float64(limit)))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"orders":      orders,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		})
	}
}

// GET /orders/{id} — single order with items
func GetOrderHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		order, err := models.GetOrderByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		for i := range order.Photos {
			order.Photos[i].ImageURL = utils.GetPublicURL(order.Photos[i].ImageKey)
		}
		// This route is shared: partners and the mobile app read their own
		// orders through it, so what we charge has to come off before it
		// leaves. The fields are omitempty, so a stripped order carries no
		// pricing keys at all rather than nulls.
		stripInternalPricing(r, order)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(order)
	}
}

// stripInternalPricing removes the per-line rates and the order total unless
// the caller is staff. Rates are entered by us when an order is received and
// are not a customer-facing figure.
func stripInternalPricing(r *http.Request, order *models.Order) {
	if role, _ := r.Context().Value("role").(string); role == "admin" || role == "employee" {
		return
	}
	order.OrderTotal = nil
	order.ItemsTotal = nil
	order.Freight = nil
	for i := range order.Items {
		order.Items[i].Rate = nil
		order.Items[i].LineTotal = nil
		order.Items[i].Remarks = nil
	}
}

// GET /admin/orders/{id}/pdf — printable PDF summary of a finalized order
// (any status other than "pending"). Includes whichever Marg batch/expiry
// is currently selected per item, same as the order page's inline dropdown.
func OrderPDFHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		order, err := models.GetOrderByID(r.Context(), db, id)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if order.Status == "pending" {
			http.Error(w, "order is not finalized yet", http.StatusConflict)
			return
		}

		user, err := models.GetUserByID(r.Context(), db, order.UserID)
		if err != nil {
			http.Error(w, "could not load the order's customer", http.StatusInternalServerError)
			return
		}
		customerName := user.PhoneNumber
		if user.Username != nil && *user.Username != "" {
			customerName = *user.Username
		}

		// Batched product/batch lookups instead of one pair of queries per
		// item — see the same optimization in MargBatchOptionsHandler.
		productIDs := make([]uuid.UUID, len(order.Items))
		for i, oi := range order.Items {
			productIDs[i] = oi.ProductID
		}
		margCodeByProduct, err := models.GetProductMargCodesBatch(r.Context(), db, productIDs)
		if err != nil {
			log.Printf("order pdf marg batch lookup error: %v", err)
			margCodeByProduct = map[uuid.UUID]string{}
		}
		baseCodeSet := make(map[string]struct{}, len(margCodeByProduct))
		for _, code := range margCodeByProduct {
			baseCodeSet[code] = struct{}{}
		}
		baseCodes := make([]string, 0, len(baseCodeSet))
		for code := range baseCodeSet {
			baseCodes = append(baseCodes, code)
		}
		batchesByBaseCode, err := models.GetLiveMargBatchesByBaseCodes(r.Context(), db, baseCodes)
		if err != nil {
			log.Printf("order pdf batch lookup error: %v", err)
			batchesByBaseCode = map[string][]models.MargProductBatch{}
		}

		// The printed code is the warehouse inventory code, since the person
		// reading this sheet is picking stock off a rack. The Marg code is
		// still what the batch lookup is keyed on — it is Marg's identifier,
		// not ours — so the two are kept separate rather than one replacing
		// the other.
		inventoryCodeByProduct, err := models.GetInventoryCodesForProducts(r.Context(), db, productIDs)
		if err != nil {
			log.Printf("order pdf inventory code lookup error: %v", err)
			inventoryCodeByProduct = map[uuid.UUID]string{}
		}

		// Fallback MRP, used only where a line has no Marg batch to read one
		// from. Where a batch exists its own MRP wins, since that is the pack
		// actually shipping. Rate and line total come from the order line,
		// snapshotted when staff priced it, so a later price change never
		// rewrites what an order was charged at.
		mrpByProduct := map[uuid.UUID]float64{}
		if mrpRows, err := db.Query(r.Context(),
			`SELECT id, mrp FROM products WHERE id = ANY($1) AND mrp IS NOT NULL`, productIDs); err != nil {
			log.Printf("order pdf mrp lookup error: %v", err)
		} else {
			for mrpRows.Next() {
				var id uuid.UUID
				var mrp float64
				if err := mrpRows.Scan(&id, &mrp); err == nil {
					mrpByProduct[id] = mrp
				}
			}
			mrpRows.Close()
		}

		items := make([]utils.OrderPDFItem, 0, len(order.Items))
		for _, oi := range order.Items {
			pdfItem := utils.OrderPDFItem{
				ProductName: oi.ProductName,
				Quantity:    oi.Quantity,
				ProductCode: inventoryCodeByProduct[oi.ProductID],
				Rate:        oi.Rate,
				LineTotal:   oi.LineTotal,
			}
			if oi.Remarks != nil {
				pdfItem.Remarks = *oi.Remarks
			}
			if mrp, ok := mrpByProduct[oi.ProductID]; ok {
				m := mrp
				pdfItem.MRP = &m
			}
			if baseCode, ok := margCodeByProduct[oi.ProductID]; ok {
				if batches := batchesByBaseCode[baseCode]; len(batches) > 0 {
					// Prefer the explicitly saved selection; if none was ever
					// made, fall back to the same earliest-expiry (FEFO)
					// default the order page's dropdown shows before any
					// pick is saved — batches[0], since the batch list is
					// already sorted by expiry ascending.
					chosen := batches[0]
					if oi.SelectedBatchCode != nil && *oi.SelectedBatchCode != "" {
						for _, b := range batches {
							if b.Code == *oi.SelectedBatchCode {
								chosen = b
								break
							}
						}
					}
					pdfItem.Batch = chosen.CurBatch
					pdfItem.Expiry = formatBatchExpiryForPDF(chosen.Exp)
					// MRP comes from the batch being shipped, not the product.
					// Batch MRPs differ — DICMOLIN runs 103.13 / 103.00 /
					// 110.00 across its batches — so the printed price has to
					// be the one on the pack going out, matching the batch
					// code and expiry printed beside it.
					if chosen.MRP != nil {
						pdfItem.MRP = chosen.MRP
					}
				}
			}
			items = append(items, pdfItem)
		}

		var transportName string
		if order.TransportName != nil {
			transportName = *order.TransportName
		}

		// Who's printing this — recorded both in the reusable send-log (so
		// the order page can show "last printed by ... on ...") and baked
		// into the PDF itself.
		printerID := actorID(r)
		printedBy := "Staff"
		if printerID != nil {
			if printer, err := models.GetUserByID(r.Context(), db, *printerID); err == nil {
				if printer.Username != nil && *printer.Username != "" {
					printedBy = *printer.Username
				} else {
					printedBy = printer.PhoneNumber
				}
			}
		}
		printedAt := time.Now()
		if err := models.LogEmailSend(r.Context(), db, "order_pdf_printed", "pdf", "order", order.ID, "", printerID); err != nil {
			log.Printf("order pdf print log error: %v", err)
		}

		pdfBytes, err := utils.GenerateOrderPDF(utils.OrderPDFData{
			OrderNumber:   strings.ToUpper(order.ID.String()[:8]),
			Date:          order.CreatedAt.Format("2006-01-02"),
			Status:        order.Status,
			CustomerName:  customerName,
			TransportMode: order.TransportMode,
			TransportName: transportName,
			Notes:         stringOrEmpty(order.Notes),
			Items:         items,
			// Computed by GetOrderByID from the priced lines; nil when the
			// order has not been priced at all.
			ItemsTotal: order.ItemsTotal,
			Freight:    order.Freight,
			OrderTotal: order.OrderTotal,
			PrintedBy:  printedBy,
			PrintedAt:  printedAt.Format("02.01.2006 15:04"),
		})
		if err != nil {
			log.Printf("order pdf generation error: %v", err)
			http.Error(w, "could not generate PDF", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=order-%s.pdf", order.ID.String()[:8]))
		w.Write(pdfBytes)
	}
}

// formatBatchExpiryForPDF turns Marg's raw "YYYYMMDD" expiry into "MM/YYYY".
//
// The day is dropped deliberately: a batch expires at the end of its stated
// month, so printing a day implies a precision the date does not carry, and
// Marg stores the first of the month regardless.
func formatBatchExpiryForPDF(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) != 8 {
		return trimmed
	}
	return trimmed[4:6] + "/" + trimmed[0:4]
}

func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// POST /admin/orders/upload-url — get a presigned S3 URL for a bill photo
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

		uploadURL, key, err := utils.GeneratePresignedUploadURL(req.Filename)
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

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

// actorID returns the acting staff user's ID for order-history logging.
func actorID(r *http.Request) *uuid.UUID {
	id := getUserID(r)
	if id == uuid.Nil {
		return nil
	}
	return &id
}

// POST /admin/orders/{id}/tracking-upload-url — get a presigned S3 URL for a
// courier tracking screenshot/image, namespaced under this order in S3.
func TrackingUploadURLHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
			http.Error(w, "filename is required", http.StatusBadRequest)
			return
		}

		uploadURL, key, err := utils.GeneratePresignedOrderTrackingUploadURL(orderID.String(), req.Filename)
		if err != nil {
			log.Printf("presign tracking image error: %v", err)
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

// POST /admin/orders/{id}/photos — attach a bill photo or tracking image (staff)
func AddPhotoHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			ImageKey  string `json:"image_key"`
			PhotoType string `json:"photo_type"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ImageKey == "" {
			http.Error(w, "image_key is required", http.StatusBadRequest)
			return
		}
		if req.PhotoType != "" && req.PhotoType != "bill" && req.PhotoType != "tracking" {
			http.Error(w, "photo_type must be 'bill' or 'tracking'", http.StatusBadRequest)
			return
		}

		photoID, err := models.AddOrderPhoto(r.Context(), db, orderID, req.ImageKey, getUserID(r), req.PhotoType)
		if err != nil {
			log.Printf("add order photo error: %v", err)
			http.Error(w, "could not add photo", http.StatusInternalServerError)
			return
		}

		eventDesc := "A bill photo was attached to the order"
		if req.PhotoType == "tracking" {
			eventDesc = "A tracking image was attached to the order"
		}
		_ = models.InsertOrderEvent(r.Context(), db, orderID, "photo.added", eventDesc, actorID(r))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"id": photoID})
	}
}

// DELETE /admin/orders/photos/{photoId} — remove a bill photo (staff)
func DeletePhotoHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		photoID, err := uuid.Parse(mux.Vars(r)["photoId"])
		if err != nil {
			http.Error(w, "invalid photo id", http.StatusBadRequest)
			return
		}

		orderID, _ := models.GetOrderIDByPhotoID(r.Context(), db, photoID)

		if err := models.DeleteOrderPhoto(r.Context(), db, photoID); err != nil {
			log.Printf("delete order photo error: %v", err)
			http.Error(w, "could not delete photo", http.StatusInternalServerError)
			return
		}

		if orderID != uuid.Nil {
			_ = models.InsertOrderEvent(r.Context(), db, orderID, "photo.removed", "A bill photo was removed from the order", actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}

// PUT /admin/orders/{id}/status — update order status (staff)
func UpdateOrderStatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		valid := map[string]bool{
			"pending": true, "confirmed": true, "transferred": true,
			"shipped": true, "delivered": true, "cancelled": true,
			"refunded": true,
		}
		if !valid[body.Status] {
			http.Error(w, "invalid status", http.StatusBadRequest)
			return
		}

		if err := models.UpdateOrderStatus(r.Context(), db, id, body.Status); err != nil {
			log.Printf("update order status error: %v", err)
			http.Error(w, "could not update status", http.StatusInternalServerError)
			return
		}

		_ = models.InsertOrderEvent(r.Context(), db, id, "status."+body.Status,
			fmt.Sprintf("Order status changed to %s", body.Status), actorID(r))
		notifyOrderStatusEmail(db, id, body.Status)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": body.Status})
	}
}

// PUT /admin/orders/{id} — update delivery details (staff)
func UpdateOrderDetailsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		var req models.UpdateOrderDetailsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateOrderDetails(r.Context(), db, id, req); err != nil {
			log.Printf("update order details error: %v", err)
			http.Error(w, "could not update order details", http.StatusInternalServerError)
			return
		}

		_ = models.InsertOrderEvent(r.Context(), db, id, "delivery.updated", "Delivery details were updated", actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

// POST /admin/orders/{id}/items — add a product to an already-placed order
// (staff correcting an omission or adding something the customer didn't
// originally order). If the product is already on the order, bumps its
// quantity instead of creating a duplicate line.
func AddOrderItemHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		var body struct {
			ProductID   uuid.UUID `json:"product_id"`
			ProductName string    `json:"product_name"`
			Quantity    int       `json:"quantity"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.ProductID == uuid.Nil {
			http.Error(w, "product_id is required", http.StatusBadRequest)
			return
		}
		if body.ProductName == "" {
			http.Error(w, "product_name is required", http.StatusBadRequest)
			return
		}
		if body.Quantity < 1 {
			http.Error(w, "quantity must be at least 1", http.StatusBadRequest)
			return
		}

		itemID, err := models.AddOrderItem(r.Context(), db, orderID, body.ProductID, body.ProductName, body.Quantity)
		if err != nil {
			log.Printf("add order item error: %v", err)
			http.Error(w, "could not add item", http.StatusInternalServerError)
			return
		}

		_ = models.InsertOrderEvent(r.Context(), db, orderID, "item.added",
			fmt.Sprintf("Added %s (qty %d)", body.ProductName, body.Quantity), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"item_id": itemID})
	}
}

// PUT /admin/orders/{id}/items/{itemId} — update item quantity (staff)
func UpdateOrderItemHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		itemID, err := uuid.Parse(vars["itemId"])
		if err != nil {
			http.Error(w, "invalid item id", http.StatusBadRequest)
			return
		}

		var body struct {
			Quantity int `json:"quantity"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.Quantity < 1 {
			http.Error(w, "quantity must be at least 1", http.StatusBadRequest)
			return
		}

		if err := models.UpdateOrderItem(r.Context(), db, itemID, body.Quantity); err != nil {
			log.Printf("update order item error: %v", err)
			http.Error(w, "could not update item", http.StatusInternalServerError)
			return
		}

		orderID, _ := uuid.Parse(vars["id"])
		_ = models.InsertOrderEvent(r.Context(), db, orderID, "item.updated",
			fmt.Sprintf("Item quantity changed to %d", body.Quantity), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

// PUT /admin/orders/{id}/items/{itemId}/batch — staff-only pick of which
// Marg batch to fulfil this line from (shown as a dropdown inline on the
// order). Deliberately does not log an order_event — this is an internal
// fulfilment detail the partner never sees.
func UpdateOrderItemBatchHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		itemID, err := uuid.Parse(mux.Vars(r)["itemId"])
		if err != nil {
			http.Error(w, "invalid item id", http.StatusBadRequest)
			return
		}

		var body struct {
			BatchCode string `json:"batch_code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if err := models.UpdateOrderItemBatch(r.Context(), db, itemID, body.BatchCode); err != nil {
			log.Printf("update order item batch error: %v", err)
			http.Error(w, "could not update batch selection", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}

// PUT /admin/orders/{id}/rates — staff-only. Saves an order's changed line
// rates, line remarks and freight in one request, behind the order page's
// single Save button.
//
// Body: {"rates":   [{"item_id": "...", "rate": 12.5 | null}],
//        "remarks": [{"item_id": "...", "remarks": "..." | null}],
//        "freight": 150 | null}            <- omit to leave freight alone
//
// Like the batch pick, this logs no order_event: order events are
// partner-visible history, and what we charge is not something the partner
// reads off their order. A null rate or freight clears it back to not-entered;
// 0 would mean free, which is a different statement.
func UpdateOrderItemRatesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		var body struct {
			Rates   []models.OrderItemRate   `json:"rates"`
			Remarks []models.OrderItemRemark `json:"remarks"`
			// Raw so an absent key ("leave it") is distinguishable from an
			// explicit null ("clear it").
			Freight json.RawMessage `json:"freight"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		for _, rt := range body.Rates {
			if rt.Rate != nil && *rt.Rate < 0 {
				http.Error(w, "rate cannot be negative", http.StatusBadRequest)
				return
			}
		}

		setFreight := len(body.Freight) > 0
		var freight *float64
		if setFreight && string(body.Freight) != "null" {
			var f float64
			if err := json.Unmarshal(body.Freight, &f); err != nil || f < 0 {
				http.Error(w, "freight must be a non-negative number or null", http.StatusBadRequest)
				return
			}
			freight = &f
		}

		if err := models.SaveOrderPricing(r.Context(), db, orderID, body.Rates, body.Remarks, setFreight, freight); err != nil {
			log.Printf("save order pricing error: %v", err)
			http.Error(w, "could not save", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "saved"})
	}
}

// DELETE /admin/orders/{id}/items/{itemId} — remove item from order (staff)
func DeleteOrderItemHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		itemID, err := uuid.Parse(vars["itemId"])
		if err != nil {
			http.Error(w, "invalid item id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteOrderItem(r.Context(), db, itemID); err != nil {
			log.Printf("delete order item error: %v", err)
			http.Error(w, "could not delete item", http.StatusInternalServerError)
			return
		}

		orderID, _ := uuid.Parse(vars["id"])
		_ = models.InsertOrderEvent(r.Context(), db, orderID, "item.removed", "An item was removed from the order", actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}

type margBatchOption struct {
	Code     string  `json:"code"`
	CurBatch string  `json:"curbatch"`
	Exp      string  `json:"exp"`
	Stock    float64 `json:"stock"`
}

type margBatchOptionsItem struct {
	OrderItemID  string            `json:"order_item_id"`
	ProductName  string            `json:"product_name"`
	Quantity     int               `json:"quantity"`
	MargLinked   bool              `json:"marg_linked"`
	Batches      []margBatchOption `json:"batches"`
	DefaultCode  string            `json:"default_code,omitempty"`
	SelectedCode string            `json:"selected_code,omitempty"`
}

// GET /admin/orders/{id}/marg-batch-options — for each order item, every
// live batch of its Marg-linked product (earliest expiry first, FEFO), so
// the "Send to Marg" UI can offer a per-line batch picker defaulting to the
// earliest-expiry batch. Read-only — doesn't touch the order.
func MargBatchOptionsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		handlerStart := time.Now()
		order, err := models.GetOrderByID(r.Context(), db, orderID)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}

		// Batched instead of one product lookup + one batch-list query per
		// item — the per-item version was 2 sequential round-trips per
		// line (each ~300ms against the hosted DB), so a 42-item order
		// took ~27s end to end. Two queries total fixes that regardless of
		// order size.
		productIDs := make([]uuid.UUID, len(order.Items))
		for i, oi := range order.Items {
			productIDs[i] = oi.ProductID
		}
		margCodeByProduct, err := models.GetProductMargCodesBatch(r.Context(), db, productIDs)
		if err != nil {
			log.Printf("marg-batch-options[%s]: product marg_code batch lookup error: %v", orderID, err)
			http.Error(w, "could not fetch marg batches", http.StatusInternalServerError)
			return
		}

		baseCodeSet := make(map[string]struct{}, len(margCodeByProduct))
		for _, code := range margCodeByProduct {
			baseCodeSet[code] = struct{}{}
		}
		baseCodes := make([]string, 0, len(baseCodeSet))
		for code := range baseCodeSet {
			baseCodes = append(baseCodes, code)
		}
		batchesByBaseCode, err := models.GetLiveMargBatchesByBaseCodes(r.Context(), db, baseCodes)
		if err != nil {
			log.Printf("marg-batch-options[%s]: batch lookup error: %v", orderID, err)
			http.Error(w, "could not fetch marg batches", http.StatusInternalServerError)
			return
		}

		items := make([]margBatchOptionsItem, 0, len(order.Items))
		for _, oi := range order.Items {
			out := margBatchOptionsItem{OrderItemID: oi.ID.String(), ProductName: oi.ProductName, Quantity: oi.Quantity, Batches: []margBatchOption{}}
			if oi.SelectedBatchCode != nil {
				out.SelectedCode = *oi.SelectedBatchCode
			}

			baseCode, marglinked := margCodeByProduct[oi.ProductID]
			if !marglinked {
				items = append(items, out)
				continue
			}
			out.MargLinked = true

			for _, b := range batchesByBaseCode[baseCode] {
				out.Batches = append(out.Batches, margBatchOption{Code: b.Code, CurBatch: b.CurBatch, Exp: b.Exp, Stock: b.Stock})
			}
			if len(out.Batches) > 0 {
				out.DefaultCode = out.Batches[0].Code
			}
			items = append(items, out)
		}
		log.Printf("marg-batch-options[%s]: %d items resolved in %s", orderID, len(items), time.Since(handlerStart))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"items": items})
	}
}

// POST /admin/orders/{id}/push-to-marg — pushes a confirmed order's lines to
// Marg ERP via InsertOrderDetail, one call per line reusing the same
// Marg-side OrderID. Batch selection is no longer taken from the request
// body — it's read from each item's selected_batch_code, set ahead of time
// via the inline batch dropdown on the order page (UpdateOrderItemBatchHandler).
// This endpoint is now just "send whatever is currently selected."
func PushToMargHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		order, err := models.GetOrderByID(r.Context(), db, orderID)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if order.Status != "confirmed" {
			http.Error(w, "only confirmed orders can be pushed to Marg", http.StatusConflict)
			return
		}

		// Resume semantics: only items with no marg_pushed_at yet actually
		// need sending. This is what makes a retry after a partial failure
		// safe — previously a failure partway through an order (e.g. a
		// sequence/OrderNo collision on line 19 of 42) left no record of
		// which lines had already gone through, so any retry resent every
		// line from scratch and duplicated whatever had already succeeded.
		pending := make([]models.OrderItem, 0, len(order.Items))
		for _, oi := range order.Items {
			if oi.MargPushedAt == nil {
				pending = append(pending, oi)
			}
		}
		if len(pending) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"marg_order_no":  order.MargOrderNo,
				"already_pushed": true,
			})
			return
		}

		user, err := models.GetUserByID(r.Context(), db, order.UserID)
		if err != nil {
			http.Error(w, "could not load the order's partner", http.StatusInternalServerError)
			return
		}
		if user.Rid == nil || *user.Rid == "" {
			http.Error(w, "this partner is not linked to a Marg party — set their RID first", http.StatusBadRequest)
			return
		}

		// Prefer each item's explicitly saved selection; if none was ever
		// made, fall back to the same earliest-expiry (FEFO) default the
		// order page's dropdown shows before any pick is saved — matching
		// what the "Send to Marg" preview displays, so the push always
		// sends exactly what staff saw on screen. Only genuinely blocks on
		// items with no live batches to fall back to at all.
		// Batched lookups (not one product+batch query per item) — see the
		// same optimization/reasoning in MargBatchOptionsHandler.
		needsFallback := make([]models.OrderItem, 0, len(pending))
		batchByItem := make(map[string]string, len(pending))
		for _, oi := range pending {
			if oi.SelectedBatchCode != nil && *oi.SelectedBatchCode != "" {
				batchByItem[oi.ID.String()] = *oi.SelectedBatchCode
				continue
			}
			needsFallback = append(needsFallback, oi)
		}

		missing := []string{}
		if len(needsFallback) > 0 {
			productIDs := make([]uuid.UUID, len(needsFallback))
			for i, oi := range needsFallback {
				productIDs[i] = oi.ProductID
			}
			margCodeByProduct, err := models.GetProductMargCodesBatch(r.Context(), db, productIDs)
			if err != nil {
				log.Printf("push-to-marg[%s]: product marg_code batch lookup error: %v", orderID, err)
				http.Error(w, "could not fetch marg batches", http.StatusInternalServerError)
				return
			}
			baseCodeSet := make(map[string]struct{}, len(margCodeByProduct))
			for _, code := range margCodeByProduct {
				baseCodeSet[code] = struct{}{}
			}
			baseCodes := make([]string, 0, len(baseCodeSet))
			for code := range baseCodeSet {
				baseCodes = append(baseCodes, code)
			}
			batchesByBaseCode, err := models.GetLiveMargBatchesByBaseCodes(r.Context(), db, baseCodes)
			if err != nil {
				log.Printf("push-to-marg[%s]: batch lookup error: %v", orderID, err)
				http.Error(w, "could not fetch marg batches", http.StatusInternalServerError)
				return
			}

			for _, oi := range needsFallback {
				baseCode, marglinked := margCodeByProduct[oi.ProductID]
				batches := batchesByBaseCode[baseCode]
				if !marglinked || len(batches) == 0 {
					missing = append(missing, oi.ProductName)
					continue
				}
				batchByItem[oi.ID.String()] = batches[0].Code
			}
		}
		if len(missing) > 0 {
			http.Error(w, "no live Marg batch available for: "+fmt.Sprint(missing), http.StatusBadRequest)
			return
		}

		creds, err := margsync.CredentialsFromEnv()
		if err != nil {
			http.Error(w, "marg sync is not configured: "+err.Error(), http.StatusServiceUnavailable)
			return
		}

		// OrderID is Marg-assigned, not something we generate: the first
		// line of an order is sent with OrderID = "" (present, not
		// omitted — the field has no `omitempty`), Marg returns the real
		// order number as OrderNo, and every subsequent line reuses that
		// returned value as its own OrderID to link all the lines into
		// one Marg order. If this is a resume (some items already pushed
		// in an earlier attempt), reuse the OrderID persisted from that
		// attempt instead of starting a new Marg-side order.
		//
		// The request's own OrderNo field is documented as always "0" on
		// insert, but Marg's live server rejects/collides on repeated "0"
		// submissions (confirmed by hands-on testing) — use a local
		// incrementing placeholder per line instead.
		margOrderNo := ""
		if order.MargInsertOrderID != nil {
			margOrderNo = *order.MargInsertOrderID
		}
		marker := 0
		for _, oi := range pending {
			var reqOrderNo int
			if err := db.QueryRow(r.Context(), `SELECT nextval('marg_order_no_seq')`).Scan(&reqOrderNo); err != nil {
				log.Printf("marg order no sequence error: %v", err)
				http.Error(w, "could not generate marg order no", http.StatusInternalServerError)
				return
			}
			line := margsync.InsertOrderLineRequest{
				OrderID:           margOrderNo,
				OrderNo:           strconv.Itoa(reqOrderNo),
				CustomerID:        *user.Rid,
				MargID:            strconv.Itoa(creds.MargID),
				Type:              "S",
				Sid:               "323657",
				ProductCode:       batchByItem[oi.ID.String()],
				Quantity:          strconv.Itoa(oi.Quantity),
				Free:              "0",
				GpsID:             "0",
				UserType:          "1",
				Points:            "0.00",
				Discounts:         "0.00",
				PaymentMode:       "1",
				PaymentModeAmount: "0",
				CompanyCode:       creds.CompanyCode,
				OrderFrom:         creds.CompanyCode,
			}
			result, err := margsync.InsertOrderDetail(creds, line)
			if err != nil {
				log.Printf("marg push failed for order %s, item %s: %v", orderID, oi.ProductName, err)
				http.Error(w, fmt.Sprintf("failed pushing %q to Marg: %v — %d of %d lines in this attempt already went through and are marked sent; retrying will only resend what's left", oi.ProductName, err, marker, len(pending)), http.StatusBadGateway)
				return
			}
			// Persisted immediately, not batched until the whole order
			// finishes — this line is what makes the failure path above
			// safe to retry instead of duplicating already-sent lines.
			if err := models.MarkOrderItemPushedToMarg(r.Context(), db, oi.ID); err != nil {
				log.Printf("mark order item pushed to marg error (order %s, item %s): %v", orderID, oi.ID, err)
			}
			if margOrderNo == "" {
				margOrderNo = result.OrderNo
				if err := models.SetOrderMargInsertOrderID(r.Context(), db, orderID, margOrderNo); err != nil {
					log.Printf("set marg insert order id error: %v", err)
				}
			}
			marker++
		}

		if err := models.MarkOrderPushedToMarg(r.Context(), db, orderID, margOrderNo); err != nil {
			log.Printf("mark order pushed to marg error: %v", err)
			http.Error(w, "pushed to marg but failed to save the result — check Marg directly", http.StatusInternalServerError)
			return
		}
		_ = models.InsertOrderEvent(r.Context(), db, orderID, "marg.pushed",
			fmt.Sprintf("Order pushed to Marg ERP (Order No. %s)", margOrderNo), actorID(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"marg_order_no": margOrderNo,
		})
	}
}
