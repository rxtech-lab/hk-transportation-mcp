package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/chat"
)

// Handler processes incoming WhatsApp webhook events.
type Handler struct {
	repo   *chat.Repository
	ai     *chat.AIClient
	sender *Sender
}

// NewHandler creates a new WhatsApp webhook handler.
func NewHandler(repo *chat.Repository, ai *chat.AIClient, sender *Sender) *Handler {
	return &Handler{
		repo:   repo,
		ai:     ai,
		sender: sender,
	}
}

// WebhookPayload represents the WaSenderAPI webhook event.
// Real payload: { "event": "messages.received", "data": { "messages": { "key": {...}, "message": {...}, "messageBody": "..." } } }
type WebhookPayload struct {
	Event string       `json:"event"`
	Data  WebhookData  `json:"data"`
}

// WebhookData wraps the messages object inside data.
// For test webhooks, "message" is a string at this level; for real ones, "messages" is the object.
type WebhookData struct {
	Messages MessageData     `json:"messages"`
	RawMsg   json.RawMessage `json:"message"`
}

// MessageData represents data.messages in a real webhook event.
type MessageData struct {
	Key         MessageKey     `json:"key"`
	Message     MessageContent `json:"-"`
	MessageBody string         `json:"messageBody"`
	RawMsg      json.RawMessage `json:"message"`
}

// UnmarshalJSON handles both string and object forms of the message field.
func (d *MessageData) UnmarshalJSON(data []byte) error {
	type Alias MessageData
	aux := &struct {
		RawMsg json.RawMessage `json:"message"`
		*Alias
	}{
		Alias: (*Alias)(d),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	if len(aux.RawMsg) > 0 && aux.RawMsg[0] == '{' {
		return json.Unmarshal(aux.RawMsg, &d.Message)
	}
	return nil
}

// MessageKey contains the sender and message identifiers.
type MessageKey struct {
	RemoteJID string `json:"remoteJid"`
	FromMe    bool   `json:"fromMe"`
	ID        string `json:"id"`
}

// MessageContent contains the actual message content.
type MessageContent struct {
	Conversation        string           `json:"conversation"`
	ExtendedTextMessage *ExtendedText    `json:"extendedTextMessage"`
	LocationMessage     *LocationMessage `json:"locationMessage"`
}

// ExtendedText contains text from an extended text message.
type ExtendedText struct {
	Text string `json:"text"`
}

// LocationMessage contains location data shared by the user.
type LocationMessage struct {
	DegreesLatitude  float64 `json:"degreesLatitude"`
	DegreesLongitude float64 `json:"degreesLongitude"`
	Name             string  `json:"name"`
	Address          string  `json:"address"`
}

// ServeHTTP handles incoming webhook requests.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Printf("whatsapp webhook: %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)

	var payload WebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("whatsapp webhook: invalid payload: %v", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	log.Printf("whatsapp webhook: event=%s jid=%s fromMe=%v", payload.Event, payload.Data.Messages.Key.RemoteJID, payload.Data.Messages.Key.FromMe)

	// Only process incoming messages
	if payload.Event != "messages.upsert" && payload.Event != "messages.received" {
		log.Printf("whatsapp webhook: skipping event %s", payload.Event)
		w.WriteHeader(http.StatusOK)
		return
	}

	// Skip outgoing messages
	if payload.Data.Messages.Key.FromMe {
		log.Printf("whatsapp webhook: skipping outgoing message")
		w.WriteHeader(http.StatusOK)
		return
	}

	// Respond 200 immediately to avoid webhook timeout
	w.WriteHeader(http.StatusOK)

	// Process asynchronously
	go h.processMessage(payload)
}

func (h *Handler) processMessage(payload WebhookPayload) {
	ctx := context.Background()
	jid := payload.Data.Messages.Key.RemoteJID

	// Extract user message text
	userText := h.extractText(payload.Data.Messages.Message)
	if userText == "" {
		return
	}

	log.Printf("whatsapp: received from %s: %s", jid, userText)

	// Load chat history
	history, err := h.repo.GetHistory(ctx, jid)
	if err != nil {
		log.Printf("whatsapp: get history for %s: %v", jid, err)
		history = nil
	}

	log.Printf("whatsapp: loaded %d history messages for %s", len(history), jid)

	// Call AI with send callback for immediate replies
	log.Printf("whatsapp: calling AI for %s", jid)
	sendFn := func(ctx context.Context, text string) error {
		return h.sender.SendMessage(ctx, jid, text)
	}
	response, err := h.ai.Chat(ctx, history, userText, sendFn)
	if err != nil {
		log.Printf("whatsapp: AI error for %s: %v", jid, err)
		response = "Sorry, I'm having trouble right now. Please try again."
	}
	log.Printf("whatsapp: AI response for %s: %s", jid, response)

	// Save user message and assistant response
	if err := h.repo.SaveMessage(ctx, jid, "user", userText); err != nil {
		log.Printf("whatsapp: save user message for %s: %v", jid, err)
	}
	if err := h.repo.SaveMessage(ctx, jid, "assistant", response); err != nil {
		log.Printf("whatsapp: save assistant message for %s: %v", jid, err)
	}

	// Send reply
	log.Printf("whatsapp: sending reply to %s", jid)
	if err := h.sender.SendMessage(ctx, jid, response); err != nil {
		log.Printf("whatsapp: send message to %s: %v", jid, err)
	} else {
		log.Printf("whatsapp: reply sent to %s", jid)
	}

	// Compress history if messages exceed threshold (runs after response is sent)
	go h.compressIfNeeded(context.Background(), jid)
}

func (h *Handler) compressIfNeeded(ctx context.Context, jid string) {
	count, err := h.repo.CountMessages(ctx, jid)
	if err != nil {
		log.Printf("whatsapp: count messages for %s: %v", jid, err)
		return
	}

	if count < h.repo.MaxMessages() {
		return
	}

	log.Printf("whatsapp: compressing %d messages for %s", count, jid)

	// Load full history for compression
	history, err := h.repo.GetHistory(ctx, jid)
	if err != nil {
		log.Printf("whatsapp: get history for compression %s: %v", jid, err)
		return
	}

	// Use AI to summarize
	summary, err := h.ai.CompressHistory(ctx, history)
	if err != nil {
		log.Printf("whatsapp: compress history for %s: %v", jid, err)
		return
	}

	// Replace all messages with the compressed summary
	if err := h.repo.CompressMessages(ctx, jid, summary); err != nil {
		log.Printf("whatsapp: save compressed history for %s: %v", jid, err)
		return
	}

	log.Printf("whatsapp: compressed %d messages into summary for %s", count, jid)
}

func (h *Handler) extractText(msg MessageContent) string {
	// Location message
	if msg.LocationMessage != nil {
		loc := msg.LocationMessage
		text := fmt.Sprintf("My location is lat=%f, lon=%f", loc.DegreesLatitude, loc.DegreesLongitude)
		if loc.Name != "" {
			text += fmt.Sprintf(" (%s)", loc.Name)
		}
		return text
	}

	// Plain text
	if msg.Conversation != "" {
		return msg.Conversation
	}

	// Extended text
	if msg.ExtendedTextMessage != nil && msg.ExtendedTextMessage.Text != "" {
		return msg.ExtendedTextMessage.Text
	}

	return ""
}
