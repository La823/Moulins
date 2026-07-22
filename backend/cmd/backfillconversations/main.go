// One-off backfill: collapses pre-existing 1:1 message history involving a
// customer (customer<->employee, customer<->admin) into the new group
// conversation threads, so history isn't lost when the group chat feature
// ships. Messages where neither party is a customer (admin<->employee,
// admin<->admin) are left untouched — they keep using the legacy direct path.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type convKey struct {
	clientID   uuid.UUID
	employeeID uuid.UUID // uuid.Nil when there's no employee (admin-only thread)
}

func main() {
	dbURL := os.Getenv("DB_URL")
	conn, err := pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(context.Background())

	ctx := context.Background()

	rows, err := conn.Query(ctx, `
		SELECT m.id, m.sender_id, m.receiver_id, su.role, ru.role
		FROM messages m
		JOIN users su ON su.id = m.sender_id
		JOIN users ru ON ru.id = m.receiver_id
		WHERE m.conversation_id IS NULL AND m.receiver_id IS NOT NULL
		  AND (su.role = 'customer' OR ru.role = 'customer')
	`)
	if err != nil {
		log.Fatal(err)
	}

	type row struct {
		id, senderID, receiverID       uuid.UUID
		senderRole, receiverRole       string
	}
	var toBackfill []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.senderID, &r.receiverID, &r.senderRole, &r.receiverRole); err != nil {
			log.Fatal(err)
		}
		toBackfill = append(toBackfill, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("found %d customer-involving messages to backfill\n", len(toBackfill))

	convCache := map[convKey]uuid.UUID{}
	getOrCreateConv := func(clientID uuid.UUID, employeeID uuid.UUID) (uuid.UUID, error) {
		key := convKey{clientID: clientID, employeeID: employeeID}
		if id, ok := convCache[key]; ok {
			return id, nil
		}

		var employeeArg interface{}
		if employeeID != uuid.Nil {
			employeeArg = employeeID
		}

		var id uuid.UUID
		err := conn.QueryRow(ctx,
			`SELECT id FROM conversations
			 WHERE client_id = $1 AND COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
			       = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
			clientID, employeeArg,
		).Scan(&id)
		if err == nil {
			convCache[key] = id
			return id, nil
		}

		err = conn.QueryRow(ctx,
			`INSERT INTO conversations (client_id, employee_id) VALUES ($1, $2) RETURNING id`,
			clientID, employeeArg,
		).Scan(&id)
		if err != nil {
			return uuid.Nil, err
		}
		convCache[key] = id
		return id, nil
	}

	updated := 0
	for _, r := range toBackfill {
		var clientID, employeeID uuid.UUID
		switch {
		case r.senderRole == "customer" && r.receiverRole == "employee":
			clientID, employeeID = r.senderID, r.receiverID
		case r.receiverRole == "customer" && r.senderRole == "employee":
			clientID, employeeID = r.receiverID, r.senderID
		case r.senderRole == "customer" && r.receiverRole == "admin":
			clientID = r.senderID
		case r.receiverRole == "customer" && r.senderRole == "admin":
			clientID = r.receiverID
		default:
			// customer<->customer shouldn't exist per CanMessage, skip defensively
			continue
		}

		convID, err := getOrCreateConv(clientID, employeeID)
		if err != nil {
			log.Fatalf("get/create conversation for message %s: %v", r.id, err)
		}

		if _, err := conn.Exec(ctx, `UPDATE messages SET conversation_id = $1 WHERE id = $2`, convID, r.id); err != nil {
			log.Fatalf("update message %s: %v", r.id, err)
		}
		updated++
	}

	fmt.Printf("backfilled %d messages into %d conversations\n", updated, len(convCache))
}
