package messages

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/services"
	"github.com/lavanyaarora/server/internal/utils"
)

func getUserID(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(r.Context().Value("user_id").(string))
	return id
}

func ListConversationsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conversations, err := models.GetConversations(r.Context(), db, getUserID(r))
		if err != nil {
			log.Printf("list conversations error: %v", err)
			http.Error(w, "could not fetch conversations", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(conversations)
	}
}

func HistoryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		otherID, err := uuid.Parse(mux.Vars(r)["userId"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		userID := getUserID(r)
		allowed, err := models.CanMessage(r.Context(), db, userID, otherID)
		if err != nil {
			log.Printf("can message check error: %v", err)
			http.Error(w, "could not verify permission", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "not authorized to message this user", http.StatusForbidden)
			return
		}

		limit := 50
		if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 200 {
			limit = l
		}

		history, err := models.GetConversationHistory(r.Context(), db, userID, otherID, limit)
		if err != nil {
			log.Printf("get history error: %v", err)
			http.Error(w, "could not fetch history", http.StatusInternalServerError)
			return
		}

		if err := models.MarkMessagesRead(r.Context(), db, userID, otherID); err != nil {
			log.Printf("mark read error: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)
	}
}

func MarkReadHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		otherID, err := uuid.Parse(mux.Vars(r)["userId"])
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}
		if err := models.MarkMessagesRead(r.Context(), db, getUserID(r), otherID); err != nil {
			log.Printf("mark read error: %v", err)
			http.Error(w, "could not mark read", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "marked read"})
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type wsIncoming struct {
	To   uuid.UUID `json:"to"`
	Body string    `json:"body"`
}

// WebSocketHandler authenticates via a ?token= query param (browsers'
// WebSocket API cannot set an Authorization header), then relays messages
// in both directions: incoming {to, body} payloads are persisted and
// delivered live to the recipient (with a push notification fallback if
// they're not connected), and every message is echoed back to the sender's
// own other connections for multi-device consistency.
func WebSocketHandler(db *pgxpool.Pool, hub *services.ChatHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, err := utils.ValidateToken(r.URL.Query().Get("token"))
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}
		userID := claims.UserID

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		hub.Register(userID, conn)
		defer hub.Unregister(userID, conn)

		for {
			var in wsIncoming
			if err := conn.ReadJSON(&in); err != nil {
				break
			}
			if in.Body == "" {
				continue
			}

			allowed, err := models.CanMessage(r.Context(), db, userID, in.To)
			if err != nil || !allowed {
				conn.WriteJSON(map[string]string{"type": "error", "message": "not authorized to message this user"})
				continue
			}

			msg, err := models.CreateMessage(r.Context(), db, userID, in.To, in.Body)
			if err != nil {
				log.Printf("create message error: %v", err)
				conn.WriteJSON(map[string]string{"type": "error", "message": "could not send message"})
				continue
			}

			payload := map[string]interface{}{"type": "message", "message": msg}
			hub.SendToUser(in.To, payload)
			hub.SendToUser(userID, payload)

			if !hub.IsOnline(in.To) {
				sender, err := models.GetUserByID(r.Context(), db, userID)
				senderName := "Someone"
				if err == nil {
					if sender.Username != nil {
						senderName = *sender.Username
					} else {
						senderName = sender.PhoneNumber
					}
				}
				deepLink := "/chat/" + userID.String()
				preview := in.Body
				if len(preview) > 100 {
					preview = preview[:100]
				}
				if err := services.SendDirectNotification(r.Context(), db, in.To, "New message from "+senderName, preview, &deepLink); err != nil {
					log.Printf("chat notification error: %v", err)
				}
			}
		}
	}
}
