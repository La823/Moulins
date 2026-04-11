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
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("DB_URL is not set")
	}
	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("connect error: %v", err)
	}
	defer db.Close()

	file := "internal/database/migrations/010_create_employee_permissions.sql"
	if len(os.Args) > 1 {
		file = os.Args[1]
	}

	sql, err := os.ReadFile(file)
	if err != nil {
		log.Fatalf("read file error: %v", err)
	}
	_, err = db.Exec(context.Background(), string(sql))
	if err != nil {
		log.Fatalf("migration error: %v", err)
	}
	fmt.Printf("Migration applied: %s\n", file)
}
