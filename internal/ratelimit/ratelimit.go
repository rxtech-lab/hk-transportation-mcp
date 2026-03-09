package ratelimit

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// Config holds rate limit settings.
type Config struct {
	// Max requests per window for unauthenticated users.
	DefaultMaxRequests int
	// Max requests per window for authenticated (OAuth) users.
	AuthMaxRequests int
	// Sliding window duration.
	Window time.Duration
}

// DefaultConfig returns sensible defaults: 1 req/s unauthenticated, 10 req/s authenticated.
func DefaultConfig() Config {
	return Config{
		DefaultMaxRequests: 1,
		AuthMaxRequests:    10,
		Window:             1 * time.Second,
	}
}

// Limiter manages rate limiting via Redis sliding window log.
type Limiter struct {
	cfg    Config
	client *redis.Client
}

// New creates a new Redis-backed Limiter.
func New(cfg Config, client *redis.Client) *Limiter {
	return &Limiter{cfg: cfg, client: client}
}

// slidingWindowScript uses a Redis sorted set as a sliding window log.
// Members are timestamped entries; expired entries are pruned on each call.
var slidingWindowScript = redis.NewScript(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count current entries
local count = redis.call('ZCARD', key)

if count < limit then
    -- Add new entry
    redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
    redis.call('PEXPIRE', key, window)
    return 1
else
    redis.call('PEXPIRE', key, window)
    return 0
end
`)

// Allow checks whether a request identified by key should be allowed.
func (l *Limiter) Allow(ctx context.Context, key string, isAuthenticated bool) bool {
	maxReqs := l.cfg.DefaultMaxRequests
	if isAuthenticated {
		maxReqs = l.cfg.AuthMaxRequests
	}

	now := time.Now().UnixMilli()
	windowMs := l.cfg.Window.Milliseconds()

	result, err := slidingWindowScript.Run(ctx, l.client,
		[]string{fmt.Sprintf("ratelimit:%s", key)},
		now, windowMs, maxReqs,
	).Int()
	if err != nil {
		log.Printf("Rate limit Redis error: %v (allowing request)", err)
		return true // fail open
	}
	return result == 1
}

// Middleware returns an HTTP middleware that rate-limits requests.
// It uses the "X-Authenticated-Subject" header (set by the optional OAuth middleware)
// to determine auth status and key. Unauthenticated requests are keyed by IP.
func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subject := r.Header.Get("X-Authenticated-Subject")
		isAuth := subject != ""

		key := r.RemoteAddr
		if isAuth {
			key = "auth:" + subject
		}

		if !l.Allow(r.Context(), key, isAuth) {
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}
