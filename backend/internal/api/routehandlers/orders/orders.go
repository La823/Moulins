package orders

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// POST /orders — customer places an order from their cart
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

		orderID, err := models.CreateOrder(r.Context(), db, userID, req)
		if err != nil {
			log.Printf("create order error: %v", err)
			http.Error(w, "could not create order", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]uuid.UUID{"order_id": orderID})
	}
}

// GET /orders — customer's own orders
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

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(order)
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
			fmt.Sprintf("Order status changed to %s", body.Status))

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

		_ = models.InsertOrderEvent(r.Context(), db, id, "delivery.updated", "Delivery details were updated")

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
			fmt.Sprintf("Item quantity changed to %d", body.Quantity))

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
		_ = models.InsertOrderEvent(r.Context(), db, orderID, "item.removed", "An item was removed from the order")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
	}
}
