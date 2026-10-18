package middleware

import (
	"net/http"
	"strconv"
	"time"

	"ordermgmt/internal/cache"
)

type cachedResponse struct {
	status int
	header http.Header
	body   []byte
}

type recorder struct {
	header http.Header
	status int
	body   []byte
}

func (r *recorder) Header() http.Header         { return r.header }
func (r *recorder) WriteHeader(status int)      { r.status = status }
func (r *recorder) Write(b []byte) (int, error) { r.body = append(r.body, b...); return len(b), nil }

// CacheResponses keeps the successful GET responses of a (read-only, expensive) route in memory for
// ttl, per user and per full URL (so a role-filtered answer is never shown to another user), and lets
// concurrent identical requests share one run of the handler. Only 200 responses are kept. Drop them
// early with cache.Invalidate(prefix) when the underlying data changes.
func CacheResponses(ttl time.Duration, prefix string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				next.ServeHTTP(w, r)
				return
			}
			who := "anon"
			if c := GetClaims(r); c != nil {
				who = c.Role + ":" + strconv.Itoa(c.UserID)
			}
			key := prefix + ":" + who + ":" + r.URL.RequestURI()
			resp, err := cache.Get(key, ttl, func() (cachedResponse, error) {
				rec := &recorder{header: http.Header{}, status: http.StatusOK}
				next.ServeHTTP(rec, r)
				return cachedResponse{status: rec.status, header: rec.header, body: rec.body}, nil
			})
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}
			if resp.status != http.StatusOK {
				cache.Invalidate(key) // never keep an error answer
			}
			for k, v := range resp.header {
				w.Header()[k] = v
			}
			w.WriteHeader(resp.status)
			w.Write(resp.body)
		})
	}
}
