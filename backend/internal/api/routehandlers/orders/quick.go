package orders

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// The staff order page's data, from Redis. The catalogue takes a few
// seconds to build (every product and every live Marg batch), so it is
// rebuilt in the background every quickCatalogueEvery and the page never
// waits for it. Its key sits under "products:", which product edits
// already clear; the next request (or the next rebuild) fills it again.

const (
	quickCatalogueKey   = "products:quick-catalogue"
	quickCatalogueTTL   = 10 * time.Minute
	quickCatalogueEvery = 3 * time.Minute
	lastRatesTTL        = 10 * time.Minute
)

func lastRatesKey(partner string) string { return "lastrates:" + partner }

var startWarmer sync.Once

func buildQuickCatalogue(ctx context.Context, db *pgxpool.Pool, rdb *cache.Client) (models.QuickCatalogue, error) {
	c, err := models.GetQuickCatalogue(ctx, db)
	if err != nil {
		return c, err
	}
	for i := range c.Products {
		if k := c.Products[i].ThumbKey; k != nil && *k != "" {
			c.Products[i].ThumbURL = utils.GetPublicURL(*k)
		}
	}
	rdb.SetJSON(ctx, quickCatalogueKey, c, quickCatalogueTTL)
	return c, nil
}

// GET /admin/orders/quick-catalogue — every product (name, MOQ, prices,
// thumbnail, stock) and its live batches (earliest expiry first), for the
// staff order page to search and page through without further requests.
func QuickCatalogueHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	startWarmer.Do(func() {
		go func() {
			for {
				ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
				if _, err := buildQuickCatalogue(ctx, db, rdb); err != nil {
					log.Printf("quick catalogue rebuild: %v", err)
				}
				cancel()
				time.Sleep(quickCatalogueEvery)
			}
		}()
	})
	return func(w http.ResponseWriter, r *http.Request) {
		var c models.QuickCatalogue
		if r.URL.Query().Get("fresh") != "1" && rdb.GetJSON(r.Context(), quickCatalogueKey, &c) {
			writeQuickJSON(w, c)
			return
		}
		c, err := buildQuickCatalogue(r.Context(), db, rdb)
		if err != nil {
			log.Printf("quick catalogue: %v", err)
			http.Error(w, "could not load the products", http.StatusInternalServerError)
			return
		}
		writeQuickJSON(w, c)
	}
}

// GET /admin/partners/{id}/last-rates — the partner's last rate for every
// product they have been charged for: {rates: {product_id: {rate, date, source}}}.
func LastRatesHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid partner id", http.StatusBadRequest)
			return
		}
		key := lastRatesKey(id.String())
		var rates map[string]models.LastRate
		if !rdb.GetJSON(r.Context(), key, &rates) {
			rates, err = models.GetLastRates(r.Context(), db, id.String())
			if err != nil {
				log.Printf("last rates %s: %v", id, err)
				http.Error(w, "could not load past rates", http.StatusInternalServerError)
				return
			}
			rdb.SetJSON(r.Context(), key, rates, lastRatesTTL)
		}
		writeQuickJSON(w, map[string]any{"rates": rates})
	}
}

func writeQuickJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	json.NewEncoder(w).Encode(v)
}
