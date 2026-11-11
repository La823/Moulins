package orders

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

// PUT /admin/orders/{id}/transport — staff change how an order is sent: its
// delivery mode (one of the transport modes) and, optionally, the
// transporter of that mode. Logged on the order's history, which the
// customer sees.
//
// Body: {"transport_mode": "courier", "transport_id": "<uuid>" | null}
func UpdateOrderTransportHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid order id", http.StatusBadRequest)
			return
		}
		var body struct {
			TransportMode string     `json:"transport_mode"`
			TransportID   *uuid.UUID `json:"transport_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		body.TransportMode = strings.TrimSpace(body.TransportMode)
		valid, err := models.IsValidTransportMode(r.Context(), db, body.TransportMode)
		if err != nil {
			http.Error(w, "could not check the delivery mode", http.StatusInternalServerError)
			return
		}
		if !valid {
			http.Error(w, "Please choose one of the listed delivery modes.", http.StatusBadRequest)
			return
		}
		var newName *string
		if body.TransportID != nil {
			var name string
			err := db.QueryRow(r.Context(), `SELECT name FROM transports WHERE id = $1 AND mode = $2`,
				*body.TransportID, body.TransportMode).Scan(&name)
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "That transporter is not listed under this delivery mode.", http.StatusBadRequest)
				return
			}
			if err != nil {
				http.Error(w, "could not check the transporter", http.StatusInternalServerError)
				return
			}
			newName = &name
		}

		// what it was, for the history
		var oldMode string
		var oldName *string
		err = db.QueryRow(r.Context(), `
			SELECT COALESCE(o.transport_mode, ''), t.name FROM orders o
			LEFT JOIN transports t ON t.id = o.transport_id WHERE o.id = $1`, id).Scan(&oldMode, &oldName)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "could not load the order", http.StatusInternalServerError)
			return
		}

		if _, err := db.Exec(r.Context(),
			`UPDATE orders SET transport_mode = $1, transport_id = $2, updated_at = NOW() WHERE id = $3`,
			body.TransportMode, body.TransportID, id); err != nil {
			log.Printf("update order transport %s: %v", id, err)
			http.Error(w, "could not change the delivery mode", http.StatusInternalServerError)
			return
		}

		describe := func(mode string, name *string) string {
			s := mode
			if s == "" {
				s = "—"
			} else {
				s = strings.ToUpper(s[:1]) + s[1:]
			}
			if name != nil && *name != "" {
				s += " (" + *name + ")"
			}
			return s
		}
		before, after := describe(oldMode, oldName), describe(body.TransportMode, newName)
		if before != after {
			_ = models.InsertOrderEvent(r.Context(), db, id, "delivery.updated",
				fmt.Sprintf("Delivery mode changed: %s → %s", before, after), actorID(r))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "updated"})
	}
}
