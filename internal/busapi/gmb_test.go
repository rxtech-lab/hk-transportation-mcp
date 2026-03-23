package busapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGMBClientOperator(t *testing.T) {
	client := NewGMBClient(http.DefaultClient)
	if op := client.Operator(); op != "GMB" {
		t.Errorf("expected operator GMB, got %s", op)
	}
}

// setupTestMux creates a shared http.ServeMux with route and route-stop endpoints.
func setupTestMux() *http.ServeMux {
	mux := http.NewServeMux()

	// /route/HKI returns one route code
	mux.HandleFunc("/route/HKI", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRegionRoutes]{
			Data: gmbRegionRoutes{Routes: []string{"1A"}},
		})
	})
	// /route/KLN returns empty
	mux.HandleFunc("/route/KLN", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRegionRoutes]{
			Data: gmbRegionRoutes{Routes: []string{}},
		})
	})
	// /route/NT returns empty
	mux.HandleFunc("/route/NT", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRegionRoutes]{
			Data: gmbRegionRoutes{Routes: []string{}},
		})
	})
	// /route/HKI/1A returns one route with two directions
	mux.HandleFunc("/route/HKI/1A", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[[]gmbRouteInfo]{
			Data: []gmbRouteInfo{
				{
					RouteID:       2003045,
					DescriptionTc: "正常班次",
					DescriptionEn: "Normal service",
					Directions: []gmbRouteDirection{
						{RouteSeq: 1, OrigEn: "Central", DestEn: "Stanley", OrigTc: "中環", DestTc: "赤柱"},
						{RouteSeq: 2, OrigEn: "Stanley", DestEn: "Central", OrigTc: "赤柱", DestTc: "中環"},
					},
				},
			},
		})
	})
	// route-stop endpoints for outbound and inbound
	mux.HandleFunc("/route-stop/2003045/1", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRouteStopData]{
			Data: gmbRouteStopData{
				RouteStops: []gmbRouteStop{
					{StopID: 20001, StopSeq: 1, NameEn: "Central", NameTc: "中環"},
					{StopID: 20002, StopSeq: 2, NameEn: "Admiralty", NameTc: "金鐘"},
					{StopID: 20003, StopSeq: 3, NameEn: "Stanley", NameTc: "赤柱"},
				},
			},
		})
	})
	mux.HandleFunc("/route-stop/2003045/2", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRouteStopData]{
			Data: gmbRouteStopData{
				RouteStops: []gmbRouteStop{
					{StopID: 20003, StopSeq: 1, NameEn: "Stanley", NameTc: "赤柱"},
					{StopID: 20002, StopSeq: 2, NameEn: "Admiralty", NameTc: "金鐘"},
					{StopID: 20001, StopSeq: 3, NameEn: "Central", NameTc: "中環"},
				},
			},
		})
	})

	return mux
}

func TestGMBClientFetchAllRoutes(t *testing.T) {
	mux := setupTestMux()

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := newTestGMBClient(srv)

	routes, err := client.FetchAllRoutes(context.Background())
	if err != nil {
		t.Fatalf("FetchAllRoutes: %v", err)
	}

	if len(routes) != 2 {
		t.Fatalf("expected 2 routes, got %d", len(routes))
	}

	// Check outbound route
	found := false
	for _, r := range routes {
		if r.Route == "1A" && r.Bound == "O" {
			found = true
			if r.Operator != "GMB" {
				t.Errorf("expected operator GMB, got %s", r.Operator)
			}
			if r.OrigEn != "Central" {
				t.Errorf("expected orig Central, got %s", r.OrigEn)
			}
			if r.DestEn != "Stanley" {
				t.Errorf("expected dest Stanley, got %s", r.DestEn)
			}
			if r.RouteID != "GMB-HKI-1A-O-1" {
				t.Errorf("expected routeID GMB-HKI-1A-O-1, got %s", r.RouteID)
			}
		}
	}
	if !found {
		t.Error("outbound route 1A not found")
	}

	// Verify route ID map was populated
	client.mu.RLock()
	if _, ok := client.routeIDMap["HKI:1A:O:1"]; !ok {
		t.Error("routeIDMap missing key 1A:O:1")
	}
	if _, ok := client.routeIDMap["HKI:1A:I:1"]; !ok {
		t.Error("routeIDMap missing key 1A:I:1")
	}
	ids := client.routeCodeToIDs["1A"]
	if len(ids) != 1 || ids[0] != 2003045 {
		t.Errorf("expected routeCodeToIDs[1A] = [2003045], got %v", ids)
	}
	client.mu.RUnlock()
}

