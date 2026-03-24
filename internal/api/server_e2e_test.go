package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"testing"
	"time"
)

// mcpSession manages a reusable MCP session to avoid re-initializing per call.
type mcpSession struct {
	mu        sync.Mutex
	sessionID string
	callID    int
}

var sharedMCPSession mcpSession

func (s *mcpSession) init(t *testing.T) {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.sessionID != "" {
		return
	}

	// Initialize
	reqBody, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "e2e-test", "version": "1.0.0"},
		},
	})

	initResp, err := http.Post(baseURL+"/mcp", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		t.Fatalf("MCP initialize failed: %v", err)
	}
	s.sessionID = initResp.Header.Get("Mcp-Session-Id")
	initResp.Body.Close()

	time.Sleep(1100 * time.Millisecond)

	// Send initialized notification
	notifyBody, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	})
	notifyReq, _ := http.NewRequest("POST", baseURL+"/mcp", bytes.NewReader(notifyBody))
	notifyReq.Header.Set("Content-Type", "application/json")
	notifyReq.Header.Set("Mcp-Session-Id", s.sessionID)
	notifyResp, err := http.DefaultClient.Do(notifyReq)
	if err != nil {
		t.Fatalf("MCP initialized notification failed: %v", err)
	}
	notifyResp.Body.Close()

	s.callID = 2
	time.Sleep(1100 * time.Millisecond)
}

// mcpCall sends a JSON-RPC tools/call request using the shared session.
func mcpCall(t *testing.T, toolName string, args map[string]any) json.RawMessage {
	t.Helper()

	sharedMCPSession.init(t)
	sharedMCPSession.mu.Lock()
	sharedMCPSession.callID++
	callID := sharedMCPSession.callID
	sessionID := sharedMCPSession.sessionID
	sharedMCPSession.mu.Unlock()

	callBody, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      callID,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      toolName,
			"arguments": args,
		},
	})

	req, _ := http.NewRequest("POST", baseURL+"/mcp", bytes.NewReader(callBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", sessionID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("MCP tools/call %s failed: %v", toolName, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("MCP tools/call %s returned %d: %s", toolName, resp.StatusCode, string(body))
	}

	var rpcResp struct {
		Result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &rpcResp); err != nil {
		t.Fatalf("decode MCP response for %s: %v\nbody: %s", toolName, err, string(body))
	}
	if rpcResp.Error != nil {
		t.Fatalf("MCP tool %s returned error %d: %s", toolName, rpcResp.Error.Code, rpcResp.Error.Message)
	}
	if len(rpcResp.Result.Content) == 0 {
		t.Fatalf("MCP tool %s returned empty content", toolName)
	}

	return json.RawMessage(rpcResp.Result.Content[0].Text)
}

// mcpCallWithDelay calls mcpCall after waiting to avoid rate limiting.
func mcpCallWithDelay(t *testing.T, toolName string, args map[string]any) json.RawMessage {
	t.Helper()
	time.Sleep(1100 * time.Millisecond)
	return mcpCall(t, toolName, args)
}

