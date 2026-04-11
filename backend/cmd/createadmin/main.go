package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/models"
)

func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	username := "Admin"
	userID, err := models.CreateUser(
		context.Background(),
		pool,
		"1234567890",
		"Admin@123",
		&username,
		nil,
		"admin",
	)
	if err != nil {
		log.Fatalf("failed to create admin: %v", err)
	}
	fmt.Printf("Admin created with ID: %s\n", userID)
}
