package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

const baseURL = "http://localhost:3000"

type routeStopsResp struct {
	Route       string `json:"route"`
	Destination string `json:"destination"`
	Stops       []struct {
		ID   string  `json:"id"`
		Name string  `json:"name"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
		Seq  int     `json:"seq"`
	} `json:"stops"`
}

// TestRouteStopsE2E fetches nearby arrivals at a real location, then verifies
// that /api/route-stops returns stops for each route found — including GMB
// routes and cross-operator grouped stops.
// Requires the server to be running at localhost:3000 with a real DB.
func TestRouteStopsE2E(t *testing.T) {
	// Step 1: Get nearby stops at the given location
	body, _ := json.Marshal(map[string]any{
		"stops":        []map[string]any{{"lat": 22.249225, "lng": 114.155304}},
		"nearbyRadius": 300,
	})
	arrivalsResp, err := http.Post(baseURL+"/api/arrivals", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("arrivals request failed: %v", err)
	}
	defer arrivalsResp.Body.Close()
	if arrivalsResp.StatusCode != 200 {
		t.Fatalf("arrivals returned %d", arrivalsResp.StatusCode)
	}

	var arrivalsData struct {
		Stops []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Arrivals []struct {
				Route    string `json:"route"`
				Operator string `json:"operator"`
			} `json:"arrivals"`
		} `json:"stops"`
	}
	if err := json.NewDecoder(arrivalsResp.Body).Decode(&arrivalsData); err != nil {
		t.Fatalf("decode arrivals: %v", err)
	}
	t.Logf("Nearby arrivals returned %d stops", len(arrivalsData.Stops))
	for _, s := range arrivalsData.Stops {
		routes := make([]string, len(s.Arrivals))
		for i, a := range s.Arrivals {
			routes[i] = fmt.Sprintf("%s(%s)", a.Route, a.Operator)
		}
		t.Logf("  Stop %s %q: %v", s.ID, s.Name, routes)
	}

	// Build a map: route name → stop ID (from nearby results)
	routeToStop := map[string]string{}
	for _, s := range arrivalsData.Stops {
		for _, a := range s.Arrivals {
			if _, exists := routeToStop[a.Route]; !exists {
				routeToStop[a.Route] = s.ID
			}
		}
	}

	// Step 2: Test route-stops for each target route
	targetRoutes := []struct {
		route    string
		operator string
	}{
		{"27", "GMB"},
		{"27A", "GMB"},
		{"4A", "GMB"},
		{"595", "CTB"},
		{"94A", "CTB"},
		{"95C", "CTB"},
		{"170", "KMB/CTB"},
		{"4", "KMB/CTB"},
	}

	for _, tr := range targetRoutes {
		t.Run(fmt.Sprintf("route_%s_%s", tr.route, tr.operator), func(t *testing.T) {
			stopID, found := routeToStop[tr.route]
			if !found {
				t.Skipf("route %s not found in nearby arrivals (may not be running at this time)", tr.route)
				return
			}

			t.Logf("Testing route-stops: route=%s stopId=%s", tr.route, stopID)

			resp, err := http.Get(fmt.Sprintf("%s/api/route-stops?route=%s&stopId=%s", baseURL, tr.route, stopID))
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != 200 {
				t.Fatalf("returned status %d", resp.StatusCode)
			}

			var data routeStopsResp
			if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
				t.Fatalf("decode: %v", err)
			}

			t.Logf("route=%s stops=%d destination=%q", data.Route, len(data.Stops), data.Destination)
			if len(data.Stops) == 0 {
				t.Errorf("FAIL: route %s (%s) returned 0 stops for stopId=%s", tr.route, tr.operator, stopID)
			}

			// Verify stops are ordered by sequence
			for i := 1; i < len(data.Stops); i++ {
				if data.Stops[i].Seq < data.Stops[i-1].Seq {
					t.Errorf("stops not in sequence order: seq[%d]=%d < seq[%d]=%d",
						i, data.Stops[i].Seq, i-1, data.Stops[i-1].Seq)
				}
			}

			// Log first and last stop
			if len(data.Stops) > 0 {
				first := data.Stops[0]
				last := data.Stops[len(data.Stops)-1]
				t.Logf("  first: %s %q (seq=%d)", first.ID, first.Name, first.Seq)
				t.Logf("  last:  %s %q (seq=%d)", last.ID, last.Name, last.Seq)
			}
		})
	}
}
