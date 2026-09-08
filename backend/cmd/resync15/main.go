package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	vs "github.com/lavanyaarora/server/internal/vectorsearch"
)

// One-off: re-sync a fixed, small set of already-embedded products so their
// Qdrant payload picks up the key_ingredients/description/key_benefits fix,
// without touching the rest of the catalog. Paced to respect Voyage's 3 RPM
// free-tier limit.
func main() {
	_ = godotenv.Load()

	ids := []string{
		"01fc99d0-fb76-4e3f-8b63-83808b0f81de", // LAXPOSE SYP 100 ML
		"05b09ef6-c0dd-4f08-97dd-8b33cabd5de3", // FLOSVECT-MS SUSP 30ML
		"077d559a-24ab-402c-9562-f510d91413d8", // DRILSPAS-DS TAB 10*10
		"101136e1-ed08-4e74-bd01-984a3cf9a872", // DRILPAIN-RB CAP 10*10
		"13a5a87a-8898-4d90-9faa-03693000a7a4", // VISTALOC-25 TAB 10*15
		"1f0555e8-f860-4e98-9f13-a21e9236a348", // CHEERTEL-MXL 50 TAB 10*10
		"2a28959a-2542-4609-a82a-7d7750800fe3", // GABROCK-D GEL 30 GM
		"301ec2da-1bbc-4597-97b7-f870c7189b27", // AEROBUD-200 ROTACAPS
		"3ff13cda-20fe-4b82-bea7-973830d78a9d", // COOLBITE-MS SUSP 170 ML
		"43e793c6-183d-4a0a-877b-5bec3aef083b", // VENTHROM OINTMENT 30 GM
		"46467982-ae2b-46be-8586-ff3e2c174cda", // Aerobud-400 Rotacaps
		"4b58618a-667a-445b-8291-8915856769b0", // DRILPAIN-SP TAB 10*10
		"4c87ef6d-a1e8-41dd-88ae-587211e846b5", // BERBICON TAB 10*1*10
		"e054d4b6-f5e1-48f6-a257-a07a0d65d92c", // LAXPOSE SYP 200 ML
		"d7206705-fa8b-4604-8b8d-5e2358b61a31", // LAXPOSE-3 SUSP 200 ML
	}

	dbURL := os.Getenv("DB_URL")
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	for i, idStr := range ids {
		if i > 0 {
			time.Sleep(21 * time.Second)
		}
		id, err := uuid.Parse(idStr)
		if err != nil {
			log.Printf("bad id %s: %v", idStr, err)
			continue
		}
		if err := vs.SyncProductByID(context.Background(), pool, id); err != nil {
			log.Printf("sync %s failed: %v", idStr, err)
			continue
		}
		log.Printf("synced %s (%d/%d)", idStr, i+1, len(ids))
	}
	log.Println("done")
}
