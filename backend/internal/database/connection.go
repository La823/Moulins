package database

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(connStr string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, err
	}
	// pg_trgm's default similarity threshold (0.3) is too strict for short,
	// typo-prone product/salt names — lower it once per pooled connection
	// rather than per-query (SET can't share a multi-statement call with
	// parameterized queries under pgx's extended protocol).
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET pg_trgm.word_similarity_threshold = 0.4")
		return err
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
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
