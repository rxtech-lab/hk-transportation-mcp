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

		log.Printf("[/api/arrivals/nearby] lat=%.6f lon=%.6f radius=%.0f", lat, lon, radius)
		now := time.Now()

		result, err := nearbyService.Execute(r.Context(), lat, lon, radius)
		if err != nil {
			log.Printf("[/api/arrivals/nearby] Execute error: %v", err)
			http.Error(w, `{"error":"failed to fetch arrivals"}`, http.StatusInternalServerError)
			return
		}

		respStops := buildStopResponses(result.Stops, routeFilter, now)

		log.Printf("[/api/arrivals/nearby] returning %d stops in %s", len(respStops), time.Since(now))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(arrivalsResponse{Stops: respStops})
	}
}
