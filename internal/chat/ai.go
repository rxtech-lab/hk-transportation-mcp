package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
)

const (
	maxToolIterations = 10
	notBusQueryReply  = "Sorry, I can only help with Hong Kong bus-related queries such as bus routes, bus stops, and real-time arrivals. Please ask me something about HK buses!"

	guardPrompt = `You are a classifier. Determine whether the user's message is related to Hong Kong bus transportation (bus routes, bus stops, bus arrivals, nearby buses, travelling between locations by bus, or greetings that could lead to bus queries).

Respond with ONLY one word: "yes" or "no".
- "yes" if the message is about HK buses, transportation between locations, location sharing, or is a greeting/general conversation starter.
- "no" if the message is clearly about something unrelated to HK bus transportation.`
)

func getSystemPrompt() string {
	now := time.Now().In(time.FixedZone("HKT", 8*60*60))
	return fmt.Sprintf(`You are a Hong Kong bus arrival assistant on WhatsApp. You ONLY answer questions related to Hong Kong bus routes, bus stops, bus arrivals, and bus-related transportation.

Current date and time (Hong Kong, UTC+8): %s

If a user asks about anything unrelated to Hong Kong buses, politely decline and let them know you can only help with bus-related queries.

When users ask about bus arrivals, nearby buses, or real-time bus information without providing a location, ask them to share their location using WhatsApp's built-in location feature. Instruct them: tap the attachment (paperclip) icon in the chat, select "Location", then choose "Send Your Current Location". Once they share their location, use it to find nearby buses.
When users ask about going from A to B, use search_location to resolve names, then route_arrivals to find direct routes.
Use send_message to immediately acknowledge the user before looking up bus information (e.g. "Let me check that for you...").
Respond concisely — WhatsApp messages should be short and readable.
Use plain text, no markdown formatting.`, now.Format("2006-01-02 15:04 MST"))
}

// SendFunc is a callback to immediately send a message to the user.
type SendFunc func(ctx context.Context, text string) error

// ToolExecutor can execute bus service tools by name.
type ToolExecutor struct {
	Nearby *service.NearbyArrivalsService
	Route  *service.RouteArrivalsService
	Search *service.SearchLocationService
}

// AIClient calls the Vercel AI Gateway (OpenAI-compatible).
type AIClient struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
	model      string
	tools      []toolDef
	executor   *ToolExecutor
	sendFunc   SendFunc // set per-request for send_message tool
}

// NewAIClient creates an AI client for chat completions with tool calling.
func NewAIClient(baseURL, apiKey, model string, executor *ToolExecutor) *AIClient {
	return &AIClient{
		httpClient: &http.Client{},
		baseURL:    baseURL,
		apiKey:     apiKey,
		model:      model,
		tools:      buildToolDefs(),
		executor:   executor,
	}
}

// isBusQuery calls the AI with a lightweight classification prompt to check
// if the user's message is related to HK bus transportation.
func (c *AIClient) isBusQuery(ctx context.Context, userMessage string) (bool, error) {
	messages := []chatMessage{
		{Role: "system", Content: guardPrompt},
		{Role: "user", Content: userMessage},
	}

	resp, err := c.callCompletions(ctx, messages)
	if err != nil {
		return false, err
	}

	if len(resp.Choices) == 0 {
		return false, fmt.Errorf("no choices in guard response")
	}

	answer := strings.TrimSpace(strings.ToLower(resp.Choices[0].Message.Content))
	return answer == "yes", nil
}

