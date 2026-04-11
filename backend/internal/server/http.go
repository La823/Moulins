package server

import (
	"log"
	"net/http"
	"time"
)

// New creates an HTTP server with sane defaults
func New(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
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
