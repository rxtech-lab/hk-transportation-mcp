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
	NameEn   string             `json:"name_en"`
	NameTc   string             `json:"name_tc"`
	NameSc   string             `json:"name_sc"`
	Lat      float64            `json:"lat"`
	Lon      float64            `json:"lon"`
	Distance float64            `json:"distance"` // distance in metres from query point
	Arrivals []models.ETAArrival `json:"arrivals"`
}

// Execute finds nearby stops and fetches ETAs for all routes at each stop.
func (s *NearbyArrivalsService) Execute(ctx context.Context, lat, lon, radiusM float64) (*NearbyArrivalsResult, error) {
	nearbyStops := s.index.FindNearby(lat, lon, radiusM)
	log.Printf("[nearby] found %d stops within %.0fm of (%.6f, %.6f)", len(nearbyStops), radiusM, lat, lon)
	for _, st := range nearbyStops {
		log.Printf("[nearby]   stop %s operator=%s name=%s", st.StopID, st.Operator, st.NameEn)
	}
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
			log.Printf("[nearby]   stop %s (%s) has %d route(s)", stop.StopID, stop.Operator, len(routeIDs))
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

			var (
				innerWg  sync.WaitGroup
				innerMu  sync.Mutex
				arrivals []models.ETAArrival
			)
			for routeName := range routeNames {
				innerWg.Add(1)
				go func(route string) {
					defer innerWg.Done()
					etas := s.fetchETACached(ctx, stop, route)
					if len(etas) > 0 {
						innerMu.Lock()
						arrivals = append(arrivals, etas...)
						innerMu.Unlock()
					}
				}(routeName)
			}
			innerWg.Wait()

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

			// Skip stops with no arrivals
			if len(arrivals) == 0 {
				return
			}

			mu.Lock()
			results = append(results, NearbyStopArrivals{
				StopID:   stop.StopID,
				StopName: stop.NameEn,
				NameEn:   stop.NameEn,
				NameTc:   stop.NameTc,
				NameSc:   stop.NameSc,
				Lat:      stop.Lat,
				Lon:      stop.Lon,
				Distance: geo.HaversineMetres(lat, lon, stop.Lat, stop.Lon),
				Arrivals: arrivals,
			})
			mu.Unlock()
		}(stop)
	}

	wg.Wait()

	// Sort stops by distance from query point
	sort.Slice(results, func(i, j int) bool {
		return results[i].Distance < results[j].Distance
	})

	log.Printf("[nearby] %d stops had arrivals out of %d nearby", len(results), len(nearbyStops))

	// Group nearby stops from different operators into a single entry
	results = groupNearbyStops(results)

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
				log.Printf("[nearby]     ETA cache hit %s/%s/%s: %d arrivals", client.Operator(), stop.StopID, route, len(cached))
				return cached
			}
		}

		log.Printf("[nearby]     fetching ETA %s/%s/%s", client.Operator(), stop.StopID, route)
		etas, err := client.FetchETA(ctx, stop.StopID, route)
		if err != nil {
			log.Printf("[nearby]     ETA error %s/%s/%s: %v", client.Operator(), stop.StopID, route, err)
			return nil
		}
		log.Printf("[nearby]     ETA result %s/%s/%s: %d arrivals", client.Operator(), stop.StopID, route, len(etas))

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

