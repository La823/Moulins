// One-off: give every existing product image the long Cache-Control that new
// uploads now get (utils.SetLongCacheControl), so browsers and phones stop
// re-downloading pictures they already have. Content is untouched; each
// object is copied onto itself with the header added. Safe to re-run — an
// object that already has the header is skipped.
//
//	go run ./cmd/cachecontrolbackfill          # count only
//	go run ./cmd/cachecontrolbackfill -apply   # do it
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
	"github.com/lavanyaarora/server/internal/utils"
)

func main() {
	apply := flag.Bool("apply", false, "re-stamp the objects (default: only count them)")
	workers := flag.Int("workers", 8, "objects processed at once")
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
	rows, err := db.Query(ctx, `SELECT DISTINCT image_key FROM product_images WHERE image_key <> ''`)
	if err != nil {
		log.Fatal(err)
	}
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			log.Fatal(err)
		}
		keys = append(keys, k)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Fatal(err)
	}
	log.Printf("%d product images", len(keys))
	if !*apply {
		log.Printf("dry run — pass -apply to re-stamp them")
		return
	}

	var done, failed atomic.Int64
	jobs := make(chan string)
	var wg sync.WaitGroup
	for i := 0; i < *workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for k := range jobs {
				c, cancel := context.WithTimeout(ctx, 60*time.Second)
				if err := utils.SetLongCacheControl(c, k); err != nil {
					failed.Add(1)
					log.Printf("FAILED %s: %v", k, err)
				}
				cancel()
				if n := done.Add(1); n%100 == 0 {
					log.Printf("%d / %d", n, len(keys))
				}
			}
		}()
	}
	for _, k := range keys {
		jobs <- k
	}
	close(jobs)
	wg.Wait()
	log.Printf("done: %d processed, %d failed", done.Load(), failed.Load())
}
