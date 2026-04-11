package main

import (
	"log"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/api/routes"
	"github.com/lavanyaarora/server/internal/database"
	"github.com/lavanyaarora/server/internal/middleware"
	"github.com/lavanyaarora/server/internal/server"
	"github.com/lavanyaarora/server/internal/utils"
)

func main() {
	// Load .env — not fatal if missing (env vars may be set externally in prod)
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("DB_URL is not set")
	}

	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("DB pool initialized")

	// Initialize S3 client
	if err := utils.InitS3(); err != nil {
		log.Printf("WARNING: S3 not configured: %v", err)
	} else {
		log.Println("S3 client initialized")
	}

	router := mux.NewRouter()
	routes.RegisterRoutes(router, db)

	// Wrap router with CORS middleware
	handler := middleware.CORS(router)

	srv := server.New(":"+port, handler)
	server.Start(srv)
}
