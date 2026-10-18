package cache

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGetCachesUntilTTL(t *testing.T) {
	Invalidate("")
	clock := time.Now()
	now = func() time.Time { return clock }
	defer func() { now = time.Now }()

	var loads int32
	load := func() (int, error) { atomic.AddInt32(&loads, 1); return 42, nil }
	for i := 0; i < 3; i++ {
		if v, err := Get("k", time.Minute, load); err != nil || v != 42 {
			t.Fatalf("got %v %v", v, err)
		}
	}
	if loads != 1 {
		t.Fatalf("loaded %d times, want 1", loads)
	}
	clock = clock.Add(2 * time.Minute)
	Get("k", time.Minute, load)
	if loads != 2 {
		t.Fatalf("after expiry loaded %d times, want 2", loads)
	}
}

func TestErrorsAreNotCached(t *testing.T) {
	Invalidate("")
	calls := 0
	load := func() (string, error) {
		calls++
		if calls == 1 {
			return "", errors.New("boom")
		}
		return "ok", nil
	}
	if _, err := Get("e", time.Minute, load); err == nil {
		t.Fatal("expected the first error")
	}
	if v, err := Get("e", time.Minute, load); err != nil || v != "ok" {
		t.Fatalf("second call: %v %v", v, err)
	}
}

func TestInvalidateByPrefix(t *testing.T) {
	Invalidate("")
	n := 0
	load := func() (int, error) { n++; return n, nil }
	Get("shipping:a", time.Minute, load)
	Get("dash:a", time.Minute, load)
	Invalidate("shipping:")
	if v, _ := Get("dash:a", time.Minute, load); v != 2 {
		t.Errorf("dash entry should survive, got %d", v)
	}
	if v, _ := Get("shipping:a", time.Minute, load); v != 3 {
		t.Errorf("shipping entry should reload, got %d", v)
	}
}

func TestConcurrentCallersShareOneLoad(t *testing.T) {
	Invalidate("")
	var loads int32
	release := make(chan struct{})
	load := func() (int, error) { atomic.AddInt32(&loads, 1); <-release; return 7, nil }
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); Get("c", time.Minute, load) }()
	}
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()
	if loads != 1 {
		t.Fatalf("loaded %d times, want 1", loads)
	}
}

func TestInvalidateDuringLoadDropsStaleResult(t *testing.T) {
	Invalidate("")
	started, release := make(chan struct{}), make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		Get("s", time.Minute, func() (int, error) { close(started); <-release; return 1, nil })
	}()
	<-started
	Invalidate("s")
	close(release)
	wg.Wait()
	n := 0
	if v, _ := Get("s", time.Minute, func() (int, error) { n++; return 2, nil }); v != 2 || n != 1 {
		t.Fatalf("a result loaded before the invalidation must not be cached (got %d, loads %d)", v, n)
	}
}