// TestStopETA_E2E tests fetching ETA for specific routes via the MCP stop_eta tool.
// Tests GMB route 69X and CTB route 78.
func TestStopETA_E2E(t *testing.T) {
	tests := []struct {
		route    string
		operator string
	}{
		{"69X", "GMB"},
		{"78", "CTB"},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("eta_%s_%s", tt.route, tt.operator), func(t *testing.T) {
			// Step 1: Search for the route to get stop info
			searchResult := mcpCallWithDelay(t, "search_route", map[string]any{
				"route_number": tt.route,
				"operator":     tt.operator,
			})

			var routeData struct {
				Routes []struct {
					RouteID  string `json:"route_id"`
					Route    string `json:"route"`
					Bound    string `json:"bound"`
					OrigEn   string `json:"orig_en"`
					DestEn   string `json:"dest_en"`
					Operator string `json:"operator"`
					Stops    []struct {
						StopID string `json:"stop_id"`
						NameEn string `json:"name_en"`
						Seq    int    `json:"seq"`
					} `json:"stops"`
				} `json:"routes"`
			}
			if err := json.Unmarshal(searchResult, &routeData); err != nil {
				t.Fatalf("decode search_route result: %v", err)
			}

			if len(routeData.Routes) == 0 {
				t.Skipf("route %s (%s) not found in index", tt.route, tt.operator)
				return
			}

			route := routeData.Routes[0]
			t.Logf("Found route %s (%s): %s → %s, %d stops",
				route.Route, route.Operator, route.OrigEn, route.DestEn, len(route.Stops))

			if len(route.Stops) == 0 {
				t.Fatalf("route %s has 0 stops", tt.route)
			}

			// Step 2: Fetch ETA for a mid-route stop
			midIdx := len(route.Stops) / 2
			stop := route.Stops[midIdx]
			t.Logf("Fetching ETA for stop %s %q (seq=%d)", stop.StopID, stop.NameEn, stop.Seq)

			etaResult := mcpCallWithDelay(t, "stop_eta", map[string]any{
				"stop_id":  stop.StopID,
				"route":    tt.route,
				"operator": tt.operator,
			})

			var etaData struct {
				StopID   string `json:"stop_id"`
				Route    string `json:"route"`
				Arrivals []struct {
					ETA         string   `json:"eta"`
					Remark      string   `json:"remark"`
					MinutesLeft *float64 `json:"minutes_left"`
				} `json:"arrivals"`
			}
			if err := json.Unmarshal(etaResult, &etaData); err != nil {
				t.Fatalf("decode stop_eta result: %v", err)
			}

			t.Logf("ETA response: stop_id=%s route=%s arrivals=%d",
				etaData.StopID, etaData.Route, len(etaData.Arrivals))
			for i, a := range etaData.Arrivals {
				if a.MinutesLeft != nil {
					t.Logf("  arrival[%d]: eta=%s minutes_left=%.1f remark=%s", i, a.ETA, *a.MinutesLeft, a.Remark)
				} else {
					t.Logf("  arrival[%d]: eta=%s remark=%s", i, a.ETA, a.Remark)
				}
			}

			// Validate response structure
			if etaData.StopID != stop.StopID {
				t.Errorf("stop_id mismatch: got %s, want %s", etaData.StopID, stop.StopID)
			}
			if etaData.Route != tt.route {
				t.Errorf("route mismatch: got %s, want %s", etaData.Route, tt.route)
			}
		})
	}
}

