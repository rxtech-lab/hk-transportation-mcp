package service

import (
	"context"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

const etaCacheTTL = 30 * time.Second

// NearbyArrivalsService handles the nearby_arrivals tool logic.
type NearbyArrivalsService struct {
	index   *geo.StopIndex
	clients []busapi.BusAPIClient
	cache   *cache.Cache
}

// NewNearbyArrivalsService creates a new NearbyArrivalsService.
func NewNearbyArrivalsService(index *geo.StopIndex, clients []busapi.BusAPIClient, c *cache.Cache) *NearbyArrivalsService {
	return &NearbyArrivalsService{
		index:   index,
		clients: clients,
		cache:   c,
	}
}

// NearbyArrivalsResult is the result returned by the nearby_arrivals tool.
type NearbyArrivalsResult struct {
	Stops []NearbyStopArrivals `json:"stops"`
}

// NearbyStopArrivals groups arrivals by stop.
type NearbyStopArrivals struct {
	StopID   string             `json:"stop_id"`
	StopName string             `json:"stop_name"`
	Lat      float64            `json:"lat"`
	Lon      float64            `json:"lon"`
	Arrivals []models.ETAArrival `json:"arrivals"`
}

// Execute finds nearby stops and fetches ETAs for all routes at each stop.
func (s *NearbyArrivalsService) Execute(ctx context.Context, lat, lon, radiusM float64) (*NearbyArrivalsResult, error) {
	nearbyStops := s.index.FindNearby(lat, lon, radiusM)
	if len(nearbyStops) == 0 {
		return &NearbyArrivalsResult{Stops: []NearbyStopArrivals{}}, nil
	}

	var (
		mu      sync.Mutex
		results []NearbyStopArrivals
		wg      sync.WaitGroup
	)

	for _, stop := range nearbyStops {
		wg.Add(1)
		go func(stop models.BusStop) {
			defer wg.Done()

			routeIDs := s.index.RoutesForStop(stop.StopID)
			if len(routeIDs) == 0 {
				return
			}

			// Collect unique route names for this stop
			routeNames := make(map[string]struct{})
			for _, rid := range routeIDs {
				routeStops := s.index.StopsForRoute(rid)
				for _, rs := range routeStops {
					if rs.StopID == stop.StopID {
						// Extract route name from routeID
						routeNames[extractRouteName(rid)] = struct{}{}
						break
					}
				}
			}

			var arrivals []models.ETAArrival
			for routeName := range routeNames {
				etas := s.fetchETACached(ctx, stop, routeName)
				arrivals = append(arrivals, etas...)
			}

			// Sort by ETA time
			sort.Slice(arrivals, func(i, j int) bool {
				if arrivals[i].ETA == nil {
					return false
				}
				if arrivals[j].ETA == nil {
					return true
				}
				return arrivals[i].ETA.Before(*arrivals[j].ETA)
			})

			mu.Lock()
			results = append(results, NearbyStopArrivals{
				StopID:   stop.StopID,
				StopName: stop.NameEn,
				Lat:      stop.Lat,
				Lon:      stop.Lon,
				Arrivals: arrivals,
			})
			mu.Unlock()
		}(stop)
	}

	wg.Wait()

	return &NearbyArrivalsResult{Stops: results}, nil
}

func (s *NearbyArrivalsService) fetchETACached(ctx context.Context, stop models.BusStop, route string) []models.ETAArrival {
	for _, client := range s.clients {
		if client.Operator() != stop.Operator {
			continue
		}

		cacheKey := fmt.Sprintf("eta:%s:%s:%s", client.Operator(), stop.StopID, route)
		if s.cache != nil {
			if cached, ok, err := cache.GetJSON[[]models.ETAArrival](ctx, s.cache, cacheKey); err == nil && ok {
				return cached
			}
		}

		etas, err := client.FetchETA(ctx, stop.StopID, route)
		if err != nil {
			log.Printf("fetch ETA %s/%s/%s: %v", client.Operator(), stop.StopID, route, err)
			return nil
		}

		// Populate stop name
		for i := range etas {
			etas[i].StopName = stop.NameEn
		}

		if s.cache != nil {
			_ = cache.SetJSON(ctx, s.cache, cacheKey, etas, etaCacheTTL)
		}
		return etas
	}
	return nil
}

// extractRouteName extracts the route name from a route ID like "KMB-1A-O-1" → "1A"
func extractRouteName(routeID string) string {
	// Format: OPERATOR-ROUTE-BOUND-SERVICETYPE
	parts := splitRouteID(routeID)
	if len(parts) >= 2 {
		return parts[1]
	}
	return routeID
}

func splitRouteID(routeID string) []string {
	var parts []string
	start := 0
	for i, c := range routeID {
		if c == '-' {
			parts = append(parts, routeID[start:i])
			start = i + 1
		}
	}
	parts = append(parts, routeID[start:])
	return parts
}
