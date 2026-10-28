package middleware

import (
	"net/http"

	"github.com/lavanyaarora/server/internal/models"
)

// visitorAllowed is everything a visitor may reach behind the login: who
// they are, and their "become a partner" request. The catalogue itself is
// on public routes. Anything else is refused — a new protected route is
// closed to visitors until it's listed here.
var visitorAllowed = map[string]bool{
	"GET /auth/me":                      true,
	"GET /visitor/partnership-request":  true,
	"POST /visitor/partnership-request": true,
	"POST /visitor/events":              true,
}

// VisitorLimits keeps visitors to the few routes in visitorAllowed. Runs
// after Auth on the protected router, so it covers every subrouter of it.
func VisitorLimits(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if role, _ := r.Context().Value("role").(string); role == models.RoleVisitor &&
			!visitorAllowed[r.Method+" "+r.URL.Path] {
			http.Error(w, "become a partner to use this", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// IsVisitor: the request is from a visitor's login. Works on public routes
// too, reading the token itself.
func IsVisitor(r *http.Request) bool {
	_, role, ok := requestUser(r)
	return ok && role == models.RoleVisitor
}
