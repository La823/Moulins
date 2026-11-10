package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/lavanyaarora/server/internal/models"
)

// A retailer reaches only the listed routes; other roles are untouched.
func TestRetailerLimits(t *testing.T) {
	r := mux.NewRouter()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	for _, p := range []struct{ method, path string }{
		{"POST", "/orders"}, {"GET", "/orders"}, {"GET", "/team"}, {"GET", "/doctors"}, {"GET", "/profile/balance"},
		{"GET", "/cart"}, {"PATCH", "/cart/items/{productId}"}, {"POST", "/retailer-orders"},
		{"GET", "/retailer-orders/{id}"}, {"PUT", "/retailer-orders/{id}/accept"}, {"GET", "/retailers"},
	} {
		r.Handle(p.path, ok).Methods(p.method)
	}
	r.Use(RetailerLimits)

	try := func(role, method, path string) int {
		req := httptest.NewRequest(method, path, nil)
		req = req.WithContext(context.WithValue(req.Context(), "role", role))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	for _, c := range []struct {
		role, method, path string
		want               int
	}{
		{models.RoleRetailer, "POST", "/orders", http.StatusForbidden},
		{models.RoleRetailer, "GET", "/orders", http.StatusForbidden},
		{models.RoleRetailer, "GET", "/team", http.StatusForbidden},
		{models.RoleRetailer, "GET", "/doctors", http.StatusForbidden},
		{models.RoleRetailer, "GET", "/profile/balance", http.StatusForbidden},
		{models.RoleRetailer, "GET", "/retailers", http.StatusForbidden},
		{models.RoleRetailer, "PUT", "/retailer-orders/abc/accept", http.StatusForbidden},
		{models.RoleRetailer, "GET", "/cart", http.StatusOK},
		{models.RoleRetailer, "PATCH", "/cart/items/123", http.StatusOK},
		{models.RoleRetailer, "POST", "/retailer-orders", http.StatusOK},
		{models.RoleRetailer, "GET", "/retailer-orders/abc", http.StatusOK},
		{"partner", "POST", "/orders", http.StatusOK},
		{"partner", "GET", "/retailers", http.StatusOK},
	} {
		if got := try(c.role, c.method, c.path); got != c.want {
			t.Errorf("%s %s %s: got %d, want %d", c.role, c.method, c.path, got, c.want)
		}
	}
}
