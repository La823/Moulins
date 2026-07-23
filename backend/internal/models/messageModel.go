package models

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID             uuid.UUID  `json:"id"`
	SenderID       uuid.UUID  `json:"sender_id"`
	ReceiverID     *uuid.UUID `json:"receiver_id,omitempty"`
	ConversationID *uuid.UUID `json:"conversation_id,omitempty"`
	Body           string     `json:"body"`
	ReadAt         *time.Time `json:"read_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	// Populated by GetConversationMessages via a join — a thread can have 2-3
	// distinct "not me" senders, so the client needs to know who sent what.
	SenderName *string `json:"sender_name,omitempty"`
	SenderRole *string `json:"sender_role,omitempty"`
}

// Conversation is the unified shape returned by GetConversations: either a
// legacy direct 1:1 (Type "direct", ID = the other user's id) or a group
// thread (Type "thread", ID = conversations.id).
type Conversation struct {
	Type          string          `json:"type"`
	ID            uuid.UUID       `json:"id"`
	Username      *string         `json:"username,omitempty"`
	PhoneNumber   string          `json:"phone_number,omitempty"`
	Role          string          `json:"role,omitempty"`
	Participants  []AssignedUser  `json:"participants,omitempty"`
	LastMessage   string          `json:"last_message"`
	LastMessageAt time.Time       `json:"last_message_at"`
	UnreadCount   int             `json:"unread_count"`
}

// --- Legacy direct 1:1 path (admin<->employee, admin<->admin) — unchanged ---

// CanMessage decides whether senderID may directly message receiverID:
// admins can message and be messaged by anyone; otherwise an employee and a
// client may message each other only if a client_employee_assignments row
// links them. Customer-involving pairs are expected to go through the group
// conversation path instead (see ResolveSendTarget), but this is kept as-is
// so direct admin<->employee / admin<->admin chat keeps working unchanged.
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
		 RETURNING id, sender_id, receiver_id, conversation_id, body, read_at, created_at`,
		senderID, receiverID, body,
	).Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.ConversationID, &m.Body, &m.ReadAt, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func GetConversationHistory(ctx context.Context, db *pgxpool.Pool, userA, userB uuid.UUID, limit int) ([]Message, error) {
	rows, err := db.Query(ctx,
		`SELECT id, sender_id, receiver_id, conversation_id, body, read_at, created_at
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
		if err := rows.Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.ConversationID, &m.Body, &m.ReadAt, &m.CreatedAt); err != nil {
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

func MarkMessagesRead(ctx context.Context, db *pgxpool.Pool, userID, otherUserID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE messages SET read_at = now() WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
		otherUserID, userID,
	)
	return err
}

// --- Group conversation path (customer + assigned employee + all admins) ---

type ConversationRef struct {
	ID         uuid.UUID
	ClientID   uuid.UUID
	EmployeeID *uuid.UUID
}

// GetOrCreateConversation finds the (client, employee) thread, creating it if
// this is the first time these two (or the client + admins, if employeeID is
// nil) have exchanged a message.
func GetOrCreateConversation(ctx context.Context, db *pgxpool.Pool, clientID uuid.UUID, employeeID *uuid.UUID) (*ConversationRef, error) {
	var ref ConversationRef
	err := db.QueryRow(ctx,
		`SELECT id, client_id, employee_id FROM conversations
		 WHERE client_id = $1 AND COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
		       = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
		clientID, employeeID,
	).Scan(&ref.ID, &ref.ClientID, &ref.EmployeeID)
	if err == nil {
		return &ref, nil
	}

	err = db.QueryRow(ctx,
		`INSERT INTO conversations (client_id, employee_id) VALUES ($1, $2)
		 RETURNING id, client_id, employee_id`,
		clientID, employeeID,
	).Scan(&ref.ID, &ref.ClientID, &ref.EmployeeID)
	if err != nil {
		return nil, err
	}
	return &ref, nil
}

func GetConversationByID(ctx context.Context, db *pgxpool.Pool, conversationID uuid.UUID) (*ConversationRef, error) {
	var ref ConversationRef
	err := db.QueryRow(ctx,
		`SELECT id, client_id, employee_id FROM conversations WHERE id = $1`,
		conversationID,
	).Scan(&ref.ID, &ref.ClientID, &ref.EmployeeID)
	if err != nil {
		return nil, err
	}
	return &ref, nil
}

