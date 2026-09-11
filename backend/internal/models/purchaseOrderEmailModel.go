package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PurchaseOrderEmail is one email row for a PO — either an original PO email
// we sent (in_reply_to_message_id is nil) or our own reply to an inbound
// message (in_reply_to_message_id set, pointing at the Graph message id it
// answered). internet_message_id (the RFC 5322 Message-ID header) is what
// lets a later request reliably find replies to an original send — any mail
// client that replies sets In-Reply-To/References to this value, unlike
// Graph's own conversationId which doesn't reliably carry over across mail
// providers.
type PurchaseOrderEmail struct {
	ID                 int64      `json:"id"`
	PoID               int        `json:"po_id"`
	PoNumber           *string    `json:"po_number"`
	MessageID          *string    `json:"message_id"`
	ConversationID     *string    `json:"conversation_id"`
	InternetMessageID  *string    `json:"internet_message_id"`
	InReplyToMessageID *string    `json:"in_reply_to_message_id"`
	ToAddresses        []string   `json:"to_addresses"`
	Subject            *string    `json:"subject"`
	Body               *string    `json:"body"`
	SentBy             *uuid.UUID `json:"sent_by"`
	SentAt             time.Time  `json:"sent_at"`
}

// RecordPurchaseOrderEmail saves an original PO email sent against its PO.
// The Graph ids are empty when mail sending isn't configured (mailer.Send*
// no-ops) — the row is still written so the "what we tried to send" trail
// isn't lost, it just won't have anything to look up replies against.
func RecordPurchaseOrderEmail(ctx context.Context, db *pgxpool.Pool, poID int, poNumber *string, messageID, conversationID, internetMessageID string, toAddresses []string, subject, body string, sentBy *uuid.UUID) error {
	var msgID, convID, imid *string
	if messageID != "" {
		msgID = &messageID
	}
	if conversationID != "" {
		convID = &conversationID
	}
	if internetMessageID != "" {
		imid = &internetMessageID
	}
	_, err := db.Exec(ctx,
		`INSERT INTO purchase_order_emails (po_id, po_number, message_id, conversation_id, internet_message_id, to_addresses, subject, body, sent_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		poID, poNumber, msgID, convID, imid, toAddresses, subject, body, sentBy,
	)
	return err
}

// RecordPurchaseOrderReply saves a reply *we* sent (via ReplyToEmailHandler)
// to an inbound message, so it can be shown back in the thread alongside
// the replies fetched live from the mailbox.
func RecordPurchaseOrderReply(ctx context.Context, db *pgxpool.Pool, poID int, poNumber *string, inReplyToMessageID, toAddress, body string, sentBy *uuid.UUID) error {
	_, err := db.Exec(ctx,
		`INSERT INTO purchase_order_emails (po_id, po_number, in_reply_to_message_id, to_addresses, body, sent_by)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		poID, poNumber, inReplyToMessageID, []string{toAddress}, body, sentBy,
	)
	return err
}

// ListPurchaseOrderEmails returns every original PO email sent for a PO
// (excludes our own reply rows), most recent first.
func ListPurchaseOrderEmails(ctx context.Context, db *pgxpool.Pool, poID int) ([]PurchaseOrderEmail, error) {
	rows, err := db.Query(ctx,
		`SELECT id, po_id, po_number, message_id, conversation_id, internet_message_id, in_reply_to_message_id, to_addresses, subject, body, sent_by, sent_at
		 FROM purchase_order_emails WHERE po_id = $1 AND in_reply_to_message_id IS NULL ORDER BY sent_at DESC`,
		poID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPurchaseOrderEmails(rows)
}

// ListOutgoingRepliesForPO returns every reply we sent for this PO, in
// chronological order, so GetEmailsHandler can merge them into the
// mailbox-fetched reply threads by matching InReplyToMessageID.
func ListOutgoingRepliesForPO(ctx context.Context, db *pgxpool.Pool, poID int) ([]PurchaseOrderEmail, error) {
	rows, err := db.Query(ctx,
		`SELECT id, po_id, po_number, message_id, conversation_id, internet_message_id, in_reply_to_message_id, to_addresses, subject, body, sent_by, sent_at
		 FROM purchase_order_emails WHERE po_id = $1 AND in_reply_to_message_id IS NOT NULL ORDER BY sent_at ASC`,
		poID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPurchaseOrderEmails(rows)
}

func scanPurchaseOrderEmails(rows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}) ([]PurchaseOrderEmail, error) {
	result := []PurchaseOrderEmail{}
	for rows.Next() {
		var e PurchaseOrderEmail
		if err := rows.Scan(&e.ID, &e.PoID, &e.PoNumber, &e.MessageID, &e.ConversationID, &e.InternetMessageID, &e.InReplyToMessageID, &e.ToAddresses, &e.Subject, &e.Body, &e.SentBy, &e.SentAt); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
