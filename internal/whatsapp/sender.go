package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	// defaultInterval is the minimum time between outgoing messages.
	defaultInterval = 5 * time.Second
	// maxRetries is the number of times to retry on 429.
	maxRetries = 3
	// defaultRetryWait is the fallback wait time on 429 when retry_after is absent.
	defaultRetryWait = 5 * time.Second

	// redisQueueKey is the Redis list used as the message queue.
	redisQueueKey = "wa:queue"
	// redisLastSentKey tracks the last send timestamp across all pods.
	redisLastSentKey = "wa:last_sent"
	// redisResultPrefix is the key prefix for per-message result delivery.
	redisResultPrefix = "wa:result:"
	// resultTimeout is how long SendMessage waits for a result.
	resultTimeout = 2 * time.Minute
	// resultKeyTTL is how long result keys persist in Redis.
	resultKeyTTL = 5 * time.Minute
)

// Sender sends messages via WaSenderAPI with a Redis-backed queue
// that enforces a minimum interval between sends across pods and retries on 429.
type Sender struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
	redis      *redis.Client
	ctx        context.Context
	cancel     context.CancelFunc
	interval   time.Duration
}

// redisMessage is the JSON payload stored in the Redis queue.
type redisMessage struct {
	ID   string `json:"id"`
	JID  string `json:"jid"`
	Text string `json:"text"`
}

// sendResult is the JSON payload delivered back to the caller via Redis.
type sendResult struct {
	Error string `json:"error,omitempty"`
}

// NewSender creates a new WaSenderAPI sender backed by a Redis queue.
func NewSender(baseURL, apiKey string, redisClient *redis.Client) *Sender {
	ctx, cancel := context.WithCancel(context.Background())
	return &Sender{
		httpClient: &http.Client{},
		baseURL:    baseURL,
		apiKey:     apiKey,
		redis:      redisClient,
		ctx:        ctx,
		cancel:     cancel,
		interval:   defaultInterval,
	}
}

// Start begins processing the Redis message queue in a background goroutine.
func (s *Sender) Start() {
	go s.processQueue()
}

// Close stops the queue processor.
func (s *Sender) Close() {
	s.cancel()
}

type sendMessageRequest struct {
	To   string `json:"to"`
	Text string `json:"text"`
}

// rateLimitResponse is the error body returned by WaSenderAPI on 429.
type rateLimitResponse struct {
	Message    string `json:"message"`
	RetryAfter int    `json:"retry_after"`
}

// SendMessage enqueues a text message in Redis and blocks until it is sent or fails.
func (s *Sender) SendMessage(ctx context.Context, jid, text string) error {
	msg := redisMessage{
		ID:   uuid.New().String(),
		JID:  jid,
		Text: text,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal queue message: %w", err)
	}

	// Push message to Redis queue
	if err := s.redis.RPush(ctx, redisQueueKey, data).Err(); err != nil {
		return fmt.Errorf("enqueue message: %w", err)
	}

	// Wait for result via BLPOP on a per-message result key
	resultKey := redisResultPrefix + msg.ID
	timeout := resultTimeout
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 && remaining < timeout {
			timeout = remaining
		}
	}

	result, err := s.redis.BLPop(ctx, timeout, resultKey).Result()
	if err != nil {
		if err == redis.Nil {
			return fmt.Errorf("send message: timeout waiting for result")
		}
		return fmt.Errorf("wait for result: %w", err)
	}

	// result[0] is the key name, result[1] is the value
	var res sendResult
	if err := json.Unmarshal([]byte(result[1]), &res); err != nil {
		return fmt.Errorf("unmarshal result: %w", err)
	}

	if res.Error != "" {
		return fmt.Errorf("send message: %s", res.Error)
	}
	return nil
}

