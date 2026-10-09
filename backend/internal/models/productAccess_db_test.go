package models

import (
	"context"
	"os"
	"sort"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Runs the product visibility rule against real Postgres without touching
// real data: one connection, with session-only TEMP tables named like the
// real ones. A temp table shadows the real table of the same name for that
// session, so the production queries below run unchanged against throwaway
// rows, take no locks on the real tables, and leave nothing behind.
//
// Opt-in, because it needs a database:
//
//	PRODUCT_ACCESS_TEST_DB=<postgres url> go test ./internal/models/ -run TestProductAccess
func TestProductAccessAgainstPostgres(t *testing.T) {
	url := os.Getenv("PRODUCT_ACCESS_TEST_DB")
	if url == "" {
		t.Skip("set PRODUCT_ACCESS_TEST_DB to run")
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns, cfg.MinConns = 1, 1 // temp tables live on one connection
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
	}
	exec(`CREATE TEMP TABLE products (LIKE public.products INCLUDING DEFAULTS)`)
	exec(`ALTER TABLE pg_temp.products ADD COLUMN IF NOT EXISTS exclusive BOOLEAN NOT NULL DEFAULT FALSE`)
	exec(`CREATE TEMP TABLE users (LIKE public.users INCLUDING DEFAULTS)`)
	exec(`CREATE TEMP TABLE product_partner_access (
		product_id UUID NOT NULL, partner_id UUID NOT NULL,
		access TEXT NOT NULL CHECK (access IN ('hidden', 'allowed')),
		created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (product_id, partner_id))`)
	// make sure every query below really is on the temp copy
	var schema string
	if err := db.QueryRow(ctx, `SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE c.oid = 'products'::regclass`).Scan(&schema); err != nil || schema == "public" {
		t.Fatalf("products resolves to %q, not the temp table (%v) — refusing to go on", schema, err)
	}

	newUser := func(role string, owner *uuid.UUID) uuid.UUID {
		id := uuid.New()
		exec(`INSERT INTO users (id, phone_number, username, role, team_owner_id, password_hash) VALUES ($1, $2, $3, $4, $5, 'x')`,
			id, id.String()[:10], "test "+role, role, owner)
		return id
	}
	newProduct := func(name string) uuid.UUID {
		id := uuid.New()
		exec(`INSERT INTO products (id, name, description, price, is_active) VALUES ($1, $2, '', 1, TRUE)`, id, name)
		return id
	}

	alice := newUser("partner", nil)
	bob := newUser("partner", nil)
	aliceRep := newUser("team_member", &alice)
	doc := newUser("doctor", nil)

	normal := newProduct("Normal")
	hiddenFromAlice := newProduct("Hidden from Alice")
	onlyForAlice := newProduct("Only for Alice")

	set := func(p uuid.UUID, req SetProductAccessRequest) {
		t.Helper()
		if err := SetProductAccess(ctx, db, p, req, nil); err != nil {
			t.Fatal(err)
		}
	}
	set(hiddenFromAlice, SetProductAccessRequest{HiddenFor: []uuid.UUID{alice}})
	set(onlyForAlice, SetProductAccessRequest{Exclusive: true, AllowedFor: []uuid.UUID{alice}})

	viewer := func(id uuid.UUID, role string) ProductViewer { return ResolveProductViewer(ctx, db, id, role) }
	names := func(v ProductViewer) []string {
		t.Helper()
		ps, _, _, err := GetAllProductsWithSuggestion(ctx, db, v, true, "", "", "", "", "", "", "", "", 0, 0, false, false, "", "")
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, p := range ps {
			out = append(out, p.Name)
		}
		sort.Strings(out)
		return out
	}
	expect := func(who string, got []string, want ...string) {
		t.Helper()
		sort.Strings(want)
		if len(got) != len(want) {
			t.Errorf("%s sees %v, want %v", who, got, want)
			return
		}
		for i := range got {
			if got[i] != want[i] {
				t.Errorf("%s sees %v, want %v", who, got, want)
				return
			}
		}
	}

	expect("logged out", names(ProductViewer{}), "Hidden from Alice", "Normal")
	expect("alice", names(viewer(alice, "partner")), "Normal", "Only for Alice")
	expect("alice's team member", names(viewer(aliceRep, "team_member")), "Normal", "Only for Alice")
	expect("bob", names(viewer(bob, "partner")), "Hidden from Alice", "Normal")
	expect("a doctor", names(viewer(doc, "doctor")), "Hidden from Alice", "Normal")
	expect("staff", names(viewer(uuid.New(), "admin")), "Hidden from Alice", "Normal", "Only for Alice")

	// the per-product check agrees with the list
	for _, c := range []struct {
		who  string
		v    ProductViewer
		p    uuid.UUID
		want bool
	}{
		{"alice/hidden", viewer(alice, "partner"), hiddenFromAlice, false},
		{"alice/exclusive", viewer(alice, "partner"), onlyForAlice, true},
		{"bob/exclusive", viewer(bob, "partner"), onlyForAlice, false},
		{"logged out/exclusive", ProductViewer{}, onlyForAlice, false},
		{"missing product", viewer(bob, "partner"), uuid.New(), false},
	} {
		got, err := CanSeeProduct(ctx, db, c.v, c.p)
		if err != nil || got != c.want {
			t.Errorf("CanSeeProduct %s = %v (%v), want %v", c.who, got, err, c.want)
		}
	}

	hidden, err := HiddenAmong(ctx, db, viewer(bob, "partner"), []uuid.UUID{normal, onlyForAlice})
	if err != nil || len(hidden) != 1 || hidden[0] != onlyForAlice {
		t.Errorf("HiddenAmong for bob = %v (%v), want [only-for-alice]", hidden, err)
	}

	// switching a product to exclusive must not turn its hidden-from list
	// into an allowed-for list: alice stays out, and so does everyone else
	set(hiddenFromAlice, SetProductAccessRequest{Exclusive: true, HiddenFor: []uuid.UUID{alice}})
	expect("alice, after exclusive switch", names(viewer(alice, "partner")), "Normal", "Only for Alice")
	expect("bob, after exclusive switch", names(viewer(bob, "partner")), "Normal")

	// only partners can be named
	err = SetProductAccess(ctx, db, normal, SetProductAccessRequest{HiddenFor: []uuid.UUID{doc}}, nil)
	if _, ok := err.(ErrNotPartners); !ok {
		t.Errorf("naming a doctor: err = %v, want ErrNotPartners", err)
	}

	// per-partner editing, as the visibility screen does it: hide the
	// normal product from bob, then take it back
	if err := SetPartnerProductAccess(ctx, db, bob, normal, "hidden", nil); err != nil {
		t.Fatal(err)
	}
	expect("bob, normal hidden", names(viewer(bob, "partner")))
	sums, err := ListPartnerAccessSummaries(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range sums {
		if s.PartnerID == bob && (s.HiddenCount != 1 || s.AllowedCount != 0) {
			t.Errorf("bob's summary = %+v, want 1 hidden 0 allowed", s)
		}
		if s.PartnerID == alice && s.AllowedCount != 1 {
			t.Errorf("alice's summary = %+v, want 1 allowed", s)
		}
	}
	if err := RemovePartnerProductAccess(ctx, db, bob, normal); err != nil {
		t.Fatal(err)
	}
	expect("bob, normal shown again", names(viewer(bob, "partner")), "Normal")
	if err := SetPartnerProductAccess(ctx, db, doc, normal, "hidden", nil); err == nil {
		t.Error("hiding from a doctor should be refused")
	}

	if has, _ := PartnerHasAccessRules(ctx, db, bob); has {
		t.Error("bob has no rules but PartnerHasAccessRules says he does")
	}
	if has, _ := PartnerHasAccessRules(ctx, db, alice); !has {
		t.Error("alice has rules but PartnerHasAccessRules says she doesn't")
	}
}
