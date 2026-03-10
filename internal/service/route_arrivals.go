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
)

// RouteArrivalsService handles the route_arrivals tool logic.
type RouteArrivalsService struct {
	index   *geo.StopIndex
	clients []busapi.BusAPIClient
	cache   *cache.Cache
}

// NewRouteArrivalsService creates a new RouteArrivalsService.
func NewRouteArrivalsService(index *geo.StopIndex, clients []busapi.BusAPIClient, c *cache.Cache) *RouteArrivalsService {
	return &RouteArrivalsService{
		index:   index,
		clients: clients,
		cache:   c,
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
type TransferRouteLeg struct {
	RouteID    string         `json:"route_id"`
	RouteName  string         `json:"route_name"`
	BoardStop  models.BusStop `json:"board_stop"`
	AlightStop models.BusStop `json:"alight_stop"`
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

	for _, t := range transfers {
		var legs []TransferRouteLeg
		valid := true
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
			legs = append(legs, TransferRouteLeg{
				RouteID:    leg.RouteID,
				RouteName:  extractRouteName(leg.RouteID),
				BoardStop:  boardStop,
				AlightStop: alightStop,
			})
		}
		if !valid || len(legs) == 0 {
			continue
		}

		firstLegRouteName := legs[0].RouteName
		etas := nearbyService.fetchETACached(ctx, legs[0].BoardStop, firstLegRouteName)

		transferRoutes = append(transferRoutes, TransferRoute{
			Legs:             legs,
			NumTransfers:     len(legs) - 1,
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
