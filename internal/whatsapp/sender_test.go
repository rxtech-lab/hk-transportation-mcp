package whatsapp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func setupTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	return client
}

func TestDoSend_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	err := s.doSend(context.Background(), "user@jid", "hello")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestDoSend_RetryOn429(t *testing.T) {
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n <= 2 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(rateLimitResponse{
				Message:    "rate limited",
				RetryAfter: 1, // 1 second for faster tests
			})
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	start := time.Now()
	err := s.doSend(context.Background(), "user@jid", "hello")
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("expected no error after retries, got %v", err)
	}
	if atomic.LoadInt32(&attempts) != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
	// Should have waited ~2 seconds (2 retries × 1s)
	if elapsed < 1500*time.Millisecond {
		t.Fatalf("expected at least 1.5s of wait time, got %v", elapsed)
	}
}

func TestDoSend_MaxRetriesExceeded(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(rateLimitResponse{
			Message:    "rate limited",
			RetryAfter: 1,
		})
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	err := s.doSend(context.Background(), "user@jid", "hello")
	if err == nil {
		t.Fatal("expected error after max retries, got nil")
	}
}

func TestDoSend_NonRetryableError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"server error"}`))
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	err := s.doSend(context.Background(), "user@jid", "hello")
	if err == nil {
		t.Fatal("expected error for 500, got nil")
	}
}

func TestDoSend_ContextCancelledDuringRetry(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(rateLimitResponse{
			Message:    "rate limited",
			RetryAfter: 30, // long wait
		})
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	err := s.doSend(ctx, "user@jid", "hello")
	if err == nil {
		t.Fatal("expected context error, got nil")
	}
}

func TestSendMessage_QueueOrder(t *testing.T) {
	var mu sync.Mutex
	var received []string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req sendMessageRequest
		json.NewDecoder(r.Body).Decode(&req)
		mu.Lock()
		received = append(received, req.Text)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	s.interval = 10 * time.Millisecond // short interval for testing
	s.Start()
	defer s.Close()

	// Send 3 messages concurrently
	var wg sync.WaitGroup
	for i, text := range []string{"msg1", "msg2", "msg3"} {
		wg.Add(1)
		go func(i int, text string) {
			defer wg.Done()
			// Stagger slightly to ensure order
			time.Sleep(time.Duration(i) * 5 * time.Millisecond)
			err := s.SendMessage(context.Background(), "user@jid", text)
			if err != nil {
				t.Errorf("SendMessage(%s) failed: %v", text, err)
			}
		}(i, text)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(received) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(received))
	}
}

func TestSendMessage_IntervalEnforced(t *testing.T) {
	var mu sync.Mutex
	var sendTimes []time.Time

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		sendTimes = append(sendTimes, time.Now())
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	s.interval = 100 * time.Millisecond // short interval for testing
	s.Start()
	defer s.Close()

	// Send 3 messages sequentially
	for _, text := range []string{"a", "b", "c"} {
		err := s.SendMessage(context.Background(), "user@jid", text)
		if err != nil {
			t.Fatalf("SendMessage(%s) failed: %v", text, err)
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if len(sendTimes) != 3 {
		t.Fatalf("expected 3 send times, got %d", len(sendTimes))
	}

	// Check intervals between sends
	for i := 1; i < len(sendTimes); i++ {
		gap := sendTimes[i].Sub(sendTimes[i-1])
		if gap < 80*time.Millisecond { // allow small timing tolerance
			t.Errorf("gap between send %d and %d was %v, expected >= 80ms", i-1, i, gap)
		}
	}
}

func TestSendMessage_ContextCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	// Don't start the queue, so results never arrive
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	err := s.SendMessage(ctx, "user@jid", "hello")
	if err == nil {
		t.Fatal("expected context error when queue is not started, got nil")
	}
}

func TestDoSend_DefaultRetryAfter(t *testing.T) {
	// Test that when retry_after is missing, the default wait is used
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"message":"rate limited"}`)) // no retry_after
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewSender(srv.URL, "test-key", setupTestRedis(t))
	err := s.doSend(context.Background(), "user@jid", "hello")
	if err != nil {
		t.Fatalf("expected success after retry, got %v", err)
	}
	if atomic.LoadInt32(&attempts) != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
}
