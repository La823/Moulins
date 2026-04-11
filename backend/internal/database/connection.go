package database

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(connStr string) (*pgxpool.Pool, error) {

	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		return nil, err
	}

	// Optional: verify connection
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		return nil, err
	}

	log.Println("Connected to Supabase DB successfully")

	return pool, nil
}
