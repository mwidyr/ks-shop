// Package cache is a small in-process TTL cache with request de-duplication, for read-heavy
// aggregates (dashboard numbers, workbench overview, lookup lists). It is deliberately simple: one
// process, no persistence. A short TTL is the safety net; code that changes the underlying data calls
// Invalidate so the next read is fresh.
package cache

import (
	"strings"
	"sync"
	"time"
)

type entry struct {
	value   any
	expires time.Time
}

type call struct {
	wg  sync.WaitGroup
	val any
	err error
}

var (
	mu       sync.Mutex
	entries  = map[string]entry{}
	inflight = map[string]*call{}
	// generation counts invalidations, so a load that started before an Invalidate does not store
	// its (possibly stale) result afterwards.
	generation uint64
	now        = time.Now
)

// Get returns the cached value for key, or runs load, caches the result for ttl and returns it.
// Concurrent callers for the same missing key share ONE load. Errors are never cached.
func Get[T any](key string, ttl time.Duration, load func() (T, error)) (T, error) {
	mu.Lock()
	if e, ok := entries[key]; ok && now().Before(e.expires) {
		mu.Unlock()
		return e.value.(T), nil
	}
	if c, ok := inflight[key]; ok {
		mu.Unlock()
		c.wg.Wait()
		if c.err != nil {
			var zero T
			return zero, c.err
		}
		return c.val.(T), nil
	}
	c := &call{}
	c.wg.Add(1)
	inflight[key] = c
	gen := generation
	mu.Unlock()

	v, err := load()

	mu.Lock()
	delete(inflight, key)
	if err == nil && gen == generation {
		entries[key] = entry{value: v, expires: now().Add(ttl)}
	}
	mu.Unlock()
	c.val, c.err = v, err
	c.wg.Done()
	return v, err
}

// Invalidate drops every cached entry whose key starts with prefix ("" drops everything).
func Invalidate(prefix string) {
	mu.Lock()
	defer mu.Unlock()
	generation++
	for k := range entries {
		if strings.HasPrefix(k, prefix) {
			delete(entries, k)
		}
	}
}