func TestGMBClientFetchAllRoutesMultiVariant(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/route/HKI", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRegionRoutes]{
			Data: gmbRegionRoutes{Routes: []string{"5"}},
		})
	})
	mux.HandleFunc("/route/KLN", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRegionRoutes]{Data: gmbRegionRoutes{Routes: []string{}}})
	})
	mux.HandleFunc("/route/NT", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbRegionRoutes]{Data: gmbRegionRoutes{Routes: []string{}}})
	})
	// Route 5 has normal service + a special variant
	mux.HandleFunc("/route/HKI/5", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[[]gmbRouteInfo]{
			Data: []gmbRouteInfo{
				{
					RouteID:       100001,
					DescriptionTc: "正常班次",
					Directions: []gmbRouteDirection{
						{RouteSeq: 1, OrigEn: "A", DestEn: "B"},
					},
				},
				{
					RouteID:       100002,
					DescriptionTc: "特別班次",
					Directions: []gmbRouteDirection{
						{RouteSeq: 1, OrigEn: "A", DestEn: "C"},
					},
				},
				{
					RouteID:       100003,
					DescriptionTc: "假日班次",
					Directions: []gmbRouteDirection{
						{RouteSeq: 1, OrigEn: "A", DestEn: "D"},
					},
				},
			},
		})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := newTestGMBClient(srv)

	routes, err := client.FetchAllRoutes(context.Background())
	if err != nil {
		t.Fatalf("FetchAllRoutes: %v", err)
	}

	// Normal=svc1, first special=svc2, second special=svc3
	svcTypes := make(map[string]bool)
	for _, r := range routes {
		svcTypes[r.ServiceType] = true
	}
	if !svcTypes["1"] || !svcTypes["2"] || !svcTypes["3"] {
		t.Errorf("expected service types 1,2,3; got routes: %v", routes)
	}
}

func TestGMBClientFetchAllStops(t *testing.T) {
	mux := setupTestMux()

	// Add stop endpoint
	mux.HandleFunc("/stop/20001", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbStopData]{
			Data: gmbStopData{
				Coordinates: gmbCoordinates{
					WGS84: gmbWGS84{Latitude: 22.2810, Longitude: 114.1588},
				},
			},
		})
	})
	mux.HandleFunc("/stop/20002", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbStopData]{
			Data: gmbStopData{
				Coordinates: gmbCoordinates{
					WGS84: gmbWGS84{Latitude: 22.2773, Longitude: 114.1621},
				},
			},
		})
	})
	mux.HandleFunc("/stop/20003", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[gmbStopData]{
			Data: gmbStopData{
				Coordinates: gmbCoordinates{
					WGS84: gmbWGS84{Latitude: 22.2500, Longitude: 114.2100},
				},
			},
		})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := newTestGMBClient(srv)

	stops, err := client.FetchAllStops(context.Background())
	if err != nil {
		t.Fatalf("FetchAllStops: %v", err)
	}

	if len(stops) != 3 {
		t.Fatalf("expected 3 stops, got %d", len(stops))
	}

	// Verify stop properties
	stopByID := make(map[string]struct{ nameEn string; lat float64 })
	for _, s := range stops {
		if s.Operator != "GMB" {
			t.Errorf("expected operator GMB for stop %s, got %s", s.StopID, s.Operator)
		}
		stopByID[s.StopID] = struct{ nameEn string; lat float64 }{s.NameEn, s.Lat}
	}

	if info, ok := stopByID["20001"]; !ok {
		t.Error("stop 20001 not found")
	} else if info.nameEn != "Central" {
		t.Errorf("expected name Central, got %s", info.nameEn)
	} else if info.lat != 22.2810 {
		t.Errorf("expected lat 22.2810, got %f", info.lat)
	}
}

