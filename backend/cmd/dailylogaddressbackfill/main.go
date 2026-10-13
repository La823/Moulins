// One-off: give every daily log that has coordinates but no place name a
// readable one ("Sector 22, Chandigarh"), for logs saved before the lookup
// existed. Only the empty address column is written. Safe to re-run: logs
// that already have an address are skipped.
//
//	go run ./cmd/dailylogaddressbackfill          # count only
//	go run ./cmd/dailylogaddressbackfill -apply   # look them up and save
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

func main() {
	apply := flag.Bool("apply", false, "look up and save the addresses (default: only count them)")
	flag.Parse()

	_ = godotenv.Load()
	db, err := database.Connect(os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	todo, err := models.ListDailyLogsWithoutAddress(ctx, db)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%d daily logs need an address", len(todo))
	if !*apply {
		log.Printf("dry run — pass -apply to look them up")
		return
	}

	// Several logs are often sent from the same spot (office, home): look
	// each distinct point up once.
	type point struct{ lat, lng float64 }
	cache := map[point]string{}
	done, failed := 0, 0
	for _, l := range todo {
		key := point{float64(int(l.Lat*10000)) / 10000, float64(int(l.Lng*10000)) / 10000}
		addr, seen := cache[key]
		if !seen {
			var ok bool
			addr, ok = utils.ReverseGeocode(l.Lat, l.Lng)
			if !ok {
				addr = ""
			}
			cache[key] = addr
			time.Sleep(60 * time.Millisecond) // stay well under Google's rate limit
		}
		if addr == "" {
			failed++
			continue
		}
		c, cancel := context.WithTimeout(ctx, 15*time.Second)
		err := models.SetDailyLogAddress(c, db, l.ID, addr)
		cancel()
		if err != nil {
			log.Printf("%s: %v", l.ID, err)
			failed++
			continue
		}
		done++
	}
	log.Printf("done: %d addressed, %d could not be resolved", done, failed)
}
