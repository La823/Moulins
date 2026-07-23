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

// HistoryHandler serves legacy direct 1:1 history (admin<->employee,
// admin<->admin). Customer-involving history goes through ThreadHistoryHandler.
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

// ThreadHistoryHandler serves history for a group thread (customer + their
// assigned employee + all admins), keyed by conversation id.
func ThreadHistoryHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conversationID, err := uuid.Parse(mux.Vars(r)["conversationId"])
		if err != nil {
			http.Error(w, "invalid conversation id", http.StatusBadRequest)
			return
		}

		userID := getUserID(r)
		conv, err := models.GetConversationByID(r.Context(), db, conversationID)
		if err != nil {
			http.Error(w, "conversation not found", http.StatusNotFound)
			return
		}
		member, err := models.IsConversationMember(r.Context(), db, conv, userID)
		if err != nil {
			log.Printf("membership check error: %v", err)
			http.Error(w, "could not verify permission", http.StatusInternalServerError)
			return
		}
		if !member {
			http.Error(w, "not authorized to view this conversation", http.StatusForbidden)
			return
		}

		limit := 50
		if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 200 {
			limit = l
		}

		history, err := models.GetConversationMessages(r.Context(), db, conversationID, limit)
		if err != nil {
			log.Printf("get thread history error: %v", err)
			http.Error(w, "could not fetch history", http.StatusInternalServerError)
			return
		}

		if err := models.MarkConversationRead(r.Context(), db, conversationID, userID); err != nil {
			log.Printf("mark thread read error: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)
	}
}

func MarkThreadReadHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conversationID, err := uuid.Parse(mux.Vars(r)["conversationId"])
		if err != nil {
			http.Error(w, "invalid conversation id", http.StatusBadRequest)
			return
		}
		if err := models.MarkConversationRead(r.Context(), db, conversationID, getUserID(r)); err != nil {
			log.Printf("mark thread read error: %v", err)
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
	To             *uuid.UUID `json:"to,omitempty"`
	ConversationID *uuid.UUID `json:"conversation_id,omitempty"`
	Body           string     `json:"body"`
	// ImageKey is the S3 object key returned by POST /messages/upload-url
	// after the client PUTs the file directly to S3 — never the image
	// bytes themselves, which never touch this socket.
	ImageKey *string `json:"image_key,omitempty"`
}

// WebSocketHandler authenticates via a ?token= query param (browsers'
// WebSocket API cannot set an Authorization header), then relays messages
// in both directions. Incoming {to|conversation_id, body} payloads are
// resolved to either a group thread (customer + assigned employee + all
// admins) or the legacy direct 1:1 path (admin<->employee, admin<->admin),
// persisted, and delivered live to every recipient (with a push notification
// fallback for anyone not connected).
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
			if in.Body == "" && in.ImageKey == nil {
				continue
			}
			var imageURL *string
			if in.ImageKey != nil && *in.ImageKey != "" {
				url := utils.GetPublicURL(*in.ImageKey)
				imageURL = &url
			}

			conv, legacyReceiver, err := models.ResolveSendTarget(r.Context(), db, userID, in.To, in.ConversationID)
			if err != nil {
				log.Printf("resolve send target error: %v", err)
				conn.WriteJSON(map[string]string{"type": "error", "message": "could not send message"})
				continue
			}

			if conv != nil {
				sendGroupMessage(r, db, hub, conv, userID, in.Body, imageURL)
				continue
			}

			if legacyReceiver == nil {
				conn.WriteJSON(map[string]string{"type": "error", "message": "not authorized to message this user"})
				continue
			}
			sendLegacyMessage(r, db, hub, userID, *legacyReceiver, in.Body, imageURL)
		}
	}
}

func sendGroupMessage(r *http.Request, db *pgxpool.Pool, hub *services.ChatHub, conv *models.ConversationRef, senderID uuid.UUID, body string, imageURL *string) {
	msg, err := models.CreateGroupMessage(r.Context(), db, conv.ID, senderID, body, imageURL)
	if err != nil {
		log.Printf("create group message error: %v", err)
		return
	}

	recipients, err := models.ConversationRecipients(r.Context(), db, conv)
	if err != nil {
		log.Printf("get conversation recipients error: %v", err)
		return
	}

	payload := map[string]interface{}{"type": "message", "message": msg}
	for _, recipientID := range recipients {
		hub.SendToUser(recipientID, payload)
	}

	senderName := resolveSenderName(r, db, senderID)
	deepLink := "/chat?conversation=" + conv.ID.String()
	preview := previewText(body, imageURL)
	for _, recipientID := range recipients {
		if recipientID == senderID || hub.IsOnline(recipientID) {
			continue
		}
		if err := services.SendPushOnly(r.Context(), db, recipientID, "New message from "+senderName, preview, &deepLink); err != nil {
			log.Printf("chat push error: %v", err)
		}
	}
}

func sendLegacyMessage(r *http.Request, db *pgxpool.Pool, hub *services.ChatHub, senderID, receiverID uuid.UUID, body string, imageURL *string) {
	msg, err := models.CreateMessage(r.Context(), db, senderID, receiverID, body, imageURL)
	if err != nil {
		log.Printf("create message error: %v", err)
		return
	}

	payload := map[string]interface{}{"type": "message", "message": msg}
	hub.SendToUser(receiverID, payload)
	hub.SendToUser(senderID, payload)

	if !hub.IsOnline(receiverID) {
		senderName := resolveSenderName(r, db, senderID)
		deepLink := "/chat/" + senderID.String()
		preview := previewText(body, imageURL)
		if err := services.SendPushOnly(r.Context(), db, receiverID, "New message from "+senderName, preview, &deepLink); err != nil {
			log.Printf("chat push error: %v", err)
		}
	}
}

func resolveSenderName(r *http.Request, db *pgxpool.Pool, senderID uuid.UUID) string {
	sender, err := models.GetUserByID(r.Context(), db, senderID)
	if err != nil {
		return "Someone"
	}
	if sender.Username != nil {
		return *sender.Username
	}
	return sender.PhoneNumber
}

func truncatePreview(body string) string {
	if len(body) > 100 {
		return body[:100]
	}
	return body
}

func previewText(body string, imageURL *string) string {
	if body == "" && imageURL != nil {
		return "📷 Photo"
	}
	return truncatePreview(body)
}

// UploadURLHandler generates a presigned S3 PUT URL for a chat image — the
// client uploads the file directly to S3 and only ever sends the resulting
// key back over the websocket, never the image bytes.
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

		uploadURL, key, err := utils.GenerateChatImageUploadURL(req.Filename)
		if err != nil {
			log.Printf("chat image presign error: %v", err)
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
