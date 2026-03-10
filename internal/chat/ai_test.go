package chat

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompressHistory_Success(t *testing.T) {
	expectedSummary := "The user asked about bus routes near Tsim Sha Tsui. The assistant provided arrival times for routes 1, 1A at Nathan Road."

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req completionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}

		// Verify the request structure
		if len(req.Messages) != 2 {
			t.Fatalf("expected 2 messages (system + user), got %d", len(req.Messages))
		}
		if req.Messages[0].Role != "system" {
			t.Fatalf("expected first message role 'system', got %q", req.Messages[0].Role)
		}
		if req.Messages[1].Role != "user" {
			t.Fatalf("expected second message role 'user', got %q", req.Messages[1].Role)
		}

		// No tools should be sent for compression
		if len(req.Tools) != 0 {
			t.Fatalf("expected no tools for compression request, got %d", len(req.Tools))
		}

		resp := completionResponse{
			Choices: []struct {
				Message chatMessage `json:"message"`
			}{
				{Message: chatMessage{Role: "assistant", Content: expectedSummary}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewAIClient(srv.URL, "test-key", "test-model", nil)
	messages := []Message{
		{Role: "user", Content: "What buses are near Tsim Sha Tsui?"},
		{Role: "assistant", Content: "Route 1 and 1A are arriving at Nathan Road bus stop in 3 and 5 minutes."},
		{Role: "user", Content: "Thanks!"},
		{Role: "assistant", Content: "You're welcome!"},
	}

	summary, err := client.CompressHistory(context.Background(), messages)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if summary != expectedSummary {
		t.Fatalf("expected summary %q, got %q", expectedSummary, summary)
	}
}

func TestCompressHistory_EmptyChoices(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := completionResponse{Choices: nil}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewAIClient(srv.URL, "test-key", "test-model", nil)
	_, err := client.CompressHistory(context.Background(), []Message{
		{Role: "user", Content: "hello"},
	})
	if err == nil {
		t.Fatal("expected error for empty choices, got nil")
	}
}

func TestCompressHistory_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"internal error"}`))
	}))
	defer srv.Close()

	client := NewAIClient(srv.URL, "test-key", "test-model", nil)
	_, err := client.CompressHistory(context.Background(), []Message{
		{Role: "user", Content: "hello"},
	})
	if err == nil {
		t.Fatal("expected error for API failure, got nil")
	}
}

func TestCompressHistory_MessageFormatting(t *testing.T) {
	var receivedContent string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req completionRequest
		json.NewDecoder(r.Body).Decode(&req)
		receivedContent = req.Messages[1].Content

		resp := completionResponse{
			Choices: []struct {
				Message chatMessage `json:"message"`
			}{
				{Message: chatMessage{Role: "assistant", Content: "summary"}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewAIClient(srv.URL, "test-key", "test-model", nil)
	messages := []Message{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi there"},
	}

	_, err := client.CompressHistory(context.Background(), messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected := "user: hello\nassistant: hi there\n"
	if receivedContent != expected {
		t.Fatalf("expected formatted content %q, got %q", expected, receivedContent)
	}
}