// acquireSendSlot atomically checks whether enough time has passed since the
// last send and reserves the slot. Returns 0 if the caller can proceed, or
// the number of milliseconds to wait before retrying.
var acquireSendSlot = redis.NewScript(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local interval_ms = tonumber(ARGV[2])

local last = redis.call('GET', key)
if last then
    local elapsed = now - tonumber(last)
    if elapsed < interval_ms then
        return interval_ms - elapsed
    end
end

redis.call('SET', key, now, 'PX', interval_ms * 2)
return 0
`)

// processQueue consumes messages from the Redis queue one at a time,
// enforcing the minimum interval between sends across all pods.
func (s *Sender) processQueue() {
	for {
		if s.ctx.Err() != nil {
			return
		}

		// BLPOP with 1-second timeout to allow periodic shutdown checks
		result, err := s.redis.BLPop(s.ctx, 1*time.Second, redisQueueKey).Result()
		if err != nil {
			if s.ctx.Err() != nil {
				return
			}
			if err == redis.Nil {
				continue // timeout, loop
			}
			log.Printf("whatsapp: queue BLPop error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		var msg redisMessage
		if err := json.Unmarshal([]byte(result[1]), &msg); err != nil {
			log.Printf("whatsapp: unmarshal queue message: %v", err)
			continue
		}

		// Enforce minimum interval between sends using distributed Redis gate
		s.waitForSlot()

		// Send the message
		sendErr := s.doSend(context.Background(), msg.JID, msg.Text)

		// Publish result back to the caller
		res := sendResult{}
		if sendErr != nil {
			res.Error = sendErr.Error()
		}
		resData, _ := json.Marshal(res)
		resultKey := redisResultPrefix + msg.ID

		pipe := s.redis.Pipeline()
		pipe.RPush(s.ctx, resultKey, resData)
		pipe.Expire(s.ctx, resultKey, resultKeyTTL)
		if _, err := pipe.Exec(s.ctx); err != nil {
			log.Printf("whatsapp: publish result for %s: %v", msg.ID, err)
		}
	}
}

// waitForSlot polls the Redis-based distributed rate gate until a send slot
// is available.
func (s *Sender) waitForSlot() {
	for {
		now := time.Now().UnixMilli()
		intervalMs := s.interval.Milliseconds()

		waitMs, err := acquireSendSlot.Run(s.ctx, s.redis,
			[]string{redisLastSentKey},
			now, intervalMs,
		).Int64()
		if err != nil {
			if s.ctx.Err() != nil {
				return
			}
			log.Printf("whatsapp: acquire send slot error: %v (proceeding)", err)
			return // fail open
		}

		if waitMs <= 0 {
			return // slot acquired
		}

		log.Printf("whatsapp: queue waiting %dms before next send", waitMs)
		select {
		case <-time.After(time.Duration(waitMs) * time.Millisecond):
		case <-s.ctx.Done():
			return
		}
	}
}

// doSend performs the HTTP request to WaSenderAPI, retrying on 429.
func (s *Sender) doSend(ctx context.Context, jid, text string) error {
	body := sendMessageRequest{
		To:   jid,
		Text: text,
	}

	for attempt := 0; attempt <= maxRetries; attempt++ {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal send message: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/api/send-message", bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+s.apiKey)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("send message: %w", err)
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			resp.Body.Close()
			return nil
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := defaultRetryWait
			var rlResp rateLimitResponse
			if json.Unmarshal(respBody, &rlResp) == nil && rlResp.RetryAfter > 0 {
				retryAfter = time.Duration(rlResp.RetryAfter) * time.Second
			}

			if attempt < maxRetries {
				log.Printf("whatsapp: rate limited (429), retrying after %v (attempt %d/%d)", retryAfter, attempt+1, maxRetries)
				select {
				case <-time.After(retryAfter):
					continue
				case <-ctx.Done():
					return ctx.Err()
				}
			}
		}

		return fmt.Errorf("WaSenderAPI returned %d: %s", resp.StatusCode, string(respBody))
	}

	return fmt.Errorf("WaSenderAPI: max retries exceeded")
}