// ExecuteForRoute finds nearby stops serving a specific route and fetches ETAs
// only for that route. More efficient than Execute when the user asks about a
// specific bus route (e.g. "when is the next 170?").
// If destLat/destLon are non-zero, the method determines which direction of the
// route goes towards that destination by comparing terminus stops, then only
// includes stops on that bound.
func (s *NearbyArrivalsService) ExecuteForRoute(ctx context.Context, lat, lon, radiusM float64, routeName string, destLat, destLon float64) (*NearbyArrivalsResult, error) {
	// If destination coordinates are provided, resolve to specific route IDs
	// by finding which variant's terminus is closest to the destination.
	var allowedRouteIDs map[string]struct{}
	if destLat != 0 || destLon != 0 {
		routes, err := s.index.GetRoutesByName(routeName, "")
		if err == nil && len(routes) > 0 {
			// For each route variant, find its last stop and compute distance
			// to the destination. Pick the variant(s) whose terminus is closest.
			type candidate struct {
				routeID  string
				distance float64
			}
			var candidates []candidate
			for _, r := range routes {
				stops := s.index.StopsForRoute(r.RouteID)
				if len(stops) == 0 {
					continue
				}
				lastStop := stops[len(stops)-1]
				if stop, ok := s.index.GetStop(lastStop.StopID); ok {
					dist := geo.HaversineMetres(destLat, destLon, stop.Lat, stop.Lon)
					candidates = append(candidates, candidate{routeID: r.RouteID, distance: dist})
				}
			}
			if len(candidates) > 0 {
				// Find minimum distance
				sort.Slice(candidates, func(i, j int) bool {
					return candidates[i].distance < candidates[j].distance
				})
				bestDist := candidates[0].distance
				allowedRouteIDs = make(map[string]struct{})
				for _, c := range candidates {
					// Include all variants within 500m of the best match
					// (handles multiple service types for same direction)
					if c.distance <= bestDist+500 {
						allowedRouteIDs[c.routeID] = struct{}{}
					}
				}
				log.Printf("[route-nearby] dest (%.6f,%.6f) matched %d route IDs (best terminus %.0fm away)", destLat, destLon, len(allowedRouteIDs), bestDist)
			}
		}
	}

	// Extract allowed bounds (directions) from allowed route IDs for ETA filtering.
	// Route IDs encode bound: "KMB-77-O-1" → bound "O", "GMB-NT-77-O-1" → bound "O"
	var allowedBounds map[string]struct{}
	if allowedRouteIDs != nil {
		allowedBounds = make(map[string]struct{})
		for rid := range allowedRouteIDs {
			parts := splitRouteID(rid)
			// GMB: GMB-REGION-ROUTE-BOUND-SERVICETYPE → parts[3]
			// KMB: KMB-ROUTE-BOUND-SERVICETYPE → parts[2]
			// CTB: CTB-ROUTE-BOUND → parts[2]
			if len(parts) >= 5 && parts[0] == "GMB" {
				allowedBounds[parts[3]] = struct{}{}
			} else if len(parts) >= 3 {
				allowedBounds[parts[2]] = struct{}{}
			}
		}
		log.Printf("[route-nearby] allowed bounds: %v", allowedBounds)
	}

	nearbyStops := s.index.FindNearby(lat, lon, radiusM)
	log.Printf("[route-nearby] found %d stops within %.0fm of (%.6f, %.6f) for route %s", len(nearbyStops), radiusM, lat, lon, routeName)
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

			// Check if this stop serves the requested route (and correct direction)
			routeIDs := s.index.RoutesForStop(stop.StopID)
			servesRoute := false
			for _, rid := range routeIDs {
				if extractRouteName(rid) != routeName {
					continue
				}
				// If we have allowed route IDs (direction filter), check against them
				if allowedRouteIDs != nil {
					if _, ok := allowedRouteIDs[rid]; !ok {
						continue
					}
				}
				servesRoute = true
				break
			}
			if !servesRoute {
				return
			}

			// Fetch ETAs only for the requested route
			allETAs := s.fetchETACached(ctx, stop, routeName)
			if len(allETAs) == 0 {
				return
			}

			// Filter ETAs by allowed direction if we have destination filtering
			var arrivals []models.ETAArrival
			if allowedBounds != nil {
				for _, a := range allETAs {
					if _, ok := allowedBounds[a.Direction]; ok {
						arrivals = append(arrivals, a)
					}
				}
			} else {
				arrivals = allETAs
			}
			if len(arrivals) == 0 {
				return
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
				NameEn:   stop.NameEn,
				NameTc:   stop.NameTc,
				NameSc:   stop.NameSc,
				Lat:      stop.Lat,
				Lon:      stop.Lon,
				Distance: geo.HaversineMetres(lat, lon, stop.Lat, stop.Lon),
				Arrivals: arrivals,
			})
			mu.Unlock()
		}(stop)
	}

	wg.Wait()

	// Sort stops by distance from query point
	sort.Slice(results, func(i, j int) bool {
		return results[i].Distance < results[j].Distance
	})

	log.Printf("[route-nearby] %d stops serve route %s out of %d nearby", len(results), routeName, len(nearbyStops))

	// Group nearby stops from different operators into a single entry
	results = groupNearbyStops(results)

	return &NearbyArrivalsResult{Stops: results}, nil
}

