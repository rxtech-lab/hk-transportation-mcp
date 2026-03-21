package service

import (
	"context"
	"log"
	"sort"
	"sync"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/osm"
)

// RouteArrivalsService handles the route_arrivals tool logic.
type RouteArrivalsService struct {
	index    *geo.StopIndex
	clients  []busapi.BusAPIClient
	cache    *cache.Cache
	overpass *osm.OverpassClient
}

// NewRouteArrivalsService creates a new RouteArrivalsService.
func NewRouteArrivalsService(index *geo.StopIndex, clients []busapi.BusAPIClient, c *cache.Cache, overpass *osm.OverpassClient) *RouteArrivalsService {
	return &RouteArrivalsService{
		index:    index,
		clients:  clients,
		cache:    c,
		overpass: overpass,
	}
}

// RouteArrivalsResult is the result for the route_arrivals tool.
type RouteArrivalsResult struct {
	CandidateRoutes []CandidateRoute `json:"candidate_routes"`
	TransferRoutes  []TransferRoute  `json:"transfer_routes"`
}

// CandidateRoute represents a route that connects origin to destination.
type CandidateRoute struct {
	RouteID      string              `json:"route_id"`
	RouteName    string              `json:"route_name"`
	Operator     string              `json:"operator"`
	Origin       string              `json:"origin"`
	Destination  string              `json:"destination"`
	OriginStop   models.BusStop      `json:"origin_stop"`
	DestStop     models.BusStop      `json:"dest_stop"`
	Arrivals     []models.ETAArrival `json:"arrivals"`
}

// TransferRoute represents a route requiring one or more transfers between buses.
type TransferRoute struct {
	Legs             []TransferRouteLeg  `json:"legs"`
	NumTransfers     int                 `json:"num_transfers"`
	FirstLegArrivals []models.ETAArrival `json:"first_leg_arrivals"`
}

// TransferRouteLeg represents one leg of a multi-transfer route.
// Walking legs (IsWalking=true) indicate the passenger must walk between stops.
type TransferRouteLeg struct {
	RouteID    string         `json:"route_id"`
	RouteName  string         `json:"route_name"`
	BoardStop  models.BusStop `json:"board_stop"`
	AlightStop models.BusStop `json:"alight_stop"`
	IsWalking  bool           `json:"is_walking"`
}

