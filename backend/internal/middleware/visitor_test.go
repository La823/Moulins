package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVisitorLimits(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTeapot) })
	h := VisitorLimits(ok)
	cases := []struct {
		role, method, path string
		want               int
	}{
		{"visitor", "GET", "/auth/me", http.StatusTeapot},
		{"visitor", "POST", "/visitor/partnership-request", http.StatusTeapot},
		{"visitor", "GET", "/cart", http.StatusForbidden},
		{"visitor", "POST", "/orders", http.StatusForbidden},
		{"visitor", "GET", "/notifications", http.StatusForbidden},
		{"visitor", "GET", "/admin/orders", http.StatusForbidden},
		{"partner", "GET", "/cart", http.StatusTeapot},
		{"admin", "GET", "/admin/orders", http.StatusTeapot},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, c.path, nil)
		r = r.WithContext(context.WithValue(r.Context(), "role", c.role))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Errorf("%s %s %s: got %d, want %d", c.role, c.method, c.path, w.Code, c.want)
		}
	}
}