// IsConversationMember reports whether userID may read/send in this thread:
// the client, the assigned employee (if any), or any admin.
func IsConversationMember(ctx context.Context, db *pgxpool.Pool, conv *ConversationRef, userID uuid.UUID) (bool, error) {
	if userID == conv.ClientID || (conv.EmployeeID != nil && userID == *conv.EmployeeID) {
		return true, nil
	}
	user, err := GetUserByID(ctx, db, userID)
	if err != nil {
		return false, err
	}
	return user.Role == "admin", nil
}

// ConversationRecipients is {client} ∪ {employee, if set} ∪ all admins.
func ConversationRecipients(ctx context.Context, db *pgxpool.Pool, conv *ConversationRef) ([]uuid.UUID, error) {
	ids := []uuid.UUID{conv.ClientID}
	if conv.EmployeeID != nil {
		ids = append(ids, *conv.EmployeeID)
	}
	admins, err := GetUsersByRole(ctx, db, "admin")
	if err != nil {
		return nil, err
	}
	for _, a := range admins {
		ids = append(ids, a.ID)
	}
	return ids, nil
}

func CreateGroupMessage(ctx context.Context, db *pgxpool.Pool, conversationID, senderID uuid.UUID, body string) (*Message, error) {
	var m Message
	err := db.QueryRow(ctx,
		`INSERT INTO messages (sender_id, conversation_id, body) VALUES ($1, $2, $3)
		 RETURNING id, sender_id, receiver_id, conversation_id, body, read_at, created_at`,
		senderID, conversationID, body,
	).Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.ConversationID, &m.Body, &m.ReadAt, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func GetConversationMessages(ctx context.Context, db *pgxpool.Pool, conversationID uuid.UUID, limit int) ([]Message, error) {
	rows, err := db.Query(ctx,
		`SELECT m.id, m.sender_id, m.receiver_id, m.conversation_id, m.body, m.read_at, m.created_at,
		        u.username, u.role
		 FROM messages m
		 JOIN users u ON u.id = m.sender_id
		 WHERE m.conversation_id = $1
		 ORDER BY m.created_at DESC
		 LIMIT $2`,
		conversationID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.ConversationID, &m.Body, &m.ReadAt, &m.CreatedAt, &m.SenderName, &m.SenderRole); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, rows.Err()
}

func MarkConversationRead(ctx context.Context, db *pgxpool.Pool, conversationID, userID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
		 VALUES ($1, $2, now())
		 ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`,
		conversationID, userID,
	)
	return err
}

// GetConversations returns the unified inbox for userID: legacy direct 1:1
// rows (Type "direct") plus group threads the user belongs to (Type
// "thread") — one row per (client, employee) pairing the user is a member
// of (all of them, for admins).
func GetConversations(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) ([]Conversation, error) {
	conversations := []Conversation{}

	// Legacy direct 1:1 — unchanged query, naturally only ever matches rows
	// where conversation_id IS NULL since those never touch messages.conversation_id.
	directRows, err := db.Query(ctx,
		`WITH partners AS (
		    SELECT DISTINCT
		        CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id
		    FROM messages
		    WHERE (sender_id = $1 OR receiver_id = $1) AND conversation_id IS NULL
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
	for directRows.Next() {
		var c Conversation
		c.Type = "direct"
		if err := directRows.Scan(&c.ID, &c.Username, &c.PhoneNumber, &c.Role, &c.LastMessage, &c.LastMessageAt, &c.UnreadCount); err != nil {
			directRows.Close()
			return nil, err
		}
		conversations = append(conversations, c)
	}
	directRows.Close()
	if err := directRows.Err(); err != nil {
		return nil, err
	}

	// Group threads: scope which conversations this user belongs to.
	user, err := GetUserByID(ctx, db, userID)
	if err != nil {
		return nil, err
	}
	var threadRows interface {
		Next() bool
		Scan(dest ...interface{}) error
		Close()
		Err() error
	}
	switch user.Role {
	case "admin":
		threadRows, err = db.Query(ctx, `SELECT id, client_id, employee_id FROM conversations`)
	case "employee":
		threadRows, err = db.Query(ctx, `SELECT id, client_id, employee_id FROM conversations WHERE employee_id = $1`, userID)
	default: // customer
		threadRows, err = db.Query(ctx, `SELECT id, client_id, employee_id FROM conversations WHERE client_id = $1`, userID)
	}
	if err != nil {
		return nil, err
	}
	var refs []ConversationRef
	for threadRows.Next() {
		var ref ConversationRef
		if err := threadRows.Scan(&ref.ID, &ref.ClientID, &ref.EmployeeID); err != nil {
			threadRows.Close()
			return nil, err
		}
		refs = append(refs, ref)
	}
	threadRows.Close()
	if err := threadRows.Err(); err != nil {
		return nil, err
	}

	for _, ref := range refs {
		var last Message
		err := db.QueryRow(ctx,
			`SELECT body, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
			ref.ID,
		).Scan(&last.Body, &last.CreatedAt)
		if err != nil {
			// No messages in this thread yet — still show it so the user can
			// start the conversation, just with no preview.
			last.Body = ""
		}

		var unread int
		_ = db.QueryRow(ctx,
			`SELECT COUNT(*) FROM messages m
			 WHERE m.conversation_id = $1 AND m.sender_id != $2
			   AND m.created_at > COALESCE(
			       (SELECT last_read_at FROM conversation_reads WHERE conversation_id = $1 AND user_id = $2),
			       'epoch'::timestamptz
			   )`,
			ref.ID, userID,
		).Scan(&unread)

		participants := []AssignedUser{}
		client, err := GetUserByID(ctx, db, ref.ClientID)
		if err == nil {
			participants = append(participants, toAssignedUser(client))
		}
		if ref.EmployeeID != nil {
			employee, err := GetUserByID(ctx, db, *ref.EmployeeID)
			if err == nil {
				participants = append(participants, toAssignedUser(employee))
			}
		}

		conversations = append(conversations, Conversation{
			Type:          "thread",
			ID:            ref.ID,
			Participants:  participants,
			LastMessage:   last.Body,
			LastMessageAt: last.CreatedAt,
			UnreadCount:   unread,
		})
	}

	// Direct rows and thread rows come from separate queries, each
	// individually ordered — merge-sort them here by most recent activity so
	// the combined list is newest-first regardless of type.
	sort.Slice(conversations, func(i, j int) bool {
		return conversations[i].LastMessageAt.After(conversations[j].LastMessageAt)
	})

	return conversations, nil
}

func toAssignedUser(u *User) AssignedUser {
	return AssignedUser{
		ID:          u.ID,
		Username:    u.Username,
		PhoneNumber: u.PhoneNumber,
		Email:       u.Email,
		Role:        u.Role,
	}
}

// ResolveSendTarget figures out where an incoming {to, conversation_id, body}
// websocket frame should be delivered:
//   - conversationID given: sender must already be a member; use it directly.
//   - else, resolved from `to` + roles: customer<->employee/admin and
//     employee<->client go through the group conversation path (creating the
//     thread on first contact); admin<->employee, admin<->admin, and any
//     customer<->customer/employee<->employee attempt fall through to the
//     legacy direct 1:1 path (conv == nil, legacyOK reports whether that
//     legacy CanMessage check should be used).
func ResolveSendTarget(ctx context.Context, db *pgxpool.Pool, senderID uuid.UUID, to *uuid.UUID, conversationID *uuid.UUID) (conv *ConversationRef, legacyReceiver *uuid.UUID, err error) {
	if conversationID != nil {
		conv, err = GetConversationByID(ctx, db, *conversationID)
		if err != nil {
			return nil, nil, err
		}
		member, err := IsConversationMember(ctx, db, conv, senderID)
		if err != nil || !member {
			return nil, nil, err
		}
		return conv, nil, nil
	}

	if to == nil {
		return nil, nil, nil
	}

	sender, err := GetUserByID(ctx, db, senderID)
	if err != nil {
		return nil, nil, err
	}
	target, err := GetUserByID(ctx, db, *to)
	if err != nil {
		return nil, nil, err
	}

	switch {
	case sender.Role == "customer" && target.Role == "employee":
		var assigned bool
		if err := db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM client_employee_assignments WHERE client_id = $1 AND employee_id = $2)`,
			senderID, *to,
		).Scan(&assigned); err != nil || !assigned {
			return nil, nil, err
		}
		conv, err = GetOrCreateConversation(ctx, db, senderID, to)
		return conv, nil, err

	case sender.Role == "customer" && target.Role == "admin":
		conv, err = GetOrCreateConversation(ctx, db, senderID, nil)
		return conv, nil, err

	case sender.Role == "employee" && target.Role == "customer":
		var assigned bool
		if err := db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM client_employee_assignments WHERE client_id = $1 AND employee_id = $2)`,
			*to, senderID,
		).Scan(&assigned); err != nil || !assigned {
			return nil, nil, err
		}
		conv, err = GetOrCreateConversation(ctx, db, *to, &senderID)
		return conv, nil, err

	case sender.Role == "admin" && target.Role == "customer":
		conv, err = GetOrCreateConversation(ctx, db, *to, nil)
		return conv, nil, err

	default:
		// admin<->employee, admin<->admin, or a disallowed pairing — legacy path.
		return nil, to, nil
	}
}
