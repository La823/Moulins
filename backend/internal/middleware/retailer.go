package middleware

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/lavanyaarora/server/internal/models"
)

// retailerAllowed is everything a retailer may reach behind the login, by
// route pattern: who they are, the catalogue extras (cart, favourites,
// recently viewed), notifications, their password and address, account
// deletion, and their orders to their partner. The catalogue itself is on
// public routes. Anything else (orders to Moulins, ledger, team, doctors…)
// is refused — a new protected route stays closed to retailers until it's
// listed here.
var retailerAllowed = map[string]bool{
	"GET /auth/me":                              true,
	"PUT /profile/password":                     true,
	"PUT /profile/address":                      true,
	"GET /notifications":                        true,
	"PUT /notifications/{id}/read":              true,
	"POST /device-tokens":                       true,
	"POST /account/deletion-request":            true,
	"GET /account/deletion-request":             true,
	"DELETE /account/deletion-request":          true,
	"GET /cart":                                 true,
	"DELETE /cart":                              true,
	"POST /cart/items":                          true,
	"PATCH /cart/items/{productId}":             true,
	"DELETE /cart/items/{productId}":            true,
	"GET /products/images/{imgId}/download-url": true,
	"POST /products/{id}/view":                  true,
	"GET /recently-viewed":                      true,
	"GET /favorites":                            true,
	"GET /favorites/ids":                        true,
	"POST /favorites/{id}":                      true,
	"DELETE /favorites/{id}":                    true,
	"POST /retailer-orders":                     true,
	"GET /retailer-orders":                      true,
	"GET /retailer-orders/{id}":                 true,
	"PUT /retailer-orders/{id}/cancel":          true,
}

// RetailerLimits keeps retailers to the routes in retailerAllowed. Runs
// after Auth on the protected router (gorilla runs middleware after the
// route matched, so its pattern is known).
func RetailerLimits(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if role, _ := r.Context().Value("role").(string); role == models.RoleRetailer {
			tpl := ""
			if route := mux.CurrentRoute(r); route != nil {
				tpl, _ = route.GetPathTemplate()
			}
			if !retailerAllowed[r.Method+" "+tpl] {
				http.Error(w, "This is not available for retailer accounts.", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// BuysFromPartner: the request is from a retailer's or a doctor's login,
// who see MRP only and order from their partner. Works on public routes too.
func BuysFromPartner(r *http.Request) bool {
	_, role, ok := requestUser(r)
	return ok && models.BuysFromPartner(role)
}

// IsRetailer: the request is from a retailer's login. Works on public routes
// too, reading the token itself.
func IsRetailer(r *http.Request) bool {
	_, role, ok := requestUser(r)
	return ok && role == models.RoleRetailer
}