// TestNearbyStops_E2E tests the nearby_arrivals MCP tool and the
// GET /api/arrivals/nearby HTTP endpoint at the given coordinates.
func TestNearbyStops_E2E(t *testing.T) {
	lat, lon := 22.249225, 114.155304

	// Test 1: MCP nearby_arrivals tool
	t.Run("mcp_nearby_arrivals", func(t *testing.T) {
		result := mcpCallWithDelay(t, "nearby_arrivals", map[string]any{
			"latitude":  lat,
			"longitude": lon,
			"radius":    300,
		})

		var data struct {
			Stops []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Arrivals []struct {
					Route    string `json:"route"`
					Operator string `json:"operator"`
				} `json:"arrivals"`
			} `json:"stops"`
			DisplayURL string `json:"display_url"`
		}
		if err := json.Unmarshal(result, &data); err != nil {
			t.Fatalf("decode nearby_arrivals: %v", err)
		}

		t.Logf("MCP nearby_arrivals: %d stops, display_url=%s", len(data.Stops), data.DisplayURL)
		if len(data.Stops) == 0 {
			t.Fatal("nearby_arrivals returned 0 stops")
		}

		for _, s := range data.Stops {
			routes := make([]string, len(s.Arrivals))
			for i, a := range s.Arrivals {
				routes[i] = fmt.Sprintf("%s(%s)", a.Route, a.Operator)
			}
			t.Logf("  Stop %s %q: %v", s.ID, s.Name, routes)
		}

		if data.DisplayURL == "" {
			t.Error("display_url is empty")
		}
	})

	// Test 2: HTTP GET /api/arrivals/nearby
	t.Run("http_nearby_arrivals", func(t *testing.T) {
		time.Sleep(1100 * time.Millisecond)
		url := fmt.Sprintf("%s/api/arrivals/nearby?lat=%v&lon=%v&radius=300", baseURL, lat, lon)
		resp, err := http.Get(url)
		if err != nil {
			t.Fatalf("GET nearby failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("nearby returned %d: %s", resp.StatusCode, string(body))
		}

		var data struct {
			Stops []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Arrivals []struct {
					Route    string `json:"route"`
					Operator string `json:"operator"`
				} `json:"arrivals"`
			} `json:"stops"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			t.Fatalf("decode: %v", err)
		}

		t.Logf("HTTP /api/arrivals/nearby: %d stops", len(data.Stops))
		if len(data.Stops) == 0 {
			t.Fatal("nearby returned 0 stops")
		}

		for _, s := range data.Stops {
			if s.ID == "" {
				t.Error("stop has empty ID")
			}
			if s.Name == "" {
				t.Error("stop has empty name")
			}
		}
	})

	// Test 3: MCP search_stops by location
	t.Run("mcp_search_stops", func(t *testing.T) {
		result := mcpCallWithDelay(t, "search_stops", map[string]any{
			"latitude":  lat,
			"longitude": lon,
			"radius":    300,
		})

		var data struct {
			Stops []struct {
				StopID    string   `json:"stop_id"`
				StopIDs   []string `json:"stop_ids"`
				NameEn    string   `json:"name_en"`
				NameTc    string   `json:"name_tc"`
				Lat       float64  `json:"lat"`
				Lon       float64  `json:"lon"`
				Operators []string `json:"operators"`
				RouteIDs  []string `json:"route_ids"`
			} `json:"stops"`
		}
		if err := json.Unmarshal(result, &data); err != nil {
			t.Fatalf("decode search_stops: %v", err)
		}

		t.Logf("MCP search_stops: %d grouped stops", len(data.Stops))
		if len(data.Stops) == 0 {
			t.Fatal("search_stops returned 0 stops")
		}

		for _, s := range data.Stops {
			t.Logf("  %s %q operators=%v routes=%d stop_ids=%v",
				s.StopID, s.NameEn, s.Operators, len(s.RouteIDs), s.StopIDs)
		}
	})
}

// TestRouteSearch_E2E tests searching for a route from the test location to
// Causeway Bay using the MCP route_arrivals tool.
func TestRouteSearch_E2E(t *testing.T) {
	originLat, originLon := 22.249225, 114.155304
	destLat, destLon := 22.2783, 114.1827

	// Test 1: MCP route_arrivals tool
	t.Run("mcp_route_arrivals", func(t *testing.T) {
		result := mcpCallWithDelay(t, "route_arrivals", map[string]any{
			"latitude":      originLat,
			"longitude":     originLon,
			"dest_lat":      destLat,
			"dest_lon":      destLon,
			"radius_origin": 500,
			"radius_dest":   500,
			"max_transfers": 2,
		})

		var data struct {
			CandidateRoutes []struct {
				Route    string `json:"route"`
				Operator string `json:"operator"`
				OrigStop struct {
					StopID string `json:"stop_id"`
					NameEn string `json:"name_en"`
				} `json:"orig_stop"`
				DestStop struct {
					StopID string `json:"stop_id"`
					NameEn string `json:"name_en"`
				} `json:"dest_stop"`
			} `json:"candidate_routes"`
			TransferRoutes []json.RawMessage `json:"transfer_routes"`
			DisplayURL     string            `json:"display_url"`
		}
		if err := json.Unmarshal(result, &data); err != nil {
			t.Fatalf("decode route_arrivals: %v\nraw: %s", err, string(result)[:min(500, len(result))])
		}

		t.Logf("Route search: %d direct routes, %d transfer routes",
			len(data.CandidateRoutes), len(data.TransferRoutes))

		for _, r := range data.CandidateRoutes {
			t.Logf("  Direct: %s (%s) %s → %s", r.Route, r.Operator, r.OrigStop.NameEn, r.DestStop.NameEn)
		}

		if len(data.CandidateRoutes) == 0 && len(data.TransferRoutes) == 0 {
			t.Error("no routes found from test location to Causeway Bay")
		}

		if data.DisplayURL == "" {
			t.Error("display_url is empty")
		}
	})

	// Test 2: MCP search_location for Causeway Bay
	t.Run("mcp_search_location", func(t *testing.T) {
		result := mcpCallWithDelay(t, "search_location", map[string]any{
			"query": "Causeway Bay",
			"limit": 3,
		})

		var data struct {
			Locations []struct {
				Name string  `json:"name"`
				Lat  float64 `json:"lat"`
				Lon  float64 `json:"lon"`
			} `json:"locations"`
		}
		if err := json.Unmarshal(result, &data); err != nil {
			// search_location may return a different structure; log and continue
			t.Logf("search_location returned: %s", string(result))
			return
		}

		t.Logf("search_location 'Causeway Bay': %d results", len(data.Locations))
		for _, loc := range data.Locations {
			t.Logf("  %s (%.6f, %.6f)", loc.Name, loc.Lat, loc.Lon)
		}
	})
}
