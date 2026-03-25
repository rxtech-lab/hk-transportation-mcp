package api

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/service"
)

// RouteArrivalsGETHandler returns an http.HandlerFunc that serves
// GET /api/arrivals/route?lat=X&lon=Y&dest_lat=X&dest_lon=Y&radius_origin=300&radius_dest=300&max_transfers=2
// It uses the same logic as the MCP route_arrivals tool.
func RouteArrivalsGETHandler(routeService *service.RouteArrivalsService) http.HandlerFunc {
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
		if q.Get("lat") == "" {
			http.Error(w, `{"error":"lat query parameter required"}`, http.StatusBadRequest)
			return
		}
		lat, err := strconv.ParseFloat(q.Get("lat"), 64)
		if err != nil {
			http.Error(w, `{"error":"lat query parameter required"}`, http.StatusBadRequest)
			return
		}
		if q.Get("lon") == "" {
			http.Error(w, `{"error":"lon query parameter required"}`, http.StatusBadRequest)
			return
		}
		lon, err := strconv.ParseFloat(q.Get("lon"), 64)
		if err != nil {
			http.Error(w, `{"error":"lon query parameter required"}`, http.StatusBadRequest)
			return
		}
		if q.Get("dest_lat") == "" {
			http.Error(w, `{"error":"dest_lat query parameter required"}`, http.StatusBadRequest)
			return
		}
		destLat, err := strconv.ParseFloat(q.Get("dest_lat"), 64)
		if err != nil {
			http.Error(w, `{"error":"dest_lat query parameter required"}`, http.StatusBadRequest)
			return
		}
		if q.Get("dest_lon") == "" {
			http.Error(w, `{"error":"dest_lon query parameter required"}`, http.StatusBadRequest)
			return
		}
		destLon, err := strconv.ParseFloat(q.Get("dest_lon"), 64)
		if err != nil {
			http.Error(w, `{"error":"dest_lon query parameter required"}`, http.StatusBadRequest)
			return
		}

		radiusOrigin := 300.0
		if v := q.Get("radius_origin"); v != "" {
			if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed > 0 {
				radiusOrigin = math.Min(parsed, 1000)
			}
		}
		radiusDest := 300.0
		if v := q.Get("radius_dest"); v != "" {
			if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed > 0 {
				radiusDest = math.Min(parsed, 1000)
			}
		}
		maxTransfers := 2
		if v := q.Get("max_transfers"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil && parsed >= 0 {
				maxTransfers = parsed
			}
		}

		log.Printf("[/api/arrivals/route] lat=%.6f lon=%.6f dest_lat=%.6f dest_lon=%.6f radius_origin=%.0f radius_dest=%.0f max_transfers=%d",
			lat, lon, destLat, destLon, radiusOrigin, radiusDest, maxTransfers)
		now := time.Now()

		result, err := routeService.Execute(r.Context(), lat, lon, destLat, destLon, radiusOrigin, radiusDest, maxTransfers)
		if err != nil {
			log.Printf("[/api/arrivals/route] Execute error: %v", err)
			http.Error(w, `{"error":"failed to fetch route arrivals"}`, http.StatusInternalServerError)
			return
		}

		// Convert RouteArrivalsResult into the same stops format as /api/arrivals/nearby
		// so the mobile app can render it using ArrivalCard.
		stopMap := make(map[string]*service.NearbyStopArrivals)
		var stopOrder []string

		// Process direct (candidate) routes
		for _, cr := range result.CandidateRoutes {
			stop := cr.OriginStop
			existing, ok := stopMap[stop.StopID]
			if !ok {
				existing = &service.NearbyStopArrivals{
					StopID:   stop.StopID,
					StopName: stop.NameEn,
					NameEn:   stop.NameEn,
					NameTc:   stop.NameTc,
					NameSc:   stop.NameSc,
					Lat:      stop.Lat,
					Lon:      stop.Lon,
				}
				stopMap[stop.StopID] = existing
				stopOrder = append(stopOrder, stop.StopID)
			}
			existing.Arrivals = append(existing.Arrivals, cr.Arrivals...)
		}

		// Process transfer routes (first leg only)
		for _, tr := range result.TransferRoutes {
			if len(tr.Legs) == 0 {
				continue
			}
			// Find the first bus leg
			var boardStop *service.TransferRouteLeg
			for i := range tr.Legs {
				if !tr.Legs[i].IsWalking {
					boardStop = &tr.Legs[i]
					break
				}
			}
			if boardStop == nil {
				continue
			}
			stop := boardStop.BoardStop
			existing, ok := stopMap[stop.StopID]
			if !ok {
				existing = &service.NearbyStopArrivals{
					StopID:   stop.StopID,
					StopName: stop.NameEn,
					NameEn:   stop.NameEn,
					NameTc:   stop.NameTc,
					NameSc:   stop.NameSc,
					Lat:      stop.Lat,
					Lon:      stop.Lon,
				}
				stopMap[stop.StopID] = existing
				stopOrder = append(stopOrder, stop.StopID)
			}
			existing.Arrivals = append(existing.Arrivals, tr.FirstLegArrivals...)
		}

		// Build ordered slice
		matched := make([]service.NearbyStopArrivals, 0, len(stopOrder))
		for _, id := range stopOrder {
			matched = append(matched, *stopMap[id])
		}

		respStops := buildStopResponses(matched, nil, now)

		log.Printf("[/api/arrivals/route] returning %d stops in %s", len(respStops), time.Since(now))
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(arrivalsResponse{Stops: respStops}); err != nil {
			log.Printf("[/api/arrivals/route] JSON encode error: %v", err)
		}
	}
}
