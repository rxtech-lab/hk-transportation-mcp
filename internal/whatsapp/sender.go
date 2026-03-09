package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Sender sends messages via WaSenderAPI.
type Sender struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
}

// NewSender creates a new WaSenderAPI sender.
func NewSender(baseURL, apiKey string) *Sender {
	return &Sender{
		httpClient: &http.Client{},
		baseURL:    baseURL,
		apiKey:     apiKey,
	}
}

type sendMessageRequest struct {
	To   string `json:"to"`
	Text string `json:"text"`
}

// SendMessage sends a text message to the given JID.
func (s *Sender) SendMessage(ctx context.Context, jid, text string) error {
	body := sendMessageRequest{
		To:   jid,
		Text: text,
	}

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
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("WaSenderAPI returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}
