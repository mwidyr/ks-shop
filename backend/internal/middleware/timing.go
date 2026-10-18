package middleware

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// RequestTiming logs method, path, status, bytes and duration of every request. It is meant for
// measuring (set REQUEST_LOG=1) and is a no-op otherwise. Slow requests (>= slowAfter) are marked.
func RequestTiming(enabled bool, slowAfter time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if !enabled {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			next.ServeHTTP(ww, r)
			d := time.Since(start)
			mark := ""
			if d >= slowAfter {
				mark = " SLOW"
			}
			log.Printf("req %s %s?%s -> %d %dB %dms%s", r.Method, r.URL.Path, r.URL.RawQuery, ww.Status(), ww.BytesWritten(), d.Milliseconds(), mark)
		})
	}
}
