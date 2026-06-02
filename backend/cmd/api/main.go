package main

import (
	"log"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/api/routes"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/database"
	"github.com/lavanyaarora/server/internal/middleware"
	"github.com/lavanyaarora/server/internal/server"
	"github.com/lavanyaarora/server/internal/utils"
)

func main() {
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

	if err := utils.InitS3(); err != nil {
		log.Printf("WARNING: S3 not configured: %v", err)
	} else {
		log.Println("S3 client initialized")
	}

	rdb := cache.New()

	router := mux.NewRouter()
	routes.RegisterRoutes(router, db, rdb)

	handler := middleware.CORS(router)

	srv := server.New(":"+port, handler)
	server.Start(srv)
}
