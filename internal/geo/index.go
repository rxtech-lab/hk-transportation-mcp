package geo

import (
	"database/sql"
	"fmt"
	"sort"
	"sync"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

// StopIndex provides geospatial search over bus stops using PostGIS
// and in-memory lookups for route relationships.
type StopIndex struct {
	db         *sql.DB
	mu         sync.RWMutex
	stopsByID  map[string]models.BusStop
	routeStops map[string][]models.RouteStop // routeID → ordered route stops
	stopRoutes map[string][]string           // stopID → routeIDs
}

// NewStopIndex creates an empty StopIndex.
func NewStopIndex(db *sql.DB) *StopIndex {
	return &StopIndex{
		db:         db,
		stopsByID:  make(map[string]models.BusStop),
		routeStops: make(map[string][]models.RouteStop),
		stopRoutes: make(map[string][]string),
	}
}

// Reload replaces all in-memory index data atomically.
func (idx *StopIndex) Reload(stops []models.BusStop, routeStops []models.RouteStop) {
	byID := make(map[string]models.BusStop, len(stops))
	for _, s := range stops {
		byID[s.StopID] = s
	}

	rsMap := make(map[string][]models.RouteStop)
	srMap := make(map[string][]string)
	for _, rs := range routeStops {
		rsMap[rs.RouteID] = append(rsMap[rs.RouteID], rs)
		srMap[rs.StopID] = append(srMap[rs.StopID], rs.RouteID)
	}

	// Sort route stops by sequence
	for routeID := range rsMap {
		sort.Slice(rsMap[routeID], func(i, j int) bool {
			return rsMap[routeID][i].StopSeq < rsMap[routeID][j].StopSeq
		})
	}

	// Deduplicate stop routes
	for stopID := range srMap {
		srMap[stopID] = dedupe(srMap[stopID])
	}

	idx.mu.Lock()
	idx.stopsByID = byID
	idx.routeStops = rsMap
	idx.stopRoutes = srMap
	idx.mu.Unlock()
}

// FindNearby returns all stops within radiusM meters of (lat, lon) using PostGIS.
func (idx *StopIndex) FindNearby(lat, lon float64, radiusM float64) []models.BusStop {
	rows, err := idx.db.Query(
		`SELECT stop_id, name_en, name_tc, name_sc, lat, lon, operator
		 FROM bus_stops
		 WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
		lon, lat, radiusM,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var result []models.BusStop
	for rows.Next() {
		var s models.BusStop
		if err := rows.Scan(&s.StopID, &s.NameEn, &s.NameTc, &s.NameSc, &s.Lat, &s.Lon, &s.Operator); err != nil {
			continue
		}
		result = append(result, s)
	}
	return result
}

// RoutesForStop returns all route IDs that serve the given stop.
func (idx *StopIndex) RoutesForStop(stopID string) []string {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return idx.stopRoutes[stopID]
}

// StopsForRoute returns the ordered stops for a given route.
func (idx *StopIndex) StopsForRoute(routeID string) []models.RouteStop {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return idx.routeStops[routeID]
}

// GetStop returns a stop by ID, or false if not found.
func (idx *StopIndex) GetStop(stopID string) (models.BusStop, bool) {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	s, ok := idx.stopsByID[stopID]
	return s, ok
}

// StopCount returns the total number of stops in the index.
func (idx *StopIndex) StopCount() int {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return len(idx.stopsByID)
}

// LoadFromDB populates the in-memory route index from the database.
func (idx *StopIndex) LoadFromDB() error {
	rows, err := idx.db.Query("SELECT stop_id, name_en, name_tc, name_sc, lat, lon, operator FROM bus_stops")
	if err != nil {
		return fmt.Errorf("query stops: %w", err)
	}
	defer rows.Close()

	var stops []models.BusStop
	for rows.Next() {
		var s models.BusStop
		if err := rows.Scan(&s.StopID, &s.NameEn, &s.NameTc, &s.NameSc, &s.Lat, &s.Lon, &s.Operator); err != nil {
			return fmt.Errorf("scan stop: %w", err)
		}
		stops = append(stops, s)
	}

	rsRows, err := idx.db.Query("SELECT route_id, stop_id, stop_seq, operator FROM route_stops")
	if err != nil {
		return fmt.Errorf("query route_stops: %w", err)
	}
	defer rsRows.Close()

	var routeStops []models.RouteStop
	for rsRows.Next() {
		var rs models.RouteStop
		if err := rsRows.Scan(&rs.RouteID, &rs.StopID, &rs.StopSeq, &rs.Operator); err != nil {
			return fmt.Errorf("scan route_stop: %w", err)
		}
		routeStops = append(routeStops, rs)
	}

	if len(stops) == 0 {
		return fmt.Errorf("no stops found in database")
	}

	idx.Reload(stops, routeStops)
	return nil
}

func dedupe(ss []string) []string {
	seen := make(map[string]struct{}, len(ss))
	result := make([]string, 0, len(ss))
	for _, s := range ss {
		if _, ok := seen[s]; !ok {
			seen[s] = struct{}{}
			result = append(result, s)
		}
	}
	return result
}
