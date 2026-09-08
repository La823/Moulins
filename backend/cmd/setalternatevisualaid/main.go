package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
)

// One-off script: for every product, mark every second image (by sort_order,
// then created_at) as visual_aid = true, and the rest false.
func main() {
	_ = godotenv.Load()
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	dryRun := len(os.Args) > 1 && os.Args[1] == "--dry-run"

	rows, err := db.Query(ctx, `
		SELECT id, product_id, rn, (rn % 2 = 0 OR rn % 3 = 0) AS should_be_visual_aid
		FROM (
			SELECT id, product_id,
				ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY sort_order, created_at, id) AS rn
			FROM product_images
		) t
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	type row struct {
		id, productID string
		rn            int
		shouldBeVA    bool
	}
	var all []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.productID, &r.rn, &r.shouldBeVA); err != nil {
			log.Fatal(err)
		}
		all = append(all, r)
	}
	rows.Close()

	fmt.Printf("Found %d product images\n", len(all))
	if dryRun {
		for _, r := range all {
			fmt.Printf("  image %s (product %s) position %d -> visual_aid=%v\n", r.id, r.productID, r.rn, r.shouldBeVA)
		}
		fmt.Println("Dry run only, no changes made.")
		return
	}

	tag, err := db.Exec(ctx, `
		UPDATE product_images
		SET visual_aid = (sub.rn % 2 = 0 OR sub.rn % 3 = 0)
		FROM (
			SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY sort_order, created_at, id) AS rn
			FROM product_images
		) sub
		WHERE product_images.id = sub.id
	`)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Updated %d product images\n", tag.RowsAffected())
}
