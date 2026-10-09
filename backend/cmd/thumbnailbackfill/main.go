// One-off: make the card thumbnail for every product that has a first image
// but no thumbnail yet. Originals are only read — each thumbnail is a new
// file under thumbs/. Safe to re-run: products that already have one are
// skipped.
//
//	go run ./cmd/thumbnailbackfill          # count only
//	go run ./cmd/thumbnailbackfill -apply   # make them
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func main() {
	apply := flag.Bool("apply", false, "make the thumbnails (default: only count them)")
	workers := flag.Int("workers", 6, "products processed at once")
	flag.Parse()

	_ = godotenv.Load()
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := utils.InitS3(); err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	todo, err := models.ListProductsWithoutThumbnail(ctx, db)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%d products need a thumbnail", len(todo))
	if !*apply {
		log.Printf("dry run — pass -apply to make them")
		return
	}

	var done, failed atomic.Int64
	jobs := make(chan models.ProductNeedingThumbnail)
	var wg sync.WaitGroup
	for i := 0; i < *workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range jobs {
				c, cancel := context.WithTimeout(ctx, 90*time.Second)
				thumb, err := utils.MakeThumbnail(c, p.CoverKey)
				if err == nil {
					var old *string
					if old, err = models.SetProductThumbnail(c, db, p.ID, thumb, p.CoverKey); err != nil {
						_ = utils.DeleteThumbnail(thumb)
					} else if old != nil {
						_ = utils.DeleteThumbnail(*old)
					}
				}
				cancel()
				if err != nil {
					failed.Add(1)
					log.Printf("FAILED product %s (%s): %v", p.ID, p.CoverKey, err)
				}
				if n := done.Add(1); n%50 == 0 {
					log.Printf("%d / %d", n, len(todo))
				}
			}
		}()
	}
	for _, p := range todo {
		jobs <- p
	}
	close(jobs)
	wg.Wait()
	log.Printf("done: %d processed, %d failed", done.Load(), failed.Load())
}
