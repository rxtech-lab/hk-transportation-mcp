package geo

import (
	"testing"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

func TestRoutesForStop(t *testing.T) {
	idx := NewStopIndex(nil)
	stops := []models.BusStop{
		{StopID: "S1", NameEn: "Stop 1", Lat: 22.3193, Lon: 114.1694},
		{StopID: "S2", NameEn: "Stop 2", Lat: 22.3195, Lon: 114.1696},
	}
	routeStops := []models.RouteStop{
		{RouteID: "R1", StopID: "S1", StopSeq: 1},
		{RouteID: "R1", StopID: "S2", StopSeq: 2},
		{RouteID: "R2", StopID: "S1", StopSeq: 1},
	}
	idx.Reload(stops, routeStops)

	routes := idx.RoutesForStop("S1")
	if len(routes) != 2 {
		t.Errorf("expected 2 routes for S1, got %d", len(routes))
	}

	routes = idx.RoutesForStop("S2")
	if len(routes) != 1 {
		t.Errorf("expected 1 route for S2, got %d", len(routes))
	}
}

func TestStopsForRoute(t *testing.T) {
	idx := NewStopIndex(nil)
	routeStops := []models.RouteStop{
		{RouteID: "R1", StopID: "S2", StopSeq: 2},
		{RouteID: "R1", StopID: "S1", StopSeq: 1},
		{RouteID: "R1", StopID: "S3", StopSeq: 3},
	}
	idx.Reload(nil, routeStops)

	rs := idx.StopsForRoute("R1")
	if len(rs) != 3 {
		t.Fatalf("expected 3 stops, got %d", len(rs))
	}
	if rs[0].StopSeq != 1 || rs[1].StopSeq != 2 || rs[2].StopSeq != 3 {
		t.Errorf("stops not sorted by sequence: %v", rs)
	}
}
