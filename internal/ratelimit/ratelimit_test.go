package ratelimit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func setupRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return mr, client
}

func TestAllow_UnauthenticatedLimit(t *testing.T) {
	mr, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 2,
		AuthMaxRequests:    10,
		Window:             1 * time.Second,
	}, client)

	ctx := context.Background()
	key := "192.168.1.1:1234"

	// First 2 requests should be allowed
	if !rl.Allow(ctx, key, false) {
		t.Fatal("expected first request to be allowed")
	}
	if !rl.Allow(ctx, key, false) {
		t.Fatal("expected second request to be allowed")
	}

	// Third request should be denied
	if rl.Allow(ctx, key, false) {
		t.Fatal("expected third request to be denied")
	}

	// After window expires, should be allowed again
	mr.FastForward(2 * time.Second)
	if !rl.Allow(ctx, key, false) {
		t.Fatal("expected request after window expiry to be allowed")
	}
}

func TestAllow_AuthenticatedHigherLimit(t *testing.T) {
	_, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    5,
		Window:             1 * time.Second,
	}, client)

	ctx := context.Background()
	key := "auth:user123"

	// Authenticated user should get 5 requests
	for i := 0; i < 5; i++ {
		if !rl.Allow(ctx, key, true) {
			t.Fatalf("expected authenticated request %d to be allowed", i+1)
		}
	}

	// 6th should be denied
	if rl.Allow(ctx, key, true) {
		t.Fatal("expected 6th authenticated request to be denied")
	}
}

func TestAllow_SeparateKeysIndependent(t *testing.T) {
	_, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    10,
		Window:             1 * time.Second,
	}, client)

	ctx := context.Background()

	// Exhaust limit for IP A
	if !rl.Allow(ctx, "ip-a", false) {
		t.Fatal("expected ip-a first request to be allowed")
	}
	if rl.Allow(ctx, "ip-a", false) {
		t.Fatal("expected ip-a second request to be denied")
	}

	// IP B should still be allowed
	if !rl.Allow(ctx, "ip-b", false) {
		t.Fatal("expected ip-b first request to be allowed")
	}
}

func TestMiddleware_Unauthenticated(t *testing.T) {
	_, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    10,
		Window:             1 * time.Second,
	}, client)

	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request: allowed
	req := httptest.NewRequest("POST", "/mcp", nil)
	req.RemoteAddr = "10.0.0.1:5000"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	// Second request: rate limited
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", rec.Code)
	}
}

func TestMiddleware_AuthenticatedNoRateLimit(t *testing.T) {
	_, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    10,
		Window:             1 * time.Second,
	}, client)

	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Authenticated requests should never be rate-limited
	for i := 0; i < 20; i++ {
		req := httptest.NewRequest("POST", "/mcp", nil)
		req.RemoteAddr = "10.0.0.2:5000"
		req.Header.Set("X-Authenticated-Subject", "user-abc")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 on request %d, got %d", i+1, rec.Code)
		}
	}
}

func TestMiddleware_AuthAndUnauthIndependent(t *testing.T) {
	_, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    1,
		Window:             1 * time.Second,
	}, client)

	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Exhaust unauthenticated limit from same IP
	req := httptest.NewRequest("POST", "/mcp", nil)
	req.RemoteAddr = "10.0.0.3:5000"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", rec.Code)
	}

	// Authenticated request from same IP should still work (different key)
	authReq := httptest.NewRequest("POST", "/mcp", nil)
	authReq.RemoteAddr = "10.0.0.3:5000"
	authReq.Header.Set("X-Authenticated-Subject", "user-xyz")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, authReq)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for authenticated request, got %d", rec.Code)
	}
}

func TestAllow_WindowExpiry(t *testing.T) {
	mr, client := setupRedis(t)
	defer client.Close()

	rl := New(Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    10,
		Window:             500 * time.Millisecond,
	}, client)

	ctx := context.Background()
	key := "expiry-test"

	if !rl.Allow(ctx, key, false) {
		t.Fatal("expected first request to be allowed")
	}
	if rl.Allow(ctx, key, false) {
		t.Fatal("expected second request to be denied")
	}

	// Fast-forward past window
	mr.FastForward(600 * time.Millisecond)

	if !rl.Allow(ctx, key, false) {
		t.Fatal("expected request after window to be allowed")
	}
}
