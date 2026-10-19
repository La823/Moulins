// margedeload runs one Marg Corporate EDE bills sync from the command line.
//
//	go run ./cmd/margedeload                       # full pull from Marg
//	go run ./cmd/margedeload -datetime "2026-10-19 09:00:00"
//	go run ./cmd/margedeload -file ../apiTest2Corporate/export_.../raw/ede_page000_decrypted.json
//
// It applies pending migrations first (the same RunMigrations the server
// runs on boot), so it creates the marg_ede_* tables on first use.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/database"
	"github.com/lavanyaarora/server/internal/margede"
)

func main() {
	file := flag.String("file", "", "load a saved decrypted MargCorporateEDE response instead of calling Marg (applied as a full pull)")
	datetime := flag.String("datetime", "", "only bills changed since this IST time; blank = full pull")
	flag.Parse()

	_ = godotenv.Load()
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("DB_URL is not set")
	}
	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()
	ctx := context.Background()

	if err := database.RunMigrations(ctx, db); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	var fetch func() (margede.Details, error)
	source := "cli"
	if *file != "" {
		if *datetime != "" {
			log.Fatal("-file and -datetime can't be combined: a saved file is applied as a full pull")
		}
		source = "cli-file"
		fetch = func() (margede.Details, error) {
			b, err := os.ReadFile(*file)
			if err != nil {
				return margede.Details{}, err
			}
			return margede.ParseJSON(b)
		}
	} else {
		creds, err := margede.CredentialsFromEnv()
		if err != nil {
			log.Fatal(err)
		}
		fetch = func() (margede.Details, error) { return margede.Fetch(creds, *datetime) }
	}

	run, err := margede.RunNow(ctx, db, source, *datetime, fetch)
	out, _ := json.MarshalIndent(run, "", "  ")
	fmt.Println(string(out))
	if err != nil {
		os.Exit(1)
	}
}