func TestGMBClientFetchRouteStops(t *testing.T) {
	mux := setupTestMux()

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := newTestGMBClient(srv)

	// Pre-populate the route ID map
	client.routeIDMap["HKI:1A:O:1"] = 2003045

	stops, err := client.FetchRouteStops(context.Background(), "1A", "O", "1")
	if err != nil {
		t.Fatalf("FetchRouteStops: %v", err)
	}

	if len(stops) != 3 {
		t.Fatalf("expected 3 stops, got %d", len(stops))
	}

	if stops[0].StopID != "20001" {
		t.Errorf("expected first stop ID 20001, got %s", stops[0].StopID)
	}
	if stops[0].StopSeq != 1 {
		t.Errorf("expected first stop seq 1, got %d", stops[0].StopSeq)
	}
	if stops[0].RouteID != "GMB-HKI-1A-O-1" {
		t.Errorf("expected routeID GMB-HKI-1A-O-1, got %s", stops[0].RouteID)
	}
	if stops[0].Operator != "GMB" {
		t.Errorf("expected operator GMB, got %s", stops[0].Operator)
	}
}

func TestGMBClientFetchRouteStopsUnknownRoute(t *testing.T) {
	client := NewGMBClient(http.DefaultClient)

	_, err := client.FetchRouteStops(context.Background(), "999", "O", "1")
	if err == nil {
		t.Fatal("expected error for unknown route, got nil")
	}
}

func TestGMBClientFetchETA(t *testing.T) {
	mux := setupTestMux()
	mux.HandleFunc("/eta/route-stop/2003045/20001", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[[]gmbETARouteStop]{
			Data: []gmbETARouteStop{
				{
					RouteSeq: 1,
					StopSeq:  1,
					ETAs: []gmbETA{
						{
							Timestamp: "2026-03-23T10:05:00+08:00",
							RemarksEn: "",
							RemarksTc: "",
						},
						{
							Timestamp: "2026-03-23T10:15:00+08:00",
							RemarksEn: "Last bus",
							RemarksTc: "尾班車",
						},
					},
				},
			},
		})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := newTestGMBClient(srv)

	// First call FetchAllRoutes to populate route maps (including dest info)
	_, err := client.FetchAllRoutes(context.Background())
	if err != nil {
		t.Fatalf("FetchAllRoutes: %v", err)
	}

	arrivals, err := client.FetchETA(context.Background(), "20001", "1A")
	if err != nil {
		t.Fatalf("FetchETA: %v", err)
	}

	if len(arrivals) != 2 {
		t.Fatalf("expected 2 arrivals, got %d", len(arrivals))
	}

	if arrivals[0].Route != "1A" {
		t.Errorf("expected route 1A, got %s", arrivals[0].Route)
	}
	if arrivals[0].Operator != "GMB" {
		t.Errorf("expected operator GMB, got %s", arrivals[0].Operator)
	}
	if arrivals[0].ETA == nil {
		t.Fatal("expected non-nil ETA for first arrival")
	}
	if arrivals[0].Direction != "O" {
		t.Errorf("expected direction O, got %s", arrivals[0].Direction)
	}
	if arrivals[0].Destination != "Stanley" {
		t.Errorf("expected destination Stanley, got %s", arrivals[0].Destination)
	}
	if arrivals[0].DestTc != "赤柱" {
		t.Errorf("expected dest_tc 赤柱, got %s", arrivals[0].DestTc)
	}
	if arrivals[1].Remark != "Last bus" {
		t.Errorf("expected remark 'Last bus', got %s", arrivals[1].Remark)
	}
}

