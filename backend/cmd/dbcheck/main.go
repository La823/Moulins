package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
)

func main() {
	_ = godotenv.Load()
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	// Check all users
	rows, err := db.Query(ctx, "SELECT id, phone_number, COALESCE(username, ''), role FROM users ORDER BY created_at")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("=== ALL USERS ===")
	for rows.Next() {
		var id, phone, name, role string
		rows.Scan(&id, &phone, &name, &role)
		fmt.Printf("  %s | %-10s | %-15s | %s\n", id[:8], role, phone, name)
	}
	rows.Close()

	// Delete orders placed by admin
	if len(os.Args) > 1 && os.Args[1] == "--clean" {
		fmt.Println("\n=== CLEANING admin orders ===")
		tag, err := db.Exec(ctx, `
			DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')
		`)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("  Deleted %d admin orders (cascades to items + events)\n", tag.RowsAffected())
	}

	// Check all orders
	rows2, err := db.Query(ctx, `
		SELECT o.id, o.user_id, o.status, u.role, COALESCE(u.username, u.phone_number)
		FROM orders o JOIN users u ON u.id = o.user_id
		ORDER BY o.created_at
	`)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("\n=== ALL ORDERS ===")
	count := 0
	for rows2.Next() {
		var oid, uid, status, role, name string
		rows2.Scan(&oid, &uid, &status, &role, &name)
		fmt.Printf("  order %s | user %s (%s, %s) | status: %s\n", oid[:8], uid[:8], role, name, status)
		count++
	}
	rows2.Close()
	if count == 0 {
		fmt.Println("  (none)")
	}
}
