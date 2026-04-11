package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	queries := []string{
		"DELETE FROM order_items",
		"DELETE FROM orders",
		"DELETE FROM employee_permissions",
		"DELETE FROM users",
	}
	for _, q := range queries {
		_, err = pool.Exec(context.Background(), q)
		if err != nil {
			log.Fatalf("failed on %s: %v", q, err)
		}
	}
	fmt.Println("All users and related data deleted")
}