func TestGMBClientFetchETALazyLoading(t *testing.T) {
	mux := setupTestMux()
	mux.HandleFunc("/eta/route-stop/2003045/20001", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(gmbResponse[[]gmbETARouteStop]{
			Data: []gmbETARouteStop{
				{
					RouteSeq: 1,
					StopSeq:  1,
					ETAs: []gmbETA{
						{Timestamp: "2026-03-23T10:05:00+08:00", RemarksEn: ""},
					},
				},
			},
		})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	// Create a fresh client without calling FetchAllRoutes first
	client := newTestGMBClient(srv)

	// FetchETA should lazily load routes and return results
	arrivals, err := client.FetchETA(context.Background(), "20001", "1A")
	if err != nil {
		t.Fatalf("FetchETA with lazy loading: %v", err)
	}

	if len(arrivals) != 1 {
		t.Fatalf("expected 1 arrival after lazy loading, got %d", len(arrivals))
	}
	if arrivals[0].Destination != "Stanley" {
		t.Errorf("expected destination Stanley after lazy load, got %s", arrivals[0].Destination)
	}
}

func TestGMBClientFetchETANoRouteIDs(t *testing.T) {
	mux := setupTestMux()

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := newTestGMBClient(srv)

	// Unknown route should return empty even after lazy-loading routes
	arrivals, err := client.FetchETA(context.Background(), "20001", "unknown")
	if err != nil {
		t.Fatalf("FetchETA: %v", err)
	}
	if len(arrivals) != 0 {
		t.Errorf("expected 0 arrivals for unknown route, got %d", len(arrivals))
	}
}

func TestGmbBoundConversion(t *testing.T) {
	tests := []struct {
		routeSeq int
		bound    string
	}{
		{1, "O"},
		{2, "I"},
		{3, "O"}, // default
	}
	for _, tt := range tests {
		got := gmbBound(tt.routeSeq)
		if got != tt.bound {
			t.Errorf("gmbBound(%d) = %s, want %s", tt.routeSeq, got, tt.bound)
		}
	}
}

func TestGmbRouteSeqConversion(t *testing.T) {
	tests := []struct {
		bound    string
		routeSeq int
	}{
		{"O", 1},
		{"I", 2},
		{"X", 1}, // default
	}
	for _, tt := range tests {
		got := gmbRouteSeq(tt.bound)
		if got != tt.routeSeq {
			t.Errorf("gmbRouteSeq(%s) = %d, want %d", tt.bound, got, tt.routeSeq)
		}
	}
}

func TestAppendUnique(t *testing.T) {
	s := []int64{1, 2, 3}
	s = appendUnique(s, 2)
	if len(s) != 3 {
		t.Errorf("expected 3 elements after adding duplicate, got %d", len(s))
	}
	s = appendUnique(s, 4)
	if len(s) != 4 {
		t.Errorf("expected 4 elements after adding new, got %d", len(s))
	}
}

// newTestGMBClient creates a GMBClient that points to the test server.
// It overrides the base URL by wrapping the HTTP transport.
func newTestGMBClient(srv *httptest.Server) *GMBClient {
	client := NewGMBClient(srv.Client())
	// Replace the get method's base URL by using a custom transport
	// that redirects all requests to the test server
	client.http = &http.Client{
		Transport: &testTransport{
			base:    srv.URL,
			wrapped: srv.Client().Transport,
		},
	}
	return client
}

// testTransport rewrites request URLs to point to the test server.
type testTransport struct {
	base    string
	wrapped http.RoundTripper
}

func (t *testTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Replace the host with the test server
	newURL := t.base + req.URL.Path
	if req.URL.RawQuery != "" {
		newURL += "?" + req.URL.RawQuery
	}
	newReq, err := http.NewRequestWithContext(req.Context(), req.Method, newURL, req.Body)
	if err != nil {
		return nil, err
	}
	newReq.Header = req.Header
	rt := t.wrapped
	if rt == nil {
		rt = http.DefaultTransport
	}
	return rt.RoundTrip(newReq)
}
