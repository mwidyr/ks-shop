package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"ordermgmt/internal/cache"
)

func TestCacheResponses(t *testing.T) {
	cache.Invalidate("")
	var calls int32
	h := CacheResponses(time.Minute, "t")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		if r.URL.Query().Get("fail") == "1" {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"n":` + string(rune('0'+n)) + `}`))
	}))
	get := func(uri string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", uri, nil))
		return rec
	}

	a, b := get("/x?a=1"), get("/x?a=1")
	if calls != 1 || a.Body.String() != b.Body.String() || b.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("same URL must be served from the cache: calls=%d %q %q", calls, a.Body.String(), b.Body.String())
	}
	if get("/x?a=2"); calls != 2 {
		t.Errorf("a different URL is a different entry (calls=%d)", calls)
	}
	get("/x?fail=1")
	if rec := get("/x?fail=1"); calls != 4 || rec.Code != 500 {
		t.Errorf("an error answer must not be cached: calls=%d code=%d", calls, rec.Code)
	}
	cache.Invalidate("t:")
	get("/x?a=1")
	if calls != 5 {
		t.Errorf("after Invalidate the handler must run again (calls=%d)", calls)
	}

	post := httptest.NewRecorder()
	h.ServeHTTP(post, httptest.NewRequest("POST", "/x?a=1", nil))
	if calls != 6 {
		t.Errorf("only GET is cached (calls=%d)", calls)
	}
}
