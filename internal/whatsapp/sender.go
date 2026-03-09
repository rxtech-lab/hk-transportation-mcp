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
)

const (
	// defaultInterval is the minimum time between outgoing messages.
	defaultInterval = 5 * time.Second
	// defaultQueueSize is the capacity of the send queue.
	defaultQueueSize = 100
	// maxRetries is the number of times to retry on 429.
	maxRetries = 3
	// defaultRetryWait is the fallback wait time on 429 when retry_after is absent.
	defaultRetryWait = 5 * time.Second
)

// Sender sends messages via WaSenderAPI with an internal queue
// that enforces a minimum interval between sends and retries on 429.
type Sender struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string

	queue    chan *queuedMessage
	done     chan struct{}
	interval time.Duration
}

// queuedMessage represents a message waiting to be sent.
type queuedMessage struct {
	ctx    context.Context
	jid    string
	text   string
	result chan error
}

// NewSender creates a new WaSenderAPI sender.
func NewSender(baseURL, apiKey string) *Sender {
	return &Sender{
		httpClient: &http.Client{},
		baseURL:    baseURL,
		apiKey:     apiKey,
		queue:      make(chan *queuedMessage, defaultQueueSize),
		done:       make(chan struct{}),
		interval:   defaultInterval,
	}
}

// Start begins processing the message queue in a background goroutine.
func (s *Sender) Start() {
	go s.processQueue()
}

// Close stops the queue processor.
func (s *Sender) Close() {
	close(s.done)
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

// SendMessage enqueues a text message and blocks until it is sent or fails.
func (s *Sender) SendMessage(ctx context.Context, jid, text string) error {
	msg := &queuedMessage{
		ctx:    ctx,
		jid:    jid,
		text:   text,
		result: make(chan error, 1),
	}

	select {
	case s.queue <- msg:
	case <-ctx.Done():
		return ctx.Err()
	}

	select {
	case err := <-msg.result:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// processQueue sends queued messages one at a time, waiting at least
// s.interval between each send.
func (s *Sender) processQueue() {
	var lastSent time.Time
	for {
		select {
		case msg := <-s.queue:
			// Enforce minimum interval between sends.
			if elapsed := time.Since(lastSent); elapsed < s.interval {
				wait := s.interval - elapsed
				log.Printf("whatsapp: queue waiting %v before next send", wait)
				select {
				case <-time.After(wait):
				case <-s.done:
					msg.result <- fmt.Errorf("sender closed")
					return
				case <-msg.ctx.Done():
					msg.result <- msg.ctx.Err()
					continue
				}
			}

			err := s.doSend(msg.ctx, msg.jid, msg.text)
			msg.result <- err
			lastSent = time.Now()

		case <-s.done:
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
