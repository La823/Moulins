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

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/mailer"
	"github.com/lavanyaarora/server/internal/margsync"
	"github.com/lavanyaarora/server/internal/models"
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

		orders, err := models.GetOrdersByUser(r.Context(), db, userID)
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

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(order)
	}
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
	OrderItemID string            `json:"order_item_id"`
	ProductName string            `json:"product_name"`
	MargLinked  bool              `json:"marg_linked"`
	Batches     []margBatchOption `json:"batches"`
	DefaultCode string            `json:"default_code,omitempty"`
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

		order, err := models.GetOrderByID(r.Context(), db, orderID)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}

		items := make([]margBatchOptionsItem, 0, len(order.Items))
		for _, oi := range order.Items {
			out := margBatchOptionsItem{OrderItemID: oi.ID.String(), ProductName: oi.ProductName, Batches: []margBatchOption{}}

			product, err := models.GetProductByID(r.Context(), db, oi.ProductID)
			if err != nil || product.MargCode == nil {
				items = append(items, out)
				continue
			}

			out.MargLinked = true
			batches, err := models.GetLiveMargBatchesByBaseCode(r.Context(), db, *product.MargCode)
			if err != nil {
				log.Printf("marg batch options error: %v", err)
				http.Error(w, "could not fetch marg batches", http.StatusInternalServerError)
				return
			}
			for _, b := range batches {
				out.Batches = append(out.Batches, margBatchOption{Code: b.Code, CurBatch: b.CurBatch, Exp: b.Exp, Stock: b.Stock})
			}
			if len(out.Batches) > 0 {
				out.DefaultCode = out.Batches[0].Code
			}
			items = append(items, out)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"items": items})
	}
}

// POST /admin/orders/{id}/push-to-marg — pushes a confirmed order's lines to
// Marg ERP via InsertOrderDetail, one call per line reusing the same
// Marg-side OrderID. body: {"items": [{"order_item_id": "...", "batch_code": "..."}]},
// one entry per order item (from the batch-options endpoint above).
func PushToMargHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}

		var body struct {
			Items []struct {
				OrderItemID string `json:"order_item_id"`
				BatchCode   string `json:"batch_code"`
			} `json:"items"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
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
		if order.MargOrderNo != nil {
			http.Error(w, "this order was already pushed to Marg", http.StatusConflict)
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

		batchByItem := make(map[string]string, len(body.Items))
		for _, it := range body.Items {
			batchByItem[it.OrderItemID] = it.BatchCode
		}
		missing := []string{}
		for _, oi := range order.Items {
			if batchByItem[oi.ID.String()] == "" {
				missing = append(missing, oi.ProductName)
			}
		}
		if len(missing) > 0 {
			http.Error(w, "missing a batch selection for: "+fmt.Sprint(missing), http.StatusBadRequest)
			return
		}

		creds, err := margsync.CredentialsFromEnv()
		if err != nil {
			http.Error(w, "marg sync is not configured: "+err.Error(), http.StatusServiceUnavailable)
			return
		}

		// OrderID is Marg-assigned, not something we generate: the first
		// line is sent with OrderID = "" (present, not omitted — the field
		// has no `omitempty`), Marg returns the real order number as
		// OrderNo, and every subsequent line reuses that returned value as
		// its own OrderID to link all the lines into one Marg order.
		//
		// The request's own OrderNo field is documented as always "0" on
		// insert, but Marg's live server rejects/collides on repeated "0"
		// submissions (confirmed by hands-on testing) — use a local
		// incrementing placeholder per line instead.
		var margOrderNo string
		for _, oi := range order.Items {
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
				http.Error(w, fmt.Sprintf("failed pushing %q to Marg: %v", oi.ProductName, err), http.StatusBadGateway)
				return
			}
			if margOrderNo == "" {
				margOrderNo = result.OrderNo
			}
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
