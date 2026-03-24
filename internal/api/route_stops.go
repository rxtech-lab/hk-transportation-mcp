package api

import (
	"encoding/json"
	"log"
	"math"
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
	Route          string          `json:"route"`
	Destination    string          `json:"destination"`
	Stops          []routeStopInfo `json:"stops"`
	MatchedStopID  string          `json:"matched_stop_id,omitempty"`
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
		log.Printf("[/api/route-stops] RoutesForStop(%s) returned %d routes: %v", stopID, len(routeIDs), routeIDs)
		if len(routeIDs) == 0 {
			log.Printf("[/api/route-stops] no routes found for stop %s, returning empty", stopID)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(routeStopsResponse{Route: routeName, Stops: []routeStopInfo{}})
			return
		}

		// Find the routeID matching the route name
		var matchedRouteID string
		for _, rid := range routeIDs {
			extracted := extractRouteNameFromID(rid)
			log.Printf("[/api/route-stops] routeID=%s extracted=%s want=%s", rid, extracted, routeName)
			if extracted == routeName {
				matchedRouteID = rid
				break
			}
		}
		if matchedRouteID == "" {
			log.Printf("[/api/route-stops] no routeID matched route name %q among %v, falling back to DB lookup", routeName, routeIDs)
			// Fallback: the stop may be grouped with a nearby stop from a different operator.
			// Look up the route directly by name in the DB.
			// Pick the route whose stops are closest to the query stop.
			queryStop, hasQueryStop := index.GetStop(stopID)
			dbRoutes, err := index.GetRoutesByName(routeName, "")
			if err == nil && len(dbRoutes) > 0 {
				bestDist := math.MaxFloat64
				for _, r := range dbRoutes {
					log.Printf("[/api/route-stops] DB fallback candidate routeID=%s", r.RouteID)
					if !hasQueryStop {
						// No location info, just pick the first
						matchedRouteID = r.RouteID
						break
					}
					// Find min distance from any stop on this route to the query stop
					rStops := index.StopsForRoute(r.RouteID)
					for _, rs := range rStops {
						s, ok := index.GetStop(rs.StopID)
						if !ok {
							continue
						}
						d := haversine(queryStop.Lat, queryStop.Lon, s.Lat, s.Lon)
						if d < bestDist {
							bestDist = d
							matchedRouteID = r.RouteID
						}
					}
				}
				log.Printf("[/api/route-stops] DB fallback selected routeID=%s (dist=%.0fm)", matchedRouteID, bestDist)
			}
			if matchedRouteID == "" {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(routeStopsResponse{Route: routeName, Stops: []routeStopInfo{}})
				return
			}
		}

		// Get all stops for this route in order
		routeStops := index.StopsForRoute(matchedRouteID)
		log.Printf("[/api/route-stops] StopsForRoute(%s) returned %d stops", matchedRouteID, len(routeStops))
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

		// Find the matched stop: exact ID match first, then closest by distance
		matchedStopID := stopID
		hasExactMatch := false
		for _, s := range stops {
			if s.StopID == stopID {
				hasExactMatch = true
				break
			}
		}
		if !hasExactMatch {
			queryStop, ok := index.GetStop(stopID)
			if ok && len(stops) > 0 {
				bestDist := math.MaxFloat64
				for _, s := range stops {
					d := haversine(queryStop.Lat, queryStop.Lon, s.Lat, s.Lng)
					if d < bestDist {
						bestDist = d
						matchedStopID = s.StopID
					}
				}
				log.Printf("[/api/route-stops] no exact stop match for %s, closest=%s (%.0fm)", stopID, matchedStopID, bestDist)
			}
		}

		log.Printf("[/api/route-stops] route=%s matched=%s stops=%d matchedStop=%s", routeName, matchedRouteID, len(stops), matchedStopID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(routeStopsResponse{
			Route:         routeName,
			Destination:   dest,
			Stops:         stops,
			MatchedStopID: matchedStopID,
		})
	}
}

// extractRouteNameFromID extracts route name from route ID.
// KMB/CTB format: "KMB-1A-O-1" → "1A" (4 parts, route is parts[1])
// GMB format:     "GMB-NT-4B-O-1" → "4B" (5 parts, route is parts[2])
func extractRouteNameFromID(routeID string) string {
	parts := splitRouteParts(routeID)
	if len(parts) >= 5 && parts[0] == "GMB" {
		return parts[2]
	}
	if len(parts) >= 2 {
		return parts[1]
	}
	return routeID
}

// haversine returns the distance in metres between two lat/lng points.
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Earth radius in metres
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func splitRouteParts(id string) []string {
	var parts []string
	start := 0
	for i, c := range id {
		if c == '-' {
			parts = append(parts, id[start:i])
			start = i + 1
		}
	}
	parts = append(parts, id[start:])
	return parts
}