// Execute finds routes connecting origin area to destination area and fetches ETAs.
func (s *RouteArrivalsService) Execute(ctx context.Context, lat, lon, destLat, destLon, radiusOrigin, radiusDest float64, maxTransfers int) (*RouteArrivalsResult, error) {
	originStops := s.index.FindNearby(lat, lon, radiusOrigin)
	destStops := s.index.FindNearby(destLat, destLon, radiusDest)

	if len(originStops) == 0 || len(destStops) == 0 {
		return &RouteArrivalsResult{
			CandidateRoutes: []CandidateRoute{},
			TransferRoutes:  []TransferRoute{},
		}, nil
	}

	nearbyService := &NearbyArrivalsService{
		index:   s.index,
		clients: s.clients,
		cache:   s.cache,
	}

	// --- Direct routes (in-memory) ---
	// Build set of routes serving destination stops
	destRoutes := make(map[string]map[string]int) // routeID → stopID → seq
	for _, stop := range destStops {
		for _, routeID := range s.index.RoutesForStop(stop.StopID) {
			if destRoutes[routeID] == nil {
				destRoutes[routeID] = make(map[string]int)
			}
			for _, rs := range s.index.StopsForRoute(routeID) {
				if rs.StopID == stop.StopID {
					destRoutes[routeID][stop.StopID] = rs.StopSeq
					break
				}
			}
		}
	}

	// Find candidate routes: origin stop must come before dest stop
	type candidate struct {
		routeID    string
		originStop models.BusStop
		destStop   models.BusStop
		originSeq  int
		destSeq    int
	}

	var candidates []candidate
	for _, stop := range originStops {
		for _, routeID := range s.index.RoutesForStop(stop.StopID) {
			destStopSeqs, ok := destRoutes[routeID]
			if !ok {
				continue
			}

			// Find origin seq for this stop on this route
			var originSeq int
			found := false
			for _, rs := range s.index.StopsForRoute(routeID) {
				if rs.StopID == stop.StopID {
					originSeq = rs.StopSeq
					found = true
					break
				}
			}
			if !found {
				continue
			}

			// Check if any dest stop comes after origin
			for destStopID, destSeq := range destStopSeqs {
				if destSeq > originSeq {
					dStop, ok := s.index.GetStop(destStopID)
					if !ok {
						continue
					}
					candidates = append(candidates, candidate{
						routeID:    routeID,
						originStop: stop,
						destStop:   dStop,
						originSeq:  originSeq,
						destSeq:    destSeq,
					})
				}
			}
		}
	}

	// Deduplicate by routeID (keep shortest path)
	sort.Slice(candidates, func(i, j int) bool {
		return (candidates[i].destSeq - candidates[i].originSeq) < (candidates[j].destSeq - candidates[j].originSeq)
	})
	seen := make(map[string]struct{})
	var uniqueCandidates []candidate
	for _, c := range candidates {
		if _, ok := seen[c.routeID]; !ok {
			seen[c.routeID] = struct{}{}
			uniqueCandidates = append(uniqueCandidates, c)
		}
	}

	// Fetch ETAs concurrently for direct routes
	var (
		mu      sync.Mutex
		results []CandidateRoute
		wg      sync.WaitGroup
	)

	for _, c := range uniqueCandidates {
		wg.Add(1)
		go func(c candidate) {
			defer wg.Done()

			routeName := extractRouteName(c.routeID)
			etas := nearbyService.fetchETACached(ctx, c.originStop, routeName)

			mu.Lock()
			results = append(results, CandidateRoute{
				RouteID:     c.routeID,
				RouteName:   routeName,
				Operator:    c.originStop.Operator,
				OriginStop:  c.originStop,
				DestStop:    c.destStop,
				Arrivals:    etas,
			})
			mu.Unlock()
		}(c)
	}

	wg.Wait()

	// --- Transfer routes (SQL) ---
	originStopIDs := make([]string, len(originStops))
	for i, s := range originStops {
		originStopIDs[i] = s.StopID
	}
	destStopIDs := make([]string, len(destStops))
	for i, s := range destStops {
		destStopIDs[i] = s.StopID
	}

	var transferRoutes []TransferRoute

	transfers, err := s.index.FindTransferRoutes(originStopIDs, destStopIDs, maxTransfers, 10)
	if err != nil {
		log.Printf("transfer route search failed (origins=%d, dests=%d): %v", len(originStopIDs), len(destStopIDs), err)
	}

	// Fallback: when pgRouting returns no results, use Overpass + in-memory search
	if len(transfers) == 0 && s.overpass != nil {
		transfers = s.findTransferRoutesViaOverpass(ctx, lat, lon, destLat, destLon, originStopIDs, destStopIDs)
	}

	for _, t := range transfers {
		var legs []TransferRouteLeg
		valid := true
		busTransfers := 0
		for _, leg := range t.Legs {
			boardStop, ok := s.index.GetStop(leg.BoardStopID)
			if !ok {
				valid = false
				break
			}
			alightStop, ok := s.index.GetStop(leg.AlightStopID)
			if !ok {
				valid = false
				break
			}
			routeName := ""
			if !leg.IsWalking {
				routeName = extractRouteName(leg.RouteID)
			}
			legs = append(legs, TransferRouteLeg{
				RouteID:    leg.RouteID,
				RouteName:  routeName,
				BoardStop:  boardStop,
				AlightStop: alightStop,
				IsWalking:  leg.IsWalking,
			})
		}
		if !valid || len(legs) == 0 {
			continue
		}

		// Count actual bus transfers — the number of times the passenger
		// switches from one bus route to another (walking legs in between
		// are transparent and don't add to the count).
		prevBusIdx := -1
		for i, leg := range legs {
			if !leg.IsWalking {
				if prevBusIdx >= 0 {
					busTransfers++
				}
				prevBusIdx = i
			}
		}
		_ = prevBusIdx

		// Fetch ETAs for the first bus leg
		var etas []models.ETAArrival
		for _, leg := range legs {
			if !leg.IsWalking {
				etas = nearbyService.fetchETACached(ctx, leg.BoardStop, leg.RouteName)
				break
			}
		}

		transferRoutes = append(transferRoutes, TransferRoute{
			Legs:             legs,
			NumTransfers:     busTransfers,
			FirstLegArrivals: etas,
		})
	}

	if results == nil {
		results = []CandidateRoute{}
	}
	if transferRoutes == nil {
		transferRoutes = []TransferRoute{}
	}

	return &RouteArrivalsResult{
		CandidateRoutes: results,
		TransferRoutes:  transferRoutes,
	}, nil
}

// findTransferRoutesViaOverpass uses the Overpass API to discover bus routes
// near origin and destination, then performs an in-memory transfer search and
// returns the results as geo.TransferResult slices.
func (s *RouteArrivalsService) findTransferRoutesViaOverpass(
	ctx context.Context,
	originLat, originLon, destLat, destLon float64,
	originStopIDs, destStopIDs []string,
) []geo.TransferResult {
	// Query Overpass for bus routes near origin and destination concurrently
	type routeResult struct {
		routes []osm.OverpassRoute
		err    error
	}
	originCh := make(chan routeResult, 1)
	destCh := make(chan routeResult, 1)

	go func() {
		routes, err := s.overpass.FindBusRoutesNear(ctx, originLat, originLon, 500, 5)
		originCh <- routeResult{routes, err}
	}()
	go func() {
		routes, err := s.overpass.FindBusRoutesNear(ctx, destLat, destLon, 500, 5)
		destCh <- routeResult{routes, err}
	}()

	originResult := <-originCh
	destResult := <-destCh

	if originResult.err != nil {
		log.Printf("overpass origin routes failed: %v", originResult.err)
	}
	if destResult.err != nil {
		log.Printf("overpass dest routes failed: %v", destResult.err)
	}

	// Map Overpass route refs to local route IDs
	var additionalOriginRouteIDs, additionalDestRouteIDs []string
	for _, r := range originResult.routes {
		additionalOriginRouteIDs = append(additionalOriginRouteIDs, s.index.RouteIDsByName(r.Ref)...)
	}
	for _, r := range destResult.routes {
		additionalDestRouteIDs = append(additionalDestRouteIDs, s.index.RouteIDsByName(r.Ref)...)
	}

	log.Printf("overpass fallback: %d origin route refs → %d local IDs, %d dest route refs → %d local IDs",
		len(originResult.routes), len(additionalOriginRouteIDs),
		len(destResult.routes), len(additionalDestRouteIDs))

	return s.index.FindTransferRoutesInMemory(
		originStopIDs, destStopIDs,
		additionalOriginRouteIDs, additionalDestRouteIDs,
		10,
	)
}
