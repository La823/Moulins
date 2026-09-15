package server

import (
	"log"
	"net/http"
	"time"
)

// New creates an HTTP server with sane defaults
func New(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:        addr,
		Handler:     handler,
		ReadTimeout: 10 * time.Second,
		// Handlers that make several sequential external calls per
		// request — pushing an order to Marg ERP is one call per line
		// item — can legitimately run past a few seconds on a large
		// order. 10s was cutting those connections dead mid-response
		// (browser sees "Failed to fetch", no error body) well before
		// nginx's own 3600s proxy_read_timeout would ever kick in.
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
}

// Start runs the server
func Start(srv *http.Server) {
	log.Println("🚀 Server listening on", srv.Addr)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
