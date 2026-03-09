package service

import (
	"context"
	"fmt"
	"log"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/osm"
)

// SearchLocationService handles the search_location tool logic.
type SearchLocationService struct {
	index     *geo.StopIndex
	nominatim *osm.NominatimClient
	overpass  *osm.OverpassClient
}

// NewSearchLocationService creates a new SearchLocationService.
func NewSearchLocationService(index *geo.StopIndex, nominatim *osm.NominatimClient, overpass *osm.OverpassClient) *SearchLocationService {
	return &SearchLocationService{
		index:     index,
		nominatim: nominatim,
		overpass:  overpass,
	}
}

// SearchLocationResult is the result for the search_location tool.
type SearchLocationResult struct {
	Locations []LocationWithStops `json:"locations"`
}

// LocationWithStops combines a geocoded location with nearby bus stops.
type LocationWithStops struct {
	Name       string           `json:"name"`
	Lat        float64          `json:"lat"`
	Lon        float64          `json:"lon"`
	Type       string           `json:"type,omitempty"`
	NearbyStops []models.BusStop `json:"nearby_stops"`
}

// Execute searches for a location and finds nearby bus stops.
func (s *SearchLocationService) Execute(ctx context.Context, query string, limit int) (*SearchLocationResult, error) {
	log.Printf("[search_location] executing query=%q limit=%d", query, limit)

	if limit <= 0 {
		limit = 5
	}

	// Geocode the query
	results, err := s.nominatim.Search(ctx, query, limit)
	if err != nil {
		log.Printf("[search_location] geocoding failed: %v", err)
		return nil, fmt.Errorf("geocoding failed: %w", err)
	}

	log.Printf("[search_location] nominatim returned %d results for query=%q", len(results), query)

	if len(results) == 0 {
		log.Printf("[search_location] no locations found for query=%q", query)
		return &SearchLocationResult{Locations: []LocationWithStops{}}, nil
	}

	var locations []LocationWithStops
	for _, r := range results {
		log.Printf("[search_location] processing location=%q lat=%f lon=%f", r.DisplayName, r.Lat, r.Lon)

		// Find nearby stops from in-memory index (300m default)
		nearbyStops := s.index.FindNearby(r.Lat, r.Lon, 300)
		log.Printf("[search_location] found %d nearby stops from index for location=%q", len(nearbyStops), r.DisplayName)

		// If no stops in index, try Overpass as fallback
		if len(nearbyStops) == 0 && s.overpass != nil {
			log.Printf("[search_location] no index stops, trying overpass fallback for location=%q", r.DisplayName)
			osmStops, err := s.overpass.FindNearbyStops(ctx, r.Lat, r.Lon, 300)
			if err == nil {
				nearbyStops = osmStops
				log.Printf("[search_location] overpass returned %d stops for location=%q", len(nearbyStops), r.DisplayName)
			} else {
				log.Printf("[search_location] overpass fallback failed: %v", err)
			}
		}

		locations = append(locations, LocationWithStops{
			Name:        r.DisplayName,
			Lat:         r.Lat,
			Lon:         r.Lon,
			Type:        r.Type,
			NearbyStops: nearbyStops,
		})
	}

	return &SearchLocationResult{Locations: locations}, nil
}
