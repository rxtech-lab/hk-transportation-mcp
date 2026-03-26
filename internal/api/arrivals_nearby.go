package api

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
)

// NearbyArrivalsGETHandler returns an http.HandlerFunc that serves
// GET /api/arrivals/nearby?lat=X&lon=Y&radius=300
func NearbyArrivalsGETHandler(nearbyService *service.NearbyArrivalsService) http.HandlerFunc {
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

		q := r.URL.Query()
		lat, err := strconv.ParseFloat(q.Get("lat"), 64)
		if err != nil || lat == 0 {
			http.Error(w, `{"error":"lat query parameter required"}`, http.StatusBadRequest)
			return
		}
		lon, err := strconv.ParseFloat(q.Get("lon"), 64)
		if err != nil || lon == 0 {
			http.Error(w, `{"error":"lon query parameter required"}`, http.StatusBadRequest)
			return
		}
		radius := 150.0
		if v := q.Get("radius"); v != "" {
			if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed > 0 {
				radius = math.Min(parsed, 1000)
			}
		}

		// Optional route filter
		var routeFilter map[string]struct{}
		if routesParam := q.Get("routes"); routesParam != "" {
			parts := strings.Split(routesParam, ",")
			routeFilter = make(map[string]struct{}, len(parts))
			for _, r := range parts {
				r = strings.TrimSpace(r)
				if r != "" {
					routeFilter[r] = struct{}{}
				}
			}
		}

		// Optional destination coordinates for direction filtering
		var destLat, destLon float64
		if v := q.Get("dest_lat"); v != "" {
			if parsed, err := strconv.ParseFloat(v, 64); err == nil {
				destLat = parsed
			}
		}
		if v := q.Get("dest_lon"); v != "" {
			if parsed, err := strconv.ParseFloat(v, 64); err == nil {
				destLon = parsed
			}
		}

		log.Printf("[/api/arrivals/nearby] lat=%.6f lon=%.6f radius=%.0f", lat, lon, radius)
		now := time.Now()

		var result *service.NearbyArrivalsResult
		// Use optimised path when filtering by a single route
		if routeFilter != nil && len(routeFilter) == 1 {
			var routeName string
			for r := range routeFilter {
				routeName = r
			}
			res, err2 := nearbyService.ExecuteForRoute(r.Context(), lat, lon, radius, routeName, destLat, destLon)
			if err2 != nil {
				log.Printf("[/api/arrivals/nearby] ExecuteForRoute error: %v", err2)
				http.Error(w, `{"error":"failed to fetch arrivals"}`, http.StatusInternalServerError)
				return
			}
			result = res
		} else {
			res, err2 := nearbyService.Execute(r.Context(), lat, lon, radius)
			if err2 != nil {
				log.Printf("[/api/arrivals/nearby] Execute error: %v", err2)
				http.Error(w, `{"error":"failed to fetch arrivals"}`, http.StatusInternalServerError)
				return
			}
			result = res
		}

		respStops := buildStopResponses(result.Stops, routeFilter, now)

		log.Printf("[/api/arrivals/nearby] returning %d stops in %s", len(respStops), time.Since(now))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(arrivalsResponse{Stops: respStops})
	}
}
