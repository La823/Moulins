package products

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// Product card thumbnails — a small copy of the product's first image, so
// a page of cards doesn't download full-size originals. Originals are only
// ever read; see utils/thumbnail.go.

var errNoImage = errors.New("this product has no image to make a thumbnail from")

// regenerateThumbnail makes a thumbnail from the product's current first
// image, records it, and deletes the thumbnail it replaces.
func regenerateThumbnail(ctx context.Context, db *pgxpool.Pool, rdb *cache.Client, productID uuid.UUID) (thumbKey, sourceKey string, err error) {
	sourceKey, err = models.GetProductCoverImageKey(ctx, db, productID)
	if err != nil {
		return "", "", err
	}
	if sourceKey == "" {
		return "", "", errNoImage
	}
	thumbKey, err = utils.MakeThumbnail(ctx, sourceKey)
	if err != nil {
		return "", "", err
	}
	old, err := models.SetProductThumbnail(ctx, db, productID, thumbKey, sourceKey)
	if err != nil {
		_ = utils.DeleteThumbnail(thumbKey) // not recorded, so not needed
		return "", "", err
	}
	if old != nil && *old != thumbKey {
		if err := utils.DeleteThumbnail(*old); err != nil {
			log.Printf("delete old thumbnail %s: %v", *old, err)
		}
	}
	rdb.Del(ctx, "product:"+productID.String())
	rdb.DelPattern(ctx, "products:*")
	return thumbKey, sourceKey, nil
}

// ensureThumbnailAsync makes a thumbnail for a product that has none yet —
// called after an image is added, so a new product gets one without anyone
// pressing the button. A product that already has one is left alone: if its
// first image changed, the product page says so and offers to regenerate.
func ensureThumbnailAsync(db *pgxpool.Pool, rdb *cache.Client, productID uuid.UUID) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		p, err := models.GetProductByID(ctx, db, productID)
		if err != nil || p.ThumbKey != nil {
			return
		}
		if _, _, err := regenerateThumbnail(ctx, db, rdb, productID); err != nil && !errors.Is(err, errNoImage) {
			log.Printf("auto thumbnail for product %s: %v", productID, err)
		}
	}()
}

// POST /admin/products/{id}/thumbnail — (re)make the card thumbnail from the
// product's current first image.
func RegenerateThumbnailHandler(db *pgxpool.Pool, rdb *cache.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(mux.Vars(r)["id"])
		if err != nil {
			http.Error(w, "invalid product id", http.StatusBadRequest)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		thumbKey, sourceKey, err := regenerateThumbnail(ctx, db, rdb, id)
		if errors.Is(err, errNoImage) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Printf("regenerate thumbnail for %s: %v", id, err)
			http.Error(w, "could not make the thumbnail", http.StatusInternalServerError)
			return
		}
		models.LogAction(r.Context(), db, actorID(r), "product.thumbnail_generated", "product", &id, "Generated card thumbnail")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"thumb_key":        thumbKey,
			"thumb_url":        utils.GetPublicURL(thumbKey),
			"thumb_source_key": sourceKey,
		})
	}
}
