package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
)

type routeStopInfo struct {
	StopID  string  `json:"id"`
	Name    string  `json:"name"`
	NameEn  string  `json:"name_en"`
	NameTc  string  `json:"name_tc"`
	NameSc  string  `json:"name_sc"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	StopSeq int     `json:"seq"`
}

type routeStopsResponse struct {
	Route       string          `json:"route"`
	Destination string          `json:"destination"`
	Stops       []routeStopInfo `json:"stops"`
}

// RouteStopsHandler returns all stops for a route that passes through a given stop.
// GET /api/route-stops?route=1A&stopId=XXX
func RouteStopsHandler(index *geo.StopIndex) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		routeName := r.URL.Query().Get("route")
		stopID := r.URL.Query().Get("stopId")
		if routeName == "" || stopID == "" {
			http.Error(w, `{"error":"route and stopId required"}`, http.StatusBadRequest)
			return
		}

		log.Printf("[/api/route-stops] route=%s stopId=%s", routeName, stopID)

		// Find all routeIDs that serve this stop
		routeIDs := index.RoutesForStop(stopID)
		if len(routeIDs) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(routeStopsResponse{Route: routeName, Stops: []routeStopInfo{}})
			return
		}

		// Find the routeID matching the route name
		var matchedRouteID string
		for _, rid := range routeIDs {
			if extractRouteNameFromID(rid) == routeName {
				matchedRouteID = rid
				break
			}
		}
		if matchedRouteID == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(routeStopsResponse{Route: routeName, Stops: []routeStopInfo{}})
			return
		}

		// Get all stops for this route in order
		routeStops := index.StopsForRoute(matchedRouteID)
		stops := make([]routeStopInfo, 0, len(routeStops))
		dest := ""
		for _, rs := range routeStops {
			stop, ok := index.GetStop(rs.StopID)
			if !ok {
				continue
			}
			stops = append(stops, routeStopInfo{
				StopID:  stop.StopID,
				Name:    stop.NameEn,
				NameEn:  stop.NameEn,
				NameTc:  stop.NameTc,
				NameSc:  stop.NameSc,
				Lat:     stop.Lat,
				Lng:     stop.Lon,
				StopSeq: rs.StopSeq,
			})
			// Last stop is the destination
			dest = stop.NameEn
		}

		log.Printf("[/api/route-stops] route=%s matched=%s stops=%d", routeName, matchedRouteID, len(stops))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(routeStopsResponse{
			Route:       routeName,
			Destination: dest,
			Stops:       stops,
		})
	}
}

// extractRouteNameFromID extracts route name from ID like "KMB-1A-O-1" → "1A"
func extractRouteNameFromID(routeID string) string {
	start := 0
	count := 0
	for i, c := range routeID {
		if c == '-' {
			count++
			if count == 1 {
				start = i + 1
			}
			if count == 2 {
				return routeID[start:i]
			}
		}
	}
	if count == 1 {
		return routeID[start:]
	}
	return routeID
}
