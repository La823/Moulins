// One-off: gives every partner account one presentation per division (the
// 12 divisions the apps and website show). Each deck holds every visual-aid
// image of the division's active products, in product-name order, leaving
// out products hidden from that partner or exclusive to other partners.
// Each partner gets their own copy, so they can edit theirs freely; their
// team members see it too, as with any of the partner's decks.
//
// Safe to run again: a partner who already has a deck with the division's
// name is skipped for that division. Sends no notifications. Everything runs
// in one transaction, one statement per division; the dry run does the same
// work and rolls it back.
//
//	go run ./cmd/divisionpresentations          # dry run: prints what it would add
//	go run ./cmd/divisionpresentations -apply   # adds them
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type division struct {
	name       string // the deck's name
	categoryID string
}

// same 12 divisions and category ids as mobile/lib/data/divisions.dart
var divisions = []division{
	{"Aerozone · Respiratory & ENT Care", "a75b6d1e-b867-45ac-9545-5ad7c0d8af4c"},
	{"Bone Voyage · Orthopaedic Care", "e6d5fbe4-7e5e-4589-9f53-538d166773e6"},
	{"Fluidity · Urology & Renal Care", "88af1ce9-be74-4aa5-8433-059a8ba1aeb4"},
	{"Gutsy · Gastroenterology Care", "4d364d05-5c3e-4191-936c-f9c92cd2c773"},
	{"Jivya · Cardio-Diabetic Care", "4bfa533e-7005-4bb5-ae06-184a0ee54dd6"},
	{"Life Gard · Antibiotics & Trauma Care", "f6ac3776-65b5-4741-9c78-e4114335924c"},
	{"Little Planet · Pediatric Care", "548feaf0-b5ae-4b93-a328-54a7b236cd7b"},
	{"Matrix · General & Nutraceuticals", "36e52f50-5175-44cb-aa26-eeb00be9604b"},
	{"Mindset · Neurology & Psychiatry Care", "719a26e6-e368-4722-a17d-ac05f197817e"},
	{"Misbella · Derma & Skin Wellness Care", "9e1eabdb-d599-416c-9c99-8b92b0924ce1"},
	{"Srishti · Gynaecology Care", "1fc039cc-910a-4ef3-aac7-6e8d64d28293"},
	{"View Point · Ophthalmology Care", "6202edc9-44e5-46d7-8f40-347649932c96"},
}

// One division for every partner at once: $1 the division's category id,
// $2 the deck name. Returns the decks and slides it added.
const addDivisionSQL = `
WITH partners AS (
	SELECT u.id FROM users u
	WHERE u.role = 'partner' AND u.deleted_at IS NULL
	  AND NOT EXISTS (SELECT 1 FROM partner_presentations pp WHERE pp.partner_id = u.id AND pp.name = $2)
),
-- every partner's visible visual-aid images of the division, numbered in slide order
imgs AS (
	SELECT pt.id AS partner_id, pi.id AS image_id,
	       row_number() OVER (PARTITION BY pt.id ORDER BY lower(p.name), p.id, pi.sort_order, pi.id) - 1 AS pos
	FROM partners pt
	JOIN product_categories pc ON pc.category_id = $1
	JOIN products p ON p.id = pc.product_id
	JOIN product_images pi ON pi.product_id = p.id
	WHERE p.is_active AND pi.visual_aid AND NOT pi.hidden
	  AND (CASE WHEN p.exclusive
	        THEN EXISTS (SELECT 1 FROM product_partner_access ppa
	                     WHERE ppa.product_id = p.id AND ppa.partner_id = pt.id AND ppa.access = 'allowed')
	        ELSE NOT EXISTS (SELECT 1 FROM product_partner_access ppa
	                         WHERE ppa.product_id = p.id AND ppa.partner_id = pt.id AND ppa.access = 'hidden')
	       END)
),
decks AS (
	INSERT INTO partner_presentations (partner_id, name)
	SELECT DISTINCT partner_id, $2 FROM imgs
	RETURNING id, partner_id
),
slides AS (
	INSERT INTO presentation_slides (presentation_id, product_image_id, sort_order)
	SELECT d.id, i.image_id, i.pos FROM decks d JOIN imgs i ON i.partner_id = d.partner_id
	RETURNING presentation_id
)
SELECT (SELECT count(*) FROM decks), (SELECT count(*) FROM slides),
       (SELECT count(*) FROM users WHERE role = 'partner' AND deleted_at IS NULL) - (SELECT count(*) FROM partners)`

func main() {
	apply := flag.Bool("apply", false, "add the decks (without it: dry run, rolled back)")
	flag.Parse()
	_ = godotenv.Load()
	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DB_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	tx, err := db.Begin(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer tx.Rollback(ctx)

	var partners int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'partner' AND deleted_at IS NULL`).Scan(&partners); err != nil {
		log.Fatal(err)
	}
	var totalDecks, totalSlides int64
	for _, d := range divisions {
		var decks, slides, already int64
		if err := tx.QueryRow(ctx, addDivisionSQL, d.categoryID, d.name).Scan(&decks, &slides, &already); err != nil {
			log.Fatalf("%s: %v", d.name, err)
		}
		totalDecks += decks
		totalSlides += slides
		perDeck := int64(0)
		if decks > 0 {
			perDeck = slides / decks
		}
		fmt.Printf("  %-40s %4d decks, ~%d slides each, %d partners already had it\n", d.name, decks, perDeck, already)
	}

	verb := "would add"
	if *apply {
		if err := tx.Commit(ctx); err != nil {
			log.Fatal(err)
		}
		verb = "ADDED"
	}
	fmt.Printf("%d partners: %s %d decks, %d slides\n", partners, verb, totalDecks, totalSlides)
}
