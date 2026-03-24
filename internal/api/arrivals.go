package api

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
)

type stopRequest struct {
	ID     *string  `json:"id"`
	Lat    float64  `json:"lat"`
	Lng    float64  `json:"lng"`
	Routes []string `json:"routes,omitempty"` // optional: filter to these routes only
}

type arrivalsRequest struct {
	Stops        []stopRequest `json:"stops"`
	NearbyRadius float64       `json:"nearbyRadius,omitempty"` // optional: search radius in metres (max 1000)
}

type etaResponse struct {
	Minutes int    `json:"minutes"`
	Remarks string `json:"remarks,omitempty"`
}

type arrivalResponse struct {
	Route       string        `json:"route"`
	Destination string        `json:"destination"`
	DestTc      string        `json:"dest_tc"`
	DestSc      string        `json:"dest_sc"`
	Etas        []etaResponse `json:"etas"`
}

type stopResponse struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	NameEn   string            `json:"name_en"`
	NameTc   string            `json:"name_tc"`
	NameSc   string            `json:"name_sc"`
	Lat      float64           `json:"lat"`
	Lng      float64           `json:"lng"`
	Distance float64           `json:"distance"` // distance in metres from query point
	Arrivals []arrivalResponse `json:"arrivals"`
}

type arrivalsResponse struct {
	Stops []stopResponse `json:"stops"`
}

// ArrivalsHandler returns an http.HandlerFunc that serves the /api/arrivals endpoint.
// Supports two modes:
//   - By location: provide lat/lng (and optional id to filter the matched stop)
//   - By stop ID: provide id only (lat/lng can be 0); the stop is looked up directly
//
// Optional "routes" array filters arrivals to only the specified route names.
func ArrivalsHandler(nearbyService *service.NearbyArrivalsService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// CORS
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		log.Printf("[/api/arrivals] %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		var req arrivalsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}
		if len(req.Stops) == 0 {
			http.Error(w, `{"error":"stops array required"}`, http.StatusBadRequest)
			return
		}

		// Log incoming request
		for i, s := range req.Stops {
			id := "<none>"
			if s.ID != nil {
				id = *s.ID
			}
			log.Printf("[/api/arrivals] stop[%d]: id=%s lat=%.6f lng=%.6f routes=%v", i, id, s.Lat, s.Lng, s.Routes)
		}

		now := time.Now()
		respStops := make([]stopResponse, 0)

		// Determine search radius
		radius := 150.0
		if req.NearbyRadius > 0 {
			radius = math.Min(req.NearbyRadius, 1000)
		}

		for _, s := range req.Stops {
			hasCoords := s.Lat != 0 || s.Lng != 0
			hasID := s.ID != nil && *s.ID != ""

			if !hasCoords && !hasID {
				continue
			}

			var matchedStops []service.NearbyStopArrivals

			if hasID && !hasCoords {
				// Fetch by stop ID directly
				stopArrivals, err := nearbyService.ExecuteByStopID(r.Context(), *s.ID)
				if err != nil || stopArrivals == nil {
					continue
				}
				matchedStops = append(matchedStops, *stopArrivals)
			} else {
				// Fetch by lat/lng
				result, err := nearbyService.Execute(r.Context(), s.Lat, s.Lng, radius)
				if err != nil {
					log.Printf("[/api/arrivals] Execute error: %v", err)
					continue
				}
				log.Printf("[/api/arrivals] nearby found %d stops for (%.6f, %.6f)", len(result.Stops), s.Lat, s.Lng)
				for j, rs := range result.Stops {
					log.Printf("[/api/arrivals]   stop[%d]: %s %q arrivals=%d", j, rs.StopID, rs.StopName, len(rs.Arrivals))
				}
				if len(result.Stops) == 0 {
					continue
				}

				if req.NearbyRadius > 0 {
					// Nearby mode: return all stops within radius
					matchedStops = result.Stops
				} else if hasID {
					for i := range result.Stops {
						if result.Stops[i].StopID == *s.ID {
							matchedStops = append(matchedStops, result.Stops[i])
							break
						}
					}
					if len(matchedStops) == 0 {
						matchedStops = append(matchedStops, result.Stops[0])
					}
				} else {
					matchedStops = append(matchedStops, result.Stops[0])
				}
			}

			// Build route filter set
			var routeFilter map[string]struct{}
			if len(s.Routes) > 0 {
				routeFilter = make(map[string]struct{}, len(s.Routes))
				for _, r := range s.Routes {
					routeFilter[r] = struct{}{}
				}
			}

			respStops = append(respStops, buildStopResponses(matchedStops, routeFilter, now)...)
		}

		log.Printf("[/api/arrivals] returning %d stops in %s", len(respStops), time.Since(now))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(arrivalsResponse{Stops: respStops})
	}
}

// buildStopResponses converts service-layer NearbyStopArrivals into API response
// objects, grouping arrivals by route and computing ETA minutes from the given time.
func buildStopResponses(matched []service.NearbyStopArrivals, routeFilter map[string]struct{}, now time.Time) []stopResponse {
	var result []stopResponse
	for _, m := range matched {
		routeMap := make(map[string]*arrivalResponse)
		var routeOrder []string
		for _, a := range m.Arrivals {
			if routeFilter != nil {
				if _, ok := routeFilter[a.Route]; !ok {
					continue
				}
			}
			existing, ok := routeMap[a.Route]
			if !ok {
				existing = &arrivalResponse{
					Route:       a.Route,
					Destination: a.Destination,
					DestTc:      a.DestTc,
					DestSc:      a.DestSc,
				}
				if existing.Destination == "" {
					existing.Destination = a.Direction
				}
				routeMap[a.Route] = existing
				routeOrder = append(routeOrder, a.Route)
			}
			minutes := 0
			if a.ETA != nil {
				minutes = int(math.Max(0, math.Round(a.ETA.Sub(now).Minutes())))
			}
			existing.Etas = append(existing.Etas, etaResponse{
				Minutes: minutes,
				Remarks: a.Remark,
			})
		}

		sort.Strings(routeOrder)
		arrivals := make([]arrivalResponse, 0, len(routeOrder))
		for _, route := range routeOrder {
			resp := *routeMap[route]
			if resp.Etas == nil {
				resp.Etas = []etaResponse{}
			}
			arrivals = append(arrivals, resp)
		}

		// Skip stops with no arrivals
		if len(arrivals) == 0 {
			continue
		}

		result = append(result, stopResponse{
			ID:       m.StopID,
			Name:     m.StopName,
			NameEn:   m.NameEn,
			NameTc:   m.NameTc,
			NameSc:   m.NameSc,
			Lat:      m.Lat,
			Lng:      m.Lon,
			Distance: m.Distance,
			Arrivals: arrivals,
		})
	}
	return result
}
