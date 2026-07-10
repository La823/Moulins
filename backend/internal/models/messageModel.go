package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID         uuid.UUID  `json:"id"`
	SenderID   uuid.UUID  `json:"sender_id"`
	ReceiverID uuid.UUID  `json:"receiver_id"`
	Body       string     `json:"body"`
	ReadAt     *time.Time `json:"read_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

type Conversation struct {
	UserID        uuid.UUID `json:"user_id"`
	Username      *string   `json:"username,omitempty"`
	PhoneNumber   string    `json:"phone_number"`
	Role          string    `json:"role"`
	LastMessage   string    `json:"last_message"`
	LastMessageAt time.Time `json:"last_message_at"`
	UnreadCount   int       `json:"unread_count"`
}

// CanMessage decides whether senderID may message receiverID: admins can
// message and be messaged by anyone; otherwise an employee and a client may
// message each other only if a client_employee_assignments row links them.
func CanMessage(ctx context.Context, db *pgxpool.Pool, senderID, receiverID uuid.UUID) (bool, error) {
	if senderID == receiverID {
		return false, nil
	}

	sender, err := GetUserByID(ctx, db, senderID)
	if err != nil {
		return false, err
	}
	receiver, err := GetUserByID(ctx, db, receiverID)
	if err != nil {
		return false, err
	}

	if sender.Role == "admin" || receiver.Role == "admin" {
		return true, nil
	}

	var clientID, employeeID uuid.UUID
	switch {
	case sender.Role == "employee" && receiver.Role == "customer":
		employeeID, clientID = senderID, receiverID
	case sender.Role == "customer" && receiver.Role == "employee":
		employeeID, clientID = receiverID, senderID
	default:
		return false, nil
	}

	var exists bool
	err = db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM client_employee_assignments WHERE client_id = $1 AND employee_id = $2)`,
		clientID, employeeID,
	).Scan(&exists)
	return exists, err
}

func CreateMessage(ctx context.Context, db *pgxpool.Pool, senderID, receiverID uuid.UUID, body string) (*Message, error) {
	var m Message
	err := db.QueryRow(ctx,
		`INSERT INTO messages (sender_id, receiver_id, body) VALUES ($1, $2, $3)
		 RETURNING id, sender_id, receiver_id, body, read_at, created_at`,
		senderID, receiverID, body,
	).Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.Body, &m.ReadAt, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func GetConversationHistory(ctx context.Context, db *pgxpool.Pool, userA, userB uuid.UUID, limit int) ([]Message, error) {
	rows, err := db.Query(ctx,
		`SELECT id, sender_id, receiver_id, body, read_at, created_at
		 FROM messages
		 WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
		 ORDER BY created_at DESC
		 LIMIT $3`,
		userA, userB, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.Body, &m.ReadAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	// reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, rows.Err()
}

func GetConversations(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Conversation, error) {
	rows, err := db.Query(ctx,
		`WITH partners AS (
		    SELECT DISTINCT
		        CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id
		    FROM messages
		    WHERE sender_id = $1 OR receiver_id = $1
		 )
		 SELECT u.id, u.username, u.phone_number, u.role,
		        lm.body AS last_message,
		        lm.created_at AS last_message_at,
		        COALESCE((
		            SELECT COUNT(*) FROM messages
		            WHERE sender_id = u.id AND receiver_id = $1 AND read_at IS NULL
		        ), 0) AS unread_count
		 FROM partners p
		 JOIN users u ON u.id = p.other_id
		 JOIN LATERAL (
		     SELECT body, created_at FROM messages
		     WHERE (sender_id = $1 AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = $1)
		     ORDER BY created_at DESC LIMIT 1
		 ) lm ON true
		 ORDER BY lm.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversations := []Conversation{}
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.UserID, &c.Username, &c.PhoneNumber, &c.Role, &c.LastMessage, &c.LastMessageAt, &c.UnreadCount); err != nil {
			return nil, err
		}
		conversations = append(conversations, c)
	}
	return conversations, rows.Err()
}

func MarkMessagesRead(ctx context.Context, db *pgxpool.Pool, userID, otherUserID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE messages SET read_at = now() WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
		otherUserID, userID,
	)
	return err
}