// Chat sends messages to the AI and handles tool call loops. Returns the final assistant text.
// sendFn is an optional callback that enables the send_message tool to immediately reply to the user.
func (c *AIClient) Chat(ctx context.Context, history []Message, userMessage string, sendFn SendFunc) (string, error) {
	c.sendFunc = sendFn

	// Guard: check if the message is bus-related before proceeding
	isBus, err := c.isBusQuery(ctx, userMessage)
	if err != nil {
		return "", fmt.Errorf("guard check: %w", err)
	}
	if !isBus {
		return notBusQueryReply, nil
	}

	messages := c.buildMessages(history, userMessage)

	for i := 0; i < maxToolIterations; i++ {
		resp, err := c.callCompletions(ctx, messages, c.tools)
		if err != nil {
			return "", err
		}

		if len(resp.Choices) == 0 {
			return "", fmt.Errorf("no choices in response")
		}

		choice := resp.Choices[0]

		// If no tool calls, return the text content
		if len(choice.Message.ToolCalls) == 0 {
			return choice.Message.Content, nil
		}

		// Append assistant message with tool calls
		messages = append(messages, choice.Message)

		// Execute each tool call and append results
		for _, tc := range choice.Message.ToolCalls {
			result, err := c.executeTool(ctx, tc.Function.Name, tc.Function.Arguments)
			if err != nil {
				result = fmt.Sprintf("Error: %v", err)
			}
			messages = append(messages, chatMessage{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}
	}

	return "", fmt.Errorf("exceeded max tool iterations")
}

func (c *AIClient) buildMessages(history []Message, userMessage string) []chatMessage {
	msgs := []chatMessage{
		{Role: "system", Content: getSystemPrompt()},
	}
	for _, m := range history {
		msgs = append(msgs, chatMessage{Role: m.Role, Content: m.Content})
	}
	msgs = append(msgs, chatMessage{Role: "user", Content: userMessage})
	return msgs
}

func (c *AIClient) callCompletions(ctx context.Context, messages []chatMessage, tools ...[]toolDef) (*completionResponse, error) {
	body := completionRequest{
		Model:    c.model,
		Messages: messages,
	}
	if len(tools) > 0 {
		body.Tools = tools[0]
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("AI gateway returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result completionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func (c *AIClient) executeTool(ctx context.Context, name, argsJSON string) (string, error) {
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", fmt.Errorf("unmarshal tool args: %w", err)
	}

	switch name {
	case "nearby_arrivals":
		lat, _ := args["latitude"].(float64)
		lon, _ := args["longitude"].(float64)
		radius := 300.0
		if r, ok := args["radius"].(float64); ok {
			radius = r
		}
		result, err := c.executor.Nearby.Execute(ctx, lat, lon, radius)
		if err != nil {
			return "", err
		}
		data, _ := json.Marshal(result)
		return string(data), nil

	case "route_arrivals":
		lat, _ := args["latitude"].(float64)
		lon, _ := args["longitude"].(float64)
		destLat, _ := args["dest_lat"].(float64)
		destLon, _ := args["dest_lon"].(float64)
		radiusOrigin := 300.0
		radiusDest := 300.0
		if r, ok := args["radius_origin"].(float64); ok {
			radiusOrigin = r
		}
		if r, ok := args["radius_dest"].(float64); ok {
			radiusDest = r
		}
		result, err := c.executor.Route.Execute(ctx, lat, lon, destLat, destLon, radiusOrigin, radiusDest)
		if err != nil {
			return "", err
		}
		data, _ := json.Marshal(result)
		return string(data), nil

	case "search_location":
		query, _ := args["query"].(string)
		limit := 5
		if l, ok := args["limit"].(float64); ok {
			limit = int(l)
		}
		result, err := c.executor.Search.Execute(ctx, query, limit)
		if err != nil {
			return "", err
		}
		data, _ := json.Marshal(result)
		return string(data), nil

	case "send_message":
		text, _ := args["message"].(string)
		if text == "" {
			return "", fmt.Errorf("send_message: message is required")
		}
		if c.sendFunc == nil {
			return "", fmt.Errorf("send_message: no sender configured")
		}
		if err := c.sendFunc(ctx, text); err != nil {
			return "", fmt.Errorf("send_message: %w", err)
		}
		return "Message sent successfully", nil

	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}
}

// OpenAI-compatible types

type chatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type toolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function functionCall `json:"function"`
}

type functionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type completionRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Tools    []toolDef     `json:"tools,omitempty"`
}

type completionResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

type toolDef struct {
	Type     string      `json:"type"`
	Function toolFuncDef `json:"function"`
}

type toolFuncDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

func buildToolDefs() []toolDef {
	return []toolDef{
		{
			Type: "function",
			Function: toolFuncDef{
				Name:        "nearby_arrivals",
				Description: "Find bus stops near a location and get real-time arrival times.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"latitude":  map[string]interface{}{"type": "number", "description": "Latitude (WGS84)"},
						"longitude": map[string]interface{}{"type": "number", "description": "Longitude (WGS84)"},
						"radius":    map[string]interface{}{"type": "number", "description": "Search radius in meters (default: 300)"},
					},
					"required": []string{"latitude", "longitude"},
				},
			},
		},
		{
			Type: "function",
			Function: toolFuncDef{
				Name:        "route_arrivals",
				Description: "Find direct bus routes connecting origin to destination with real-time arrivals.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"latitude":      map[string]interface{}{"type": "number", "description": "Origin latitude (WGS84)"},
						"longitude":     map[string]interface{}{"type": "number", "description": "Origin longitude (WGS84)"},
						"dest_lat":      map[string]interface{}{"type": "number", "description": "Destination latitude (WGS84)"},
						"dest_lon":      map[string]interface{}{"type": "number", "description": "Destination longitude (WGS84)"},
						"radius_origin": map[string]interface{}{"type": "number", "description": "Origin search radius in meters (default: 300)"},
						"radius_dest":   map[string]interface{}{"type": "number", "description": "Destination search radius in meters (default: 300)"},
					},
					"required": []string{"latitude", "longitude", "dest_lat", "dest_lon"},
				},
			},
		},
		{
			Type: "function",
			Function: toolFuncDef{
				Name:        "search_location",
				Description: "Search for a location in Hong Kong by name and find nearby bus stops.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"query": map[string]interface{}{"type": "string", "description": "Location name or address in Hong Kong"},
						"limit": map[string]interface{}{"type": "number", "description": "Max results (default: 5)"},
					},
					"required": []string{"query"},
				},
			},
		},
		{
			Type: "function",
			Function: toolFuncDef{
				Name:        "send_message",
				Description: "Immediately send a message to the user on WhatsApp. Use this to provide quick acknowledgements or intermediate updates while you look up bus information.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"message": map[string]interface{}{"type": "string", "description": "The message text to send to the user immediately"},
					},
					"required": []string{"message"},
				},
			},
		},
	}
}
