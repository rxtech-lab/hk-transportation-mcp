package geo

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
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

// TransferResult represents a one-transfer route found via SQL query.
type TransferResult struct {
	FirstRouteID   string
	OriginStopID   string
	TransferStopID string
	SecondRouteID  string
	DestStopID     string
}

// FindTransferRoutes finds one-transfer routes between sets of origin and
// destination stops using SQL. It joins route_stops to itself to discover
// pairs of routes sharing a common transfer stop, where the first route
// serves an origin stop before the transfer stop and the second route
// serves the transfer stop before a destination stop.
func (idx *StopIndex) FindTransferRoutes(originStopIDs, destStopIDs []string, maxResults int) ([]TransferResult, error) {
	if idx.db == nil || len(originStopIDs) == 0 || len(destStopIDs) == 0 {
		return nil, nil
	}
	if maxResults <= 0 {
		maxResults = 20
	}

	nOrigin := len(originStopIDs)
	nDest := len(destStopIDs)

	originPH := placeholders(1, nOrigin)
	destPH := placeholders(nOrigin+1, nDest)
	limitPH := fmt.Sprintf("$%d", nOrigin+nDest+1)

	query := fmt.Sprintf(`
		WITH first_leg AS (
			SELECT rs_o.route_id,
			       rs_o.stop_id   AS origin_stop_id,
			       rs_o.stop_seq  AS origin_seq,
			       rs_t.stop_id   AS transfer_stop_id,
			       rs_t.stop_seq  AS transfer_seq
			FROM route_stops rs_o
			JOIN route_stops rs_t
			  ON rs_t.route_id = rs_o.route_id
			 AND rs_t.stop_seq > rs_o.stop_seq
			WHERE rs_o.stop_id IN (%s)
		),
		second_leg AS (
			SELECT rs_d.route_id,
			       rs_d.stop_id   AS dest_stop_id,
			       rs_d.stop_seq  AS dest_seq,
			       rs_t.stop_id   AS transfer_stop_id,
			       rs_t.stop_seq  AS transfer_seq
			FROM route_stops rs_d
			JOIN route_stops rs_t
			  ON rs_t.route_id = rs_d.route_id
			 AND rs_t.stop_seq < rs_d.stop_seq
			WHERE rs_d.stop_id IN (%s)
		)
		SELECT DISTINCT ON (f.route_id, s.route_id)
			f.route_id,
			f.origin_stop_id,
			f.transfer_stop_id,
			s.route_id,
			s.dest_stop_id
		FROM first_leg f
		JOIN second_leg s ON f.transfer_stop_id = s.transfer_stop_id
		WHERE f.route_id != s.route_id
		ORDER BY f.route_id, s.route_id,
		         (f.transfer_seq - f.origin_seq) + (s.dest_seq - s.transfer_seq)
		LIMIT %s
	`, originPH, destPH, limitPH)

	args := make([]interface{}, 0, nOrigin+nDest+1)
	for _, id := range originStopIDs {
		args = append(args, id)
	}
	for _, id := range destStopIDs {
		args = append(args, id)
	}
	args = append(args, maxResults)

	rows, err := idx.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("transfer query: %w", err)
	}
	defer rows.Close()

	var results []TransferResult
	for rows.Next() {
		var r TransferResult
		if err := rows.Scan(&r.FirstRouteID, &r.OriginStopID, &r.TransferStopID, &r.SecondRouteID, &r.DestStopID); err != nil {
			return nil, fmt.Errorf("scan transfer: %w", err)
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// placeholders generates a comma-separated list of numbered SQL parameter
// placeholders ($start, $start+1, ..., $start+count-1).
func placeholders(start, count int) string {
	parts := make([]string, count)
	for i := 0; i < count; i++ {
		parts[i] = fmt.Sprintf("$%d", start+i)
	}
	return strings.Join(parts, ", ")
}
