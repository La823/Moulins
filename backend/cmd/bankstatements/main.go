// Command bankstatements runs the bank-statement email job by hand and
// manages its stored passwords.
//
//	go run ./cmd/bankstatements run [-days 3]            read new statement emails now
//	go run ./cmd/bankstatements set-credential <key> [-label ..] [-username ..] [-notes ..]
//	                                                     save a password/token; the secret is read from stdin
//	go run ./cmd/bankstatements parse <statement.html>   check the parser on a saved, decrypted page (no DB)
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/lavanyaarora/server/internal/bankstatements"
	"github.com/lavanyaarora/server/internal/database"
)

func main() {
	_ = godotenv.Load()
	if len(os.Args) < 2 {
		log.Fatal("usage: bankstatements run|set-credential|parse ...")
	}
	ctx := context.Background()

	switch os.Args[1] {
	case "parse":
		if len(os.Args) < 3 {
			log.Fatal("usage: bankstatements parse <statement.html>")
		}
		page, err := os.ReadFile(os.Args[2])
		if err != nil {
			log.Fatal(err)
		}
		s, err := bankstatements.ParseStatement(string(page))
		if err != nil {
			log.Fatal(err)
		}
		html := len(s.HTML)
		s.HTML = ""
		b, _ := json.MarshalIndent(s, "", "  ")
		fmt.Println(string(b))
		fmt.Println("stored html bytes:", html)
		return
	}

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("DB_URL is not set")
	}
	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()

	switch os.Args[1] {
	case "run":
		fs := flag.NewFlagSet("run", flag.ExitOnError)
		days := fs.Int("days", 3, "look at emails from the last N days")
		_ = fs.Parse(os.Args[2:])
		r := bankstatements.Run(ctx, db, *days, nil)
		fmt.Printf("saved %d: %v\nalready handled: %d\n", len(r.Saved), r.Saved, r.Skipped)
		for _, e := range r.Errors {
			fmt.Println("error:", e)
		}

	case "set-credential":
		if len(os.Args) < 3 {
			log.Fatal("usage: bankstatements set-credential <key> [-label ..] [-username ..] [-notes ..]  (secret on stdin)")
		}
		key := os.Args[2]
		fs := flag.NewFlagSet("set-credential", flag.ExitOnError)
		label := fs.String("label", "", "what it is")
		user := fs.String("username", "", "account or login it belongs to")
		notes := fs.String("notes", "", "notes")
		_ = fs.Parse(os.Args[3:])
		secret, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		secret = strings.TrimSpace(secret)
		if secret == "" {
			log.Fatal("no secret on stdin")
		}
		if err := bankstatements.SetCredential(ctx, db, key, *label, *user, secret, *notes); err != nil {
			log.Fatal(err)
		}
		fmt.Println("saved", key)

	default:
		log.Fatalf("unknown command %q", os.Args[1])
	}
}