// ExecuteByStopID fetches ETAs for a single stop looked up by its ID.
func (s *NearbyArrivalsService) ExecuteByStopID(ctx context.Context, stopID string) (*NearbyStopArrivals, error) {
	stop, ok := s.index.GetStop(stopID)
	if !ok {
		return nil, nil
	}

	routeIDs := s.index.RoutesForStop(stop.StopID)
	if len(routeIDs) == 0 {
		return &NearbyStopArrivals{StopID: stop.StopID, StopName: stop.NameEn, NameEn: stop.NameEn, NameTc: stop.NameTc, NameSc: stop.NameSc, Lat: stop.Lat, Lon: stop.Lon}, nil
	}

	routeNames := make(map[string]struct{})
	for _, rid := range routeIDs {
		routeStops := s.index.StopsForRoute(rid)
		for _, rs := range routeStops {
			if rs.StopID == stop.StopID {
				routeNames[extractRouteName(rid)] = struct{}{}
				break
			}
		}
	}

	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		arrivals []models.ETAArrival
	)
	for routeName := range routeNames {
		wg.Add(1)
		go func(route string) {
			defer wg.Done()
			etas := s.fetchETACached(ctx, stop, route)
			if len(etas) > 0 {
				mu.Lock()
				arrivals = append(arrivals, etas...)
				mu.Unlock()
			}
		}(routeName)
	}
	wg.Wait()

	sort.Slice(arrivals, func(i, j int) bool {
		if arrivals[i].ETA == nil {
			return false
		}
		if arrivals[j].ETA == nil {
			return true
		}
		return arrivals[i].ETA.Before(*arrivals[j].ETA)
	})

	return &NearbyStopArrivals{
		StopID:   stop.StopID,
		StopName: stop.NameEn,
		NameEn:   stop.NameEn,
		NameTc:   stop.NameTc,
		NameSc:   stop.NameSc,
		Lat:      stop.Lat,
		Lon:      stop.Lon,
		Arrivals: arrivals,
	}, nil
}

// FetchStopETA fetches ETAs for a specific stop, route and operator combination.
func (s *NearbyArrivalsService) FetchStopETA(ctx context.Context, stopID, route, operator string) ([]models.ETAArrival, error) {
	stop, ok := s.index.GetStop(stopID)
	if !ok {
		return nil, fmt.Errorf("stop %s not found", stopID)
	}

	if operator != "" && stop.Operator != operator {
		return nil, fmt.Errorf("stop %s belongs to operator %s, not %s", stopID, stop.Operator, operator)
	}

	etas := s.fetchETACached(ctx, stop, route)
	sort.Slice(etas, func(i, j int) bool {
		if etas[i].ETA == nil {
			return false
		}
		if etas[j].ETA == nil {
			return true
		}
		return etas[i].ETA.Before(*etas[j].ETA)
	})

	return etas, nil
}

// extractRouteName extracts the route name from a route ID.
// KMB/CTB format: "KMB-1A-O-1"       → "1A"
// GMB format:     "GMB-NT-11-O-1"     → "11"  (extra region segment)
func extractRouteName(routeID string) string {
	parts := splitRouteID(routeID)
	if len(parts) >= 5 && parts[0] == "GMB" {
		// GMB: OPERATOR-REGION-ROUTE-BOUND-SERVICETYPE
		return parts[2]
	}
	if len(parts) >= 2 {
		// KMB/CTB: OPERATOR-ROUTE-BOUND-SERVICETYPE
		return parts[1]
	}
	return routeID
}


// groupNearbyStops merges stops that are within geo.GroupDistanceM of each other
// and from different operators into a single stop entry with combined arrivals.
// The first (closest) stop in each group is used as the representative.
func groupNearbyStops(stops []NearbyStopArrivals) []NearbyStopArrivals {
	if len(stops) <= 1 {
		return stops
	}

	merged := make([]bool, len(stops))
	var result []NearbyStopArrivals

	for i := 0; i < len(stops); i++ {
		if merged[i] {
			continue
		}

		group := stops[i]
		for j := i + 1; j < len(stops); j++ {
			if merged[j] {
				continue
			}
			dist := geo.HaversineMetres(group.Lat, group.Lon, stops[j].Lat, stops[j].Lon)
			if dist <= geo.GroupDistanceM {
				// Merge arrivals from the nearby stop into the group
				group.Arrivals = append(group.Arrivals, stops[j].Arrivals...)
				merged[j] = true
			}
		}

		// Re-sort merged arrivals by ETA
		sort.Slice(group.Arrivals, func(a, b int) bool {
			if group.Arrivals[a].ETA == nil {
				return false
			}
			if group.Arrivals[b].ETA == nil {
				return true
			}
			return group.Arrivals[a].ETA.Before(*group.Arrivals[b].ETA)
		})

		result = append(result, group)
	}

	return result
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
