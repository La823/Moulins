package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/models"
	"github.com/lavanyaarora/server/internal/utils"
)

// Product list cache scopes. Everyone who sees the same products shares one:
// logged-out visitors and partners without any rules all see the public
// catalogue, so only partners with rules of their own get a cache of their own.
const (
	ProductScopePublic = "public"
	ProductScopeAll    = "all"
)

// cachedProductViewer is what's remembered per user, so working out whose
// rules apply doesn't cost a database round trip on every catalogue request.
type cachedProductViewer struct {
	SeesAll   bool   `json:"sees_all"`
	PartnerID string `json:"partner_id"`
	HasRules  bool   `json:"has_rules"`
}

const productViewerTTL = 5 * time.Minute

// InvalidateProductViewers forgets every user's cached catalogue scope —
// after a product's visibility changes, since whether a partner has rules
// at all may have changed with it.
func InvalidateProductViewers(ctx context.Context, rdb *cache.Client) {
	rdb.DelPattern(ctx, "productscope:*")
}

// ProductViewerFor works out whose catalogue rules apply to this request, and
// which product-list cache it can share.
//
// It works on public routes as well as protected ones: where the Auth
// middleware hasn't run, it reads the token itself and treats a missing,
// malformed or expired one as logged out — never as an error, because the
// catalogue is public.
func ProductViewerFor(r *http.Request, db *pgxpool.Pool, rdb *cache.Client) (models.ProductViewer, string) {
	userID, role, ok := requestUser(r)
	if !ok {
		return models.ProductViewer{}, ProductScopePublic
	}
	ctx := r.Context()
	key := "productscope:" + userID.String()

	var c cachedProductViewer
	if !rdb.GetJSON(ctx, key, &c) {
		v := models.ResolveProductViewer(ctx, db, userID, role)
		c = cachedProductViewer{SeesAll: v.SeesAll}
		if v.PartnerID != nil {
			c.PartnerID = v.PartnerID.String()
			has, err := models.PartnerHasAccessRules(ctx, db, *v.PartnerID)
			// if we can't tell, give them their own cache: slower, never wrong
			c.HasRules = has || err != nil
		}
		rdb.SetJSON(ctx, key, c, productViewerTTL)
	}

	if c.SeesAll {
		return models.EveryProduct, ProductScopeAll
	}
	pid, err := uuid.Parse(c.PartnerID)
	if err != nil {
		return models.ProductViewer{}, ProductScopePublic
	}
	if !c.HasRules {
		return models.ProductViewer{PartnerID: &pid}, ProductScopePublic
	}
	return models.ProductViewer{PartnerID: &pid}, "p:" + pid.String()
}

// requestUser is the logged-in user, from the Auth middleware's context when
// it ran, or else from the request's own bearer token.
func requestUser(r *http.Request) (uuid.UUID, string, bool) {
	if idStr, ok := r.Context().Value("user_id").(string); ok {
		id, err := uuid.Parse(idStr)
		role, _ := r.Context().Value("role").(string)
		return id, role, err == nil
	}
	parts := strings.SplitN(r.Header.Get("Authorization"), " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return uuid.Nil, "", false
	}
	claims, err := utils.ValidateToken(parts[1])
	if err != nil {
		return uuid.Nil, "", false
	}
	return claims.UserID, claims.Role, true
}

// ProductViewerOnly is ProductViewerFor without the cache scope, for
// handlers that filter a user's own lists (cart, favourites) and don't
// cache them. It costs no database round trip except for a team member,
// whose partner has to be looked up.
func ProductViewerOnly(r *http.Request, db *pgxpool.Pool) models.ProductViewer {
	userID, role, ok := requestUser(r)
	if !ok {
		return models.ProductViewer{}
	}
	return models.ResolveProductViewer(r.Context(), db, userID, role)
}
