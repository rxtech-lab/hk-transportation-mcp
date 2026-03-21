package geo

import (
	"database/sql"
	"fmt"
	"log"
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

// RouteIDsByName returns all route IDs whose extracted route name matches the
// given name (e.g., "960" matches "KMB-960-O-1", "CTB-960-I-1", etc.).
func (idx *StopIndex) RouteIDsByName(routeName string) []string {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	var ids []string
	for routeID := range idx.routeStops {
		name := extractRouteNameFromID(routeID)
		if name == routeName {
			ids = append(ids, routeID)
		}
	}
	return ids
}

// extractRouteNameFromID extracts the route name from a route ID like "KMB-1A-O-1" → "1A".
func extractRouteNameFromID(routeID string) string {
	parts := splitID(routeID)
	if len(parts) >= 2 {
		return parts[1]
	}
	return routeID
}

func splitID(routeID string) []string {
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

// FindTransferRoutesInMemory finds transfer routes between origin and destination
// stops using only in-memory data (no pgRouting). Supports single-transfer routes.
// additionalRouteIDs are extra route IDs (e.g., from Overpass) to include in the search.
func (idx *StopIndex) FindTransferRoutesInMemory(
	originStopIDs, destStopIDs []string,
	additionalOriginRouteIDs, additionalDestRouteIDs []string,
	maxResults int,
) []TransferResult {
	if maxResults <= 0 {
		maxResults = 10
	}

	idx.mu.RLock()
	defer idx.mu.RUnlock()

	type stopSeq struct {
		stopID string
		seq    int
	}

	// Build origin route info: routeID → earliest (stopID, seq) near origin
	originRoutes := make(map[string]stopSeq)
	for _, stopID := range originStopIDs {
		for _, routeID := range idx.stopRoutes[stopID] {
			for _, rs := range idx.routeStops[routeID] {
				if rs.StopID == stopID {
					if existing, ok := originRoutes[routeID]; !ok || rs.StopSeq < existing.seq {
						originRoutes[routeID] = stopSeq{stopID, rs.StopSeq}
					}
				}
			}
		}
	}

	// Add additional origin route IDs — find the stop on each route closest to any origin stop
	for _, routeID := range additionalOriginRouteIDs {
		if _, ok := originRoutes[routeID]; ok {
			continue
		}
		stops := idx.routeStops[routeID]
		for _, rs := range stops {
			for _, oid := range originStopIDs {
				if rs.StopID == oid {
					if existing, ok := originRoutes[routeID]; !ok || rs.StopSeq < existing.seq {
						originRoutes[routeID] = stopSeq{rs.StopID, rs.StopSeq}
					}
				}
			}
		}
	}

	// Build dest route info: routeID → latest (stopID, seq) near dest
	destRoutes := make(map[string]stopSeq)
	for _, stopID := range destStopIDs {
		for _, routeID := range idx.stopRoutes[stopID] {
			for _, rs := range idx.routeStops[routeID] {
				if rs.StopID == stopID {
					if existing, ok := destRoutes[routeID]; !ok || rs.StopSeq > existing.seq {
						destRoutes[routeID] = stopSeq{stopID, rs.StopSeq}
					}
				}
			}
		}
	}

	// Add additional dest route IDs
	for _, routeID := range additionalDestRouteIDs {
		if _, ok := destRoutes[routeID]; ok {
			continue
		}
		stops := idx.routeStops[routeID]
		for _, rs := range stops {
			for _, did := range destStopIDs {
				if rs.StopID == did {
					if existing, ok := destRoutes[routeID]; !ok || rs.StopSeq > existing.seq {
						destRoutes[routeID] = stopSeq{rs.StopID, rs.StopSeq}
					}
				}
			}
		}
	}

	// Find single-transfer routes: R1[origin→transfer] + R2[transfer→dest]
	var results []TransferResult
	seen := make(map[string]struct{})

	for r1, originInfo := range originRoutes {
		stopsOnR1 := idx.routeStops[r1]
		for _, rs := range stopsOnR1 {
			if rs.StopSeq <= originInfo.seq {
				continue
			}
			// rs.StopID is a potential transfer point
			for _, r2 := range idx.stopRoutes[rs.StopID] {
				destInfo, ok := destRoutes[r2]
				if !ok {
					continue
				}
				// Find transfer stop's seq on R2
				var transferSeqOnR2 int
				found := false
				for _, rs2 := range idx.routeStops[r2] {
					if rs2.StopID == rs.StopID {
						transferSeqOnR2 = rs2.StopSeq
						found = true
						break
					}
				}
				if !found || transferSeqOnR2 >= destInfo.seq {
					continue
				}

				legs := []TransferLeg{
					{RouteID: r1, BoardStopID: originInfo.stopID, AlightStopID: rs.StopID},
					{RouteID: r2, BoardStopID: rs.StopID, AlightStopID: destInfo.stopID},
				}

				sig := legSignature(legs)
				if _, ok := seen[sig]; ok {
					continue
				}
				seen[sig] = struct{}{}

				results = append(results, TransferResult{Legs: legs})
				if len(results) >= maxResults {
					return results
				}
			}
		}
	}

	return results
}

// WalkRouteID is a sentinel route ID used for walking transfer edges in the
// transit graph. When decomposePath encounters an edge with this route ID it
// marks the resulting TransferLeg as a walking leg.
const WalkRouteID = "WALK"

// DefaultWalkRadiusM is the maximum distance (in meters) between two stops for
// a walking transfer edge to be created in the transit graph.
const DefaultWalkRadiusM = 300.0

// WalkEdgeCost is the cost assigned to walking transfer edges. It is higher
// than the default route edge cost (1.0) to discourage unnecessary walking.
const WalkEdgeCost = 5.0

// TransferLeg represents one leg of a multi-transfer route.
type TransferLeg struct {
	RouteID      string
	BoardStopID  string
	AlightStopID string
	IsWalking    bool
}

// TransferResult represents a complete route with zero or more transfers,
// found via pgRouting's shortest path algorithm.
type TransferResult struct {
	Legs []TransferLeg
}

// BuildTransitGraph populates the transit_node_map and transit_edges tables
// from bus_stops and route_stops data for use with pgRouting. It creates
// route edges between consecutive stops on each route, and walking edges
// between nearby stops (within DefaultWalkRadiusM) to enable walking transfers.
func (idx *StopIndex) BuildTransitGraph() error {
	if idx.db == nil {
		return nil
	}
	log.Println("Building transit graph for pgRouting...")

	if _, err := idx.db.Exec("TRUNCATE transit_edges, transit_node_map RESTART IDENTITY"); err != nil {
		return fmt.Errorf("truncate transit tables: %w", err)
	}

	result, err := idx.db.Exec(`
		INSERT INTO transit_node_map (stop_id)
		SELECT DISTINCT stop_id FROM bus_stops
	`)
	if err != nil {
		return fmt.Errorf("populate node map: %w", err)
	}
	nodeCount, _ := result.RowsAffected()

	result, err = idx.db.Exec(`
		WITH ordered_stops AS (
			SELECT route_id, stop_id, stop_seq,
			       LEAD(stop_id) OVER (PARTITION BY route_id ORDER BY stop_seq) AS next_stop_id
			FROM route_stops
		)
		INSERT INTO transit_edges (source, target, cost, route_id)
		SELECT nm1.node_id, nm2.node_id, 1.0, os.route_id
		FROM ordered_stops os
		JOIN transit_node_map nm1 ON nm1.stop_id = os.stop_id
		JOIN transit_node_map nm2 ON nm2.stop_id = os.next_stop_id
		WHERE os.next_stop_id IS NOT NULL
	`)
	if err != nil {
		return fmt.Errorf("populate route edges: %w", err)
	}
	routeEdgeCount, _ := result.RowsAffected()

	// Add walking edges between nearby stops (within DefaultWalkRadiusM)
	// so pgr_dijkstra can find transfers that require walking.
	// Note: WalkEdgeCost, WalkRouteID, and DefaultWalkRadiusM are compile-time
	// constants, so direct formatting is safe from SQL injection.
	// The query uses s1.stop_id < s2.stop_id to avoid duplicate pairs, then
	// inserts both directions explicitly for bidirectional walking.
	result, err = idx.db.Exec(fmt.Sprintf(`
		WITH walk_pairs AS (
			SELECT nm1.node_id AS n1, nm2.node_id AS n2
			FROM bus_stops s1
			JOIN bus_stops s2 ON s1.stop_id < s2.stop_id
			    AND ST_DWithin(s1.geom, s2.geom, %f)
			JOIN transit_node_map nm1 ON nm1.stop_id = s1.stop_id
			JOIN transit_node_map nm2 ON nm2.stop_id = s2.stop_id
		)
		INSERT INTO transit_edges (source, target, cost, route_id)
		SELECT n1, n2, %f, '%s' FROM walk_pairs
		UNION ALL
		SELECT n2, n1, %f, '%s' FROM walk_pairs
	`, DefaultWalkRadiusM, WalkEdgeCost, WalkRouteID, WalkEdgeCost, WalkRouteID))
	if err != nil {
		return fmt.Errorf("populate walking edges: %w", err)
	}
	walkEdgeCount, _ := result.RowsAffected()

	log.Printf("Transit graph built: %d nodes, %d route edges, %d walking edges",
		nodeCount, routeEdgeCount, walkEdgeCount)
	return nil
}

// FindTransferRoutes uses pgRouting's pgr_dijkstra to find routes between
// origin and destination stops that may require multiple transfers.
func (idx *StopIndex) FindTransferRoutes(originStopIDs, destStopIDs []string, maxTransfers, maxResults int) ([]TransferResult, error) {
	if idx.db == nil || len(originStopIDs) == 0 || len(destStopIDs) == 0 {
		return nil, nil
	}
	if maxResults <= 0 {
		maxResults = 20
	}
	if maxTransfers < 0 {
		maxTransfers = 2
	}

	originNodeIDs, err := idx.getNodeIDs(originStopIDs)
	if err != nil {
		return nil, fmt.Errorf("get origin node IDs: %w", err)
	}
	destNodeIDs, err := idx.getNodeIDs(destStopIDs)
	if err != nil {
		return nil, fmt.Errorf("get dest node IDs: %w", err)
	}

	if len(originNodeIDs) == 0 || len(destNodeIDs) == 0 {
		return nil, nil
	}

	query := fmt.Sprintf(`
		SELECT p.path_seq, p.start_vid, p.end_vid, p.node, p.edge, p.agg_cost,
		       COALESCE(nm.stop_id, '') AS stop_id,
		       COALESCE(te.route_id, '') AS route_id
		FROM pgr_dijkstra(
			'SELECT id, source, target, cost FROM transit_edges',
			ARRAY[%s]::BIGINT[],
			ARRAY[%s]::BIGINT[],
			directed => true
		) p
		LEFT JOIN transit_edges te ON te.id = p.edge
		LEFT JOIN transit_node_map nm ON nm.node_id = p.node
		ORDER BY p.start_vid, p.end_vid, p.path_seq
	`, int64ArrayStr(originNodeIDs), int64ArrayStr(destNodeIDs))

	rows, err := idx.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("pgr_dijkstra query: %w", err)
	}
	defer rows.Close()

	type pathKey struct {
		startVid int64
		endVid   int64
	}
	pathMap := make(map[pathKey][]pathStep)
	var pathOrder []pathKey

	for rows.Next() {
		var s pathStep
		if err := rows.Scan(&s.pathSeq, &s.startVid, &s.endVid, &s.node, &s.edge, &s.aggCost, &s.stopID, &s.routeID); err != nil {
			return nil, fmt.Errorf("scan path step: %w", err)
		}
		key := pathKey{s.startVid, s.endVid}
		if _, exists := pathMap[key]; !exists {
			pathOrder = append(pathOrder, key)
		}
		pathMap[key] = append(pathMap[key], s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate path rows: %w", err)
	}

	var results []TransferResult
	seen := make(map[string]struct{})

	for _, key := range pathOrder {
		steps := pathMap[key]
		legs := decomposePath(steps)

		if len(legs) == 0 {
			continue
		}

		numTransfers := countBusTransfers(legs)
		if numTransfers > maxTransfers {
			continue
		}

		sig := legSignature(legs)
		if _, ok := seen[sig]; ok {
			continue
		}
		seen[sig] = struct{}{}

		results = append(results, TransferResult{Legs: legs})

		if len(results) >= maxResults {
			break
		}
	}

	return results, nil
}

// countBusTransfers counts the number of bus-to-bus transitions in a sequence
// of legs, ignoring walking legs. For example, bus→walk→bus→walk→bus has 2 bus
// transfers, not 4.
func countBusTransfers(legs []TransferLeg) int {
	transfers := 0
	prevWasBus := false
	for _, leg := range legs {
		if !leg.IsWalking {
			if prevWasBus {
				transfers++
			}
			prevWasBus = true
		}
	}
	return transfers
}

// pathStep holds one row from the pgr_dijkstra result.
type pathStep struct {
	pathSeq  int
	startVid int64
	endVid   int64
	node     int64
	edge     int64
	aggCost  float64
	stopID   string
	routeID  string
}

// decomposePath converts a sequence of pgr_dijkstra path steps into transfer
// legs. Each leg is a consecutive run of edges on the same route. Walking
// edges (route_id == WalkRouteID) produce legs with IsWalking = true.
func decomposePath(steps []pathStep) []TransferLeg {
	if len(steps) < 2 {
		return nil
	}

	var legs []TransferLeg
	var currentRouteID string
	var boardStopID string
	var currentIsWalking bool

	for _, step := range steps {
		isWalk := step.routeID == WalkRouteID

		if step.edge < 0 {
			// Last step – close current leg
			if currentRouteID != "" {
				legs = append(legs, TransferLeg{
					RouteID:      currentRouteID,
					BoardStopID:  boardStopID,
					AlightStopID: step.stopID,
					IsWalking:    currentIsWalking,
				})
			}
			continue
		}

		if currentRouteID == "" {
			// First edge – start first leg
			currentRouteID = step.routeID
			boardStopID = step.stopID
			currentIsWalking = isWalk
		} else if step.routeID != currentRouteID {
			// Route changed – transfer (or start/end walking)
			legs = append(legs, TransferLeg{
				RouteID:      currentRouteID,
				BoardStopID:  boardStopID,
				AlightStopID: step.stopID,
				IsWalking:    currentIsWalking,
			})
			currentRouteID = step.routeID
			boardStopID = step.stopID
			currentIsWalking = isWalk
		}
	}

	return legs
}

// getNodeIDs maps stop IDs to transit_node_map integer node IDs.
func (idx *StopIndex) getNodeIDs(stopIDs []string) ([]int64, error) {
	if len(stopIDs) == 0 {
		return nil, nil
	}
	ph := placeholders(1, len(stopIDs))
	query := fmt.Sprintf("SELECT node_id FROM transit_node_map WHERE stop_id IN (%s)", ph)
	args := make([]interface{}, len(stopIDs))
	for i, id := range stopIDs {
		args[i] = id
	}
	rows, err := idx.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodeIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		nodeIDs = append(nodeIDs, id)
	}
	return nodeIDs, rows.Err()
}

// legSignature produces a deterministic string key for deduplication.
func legSignature(legs []TransferLeg) string {
	parts := make([]string, len(legs))
	for i, l := range legs {
		parts[i] = l.RouteID + ":" + l.BoardStopID + "->" + l.AlightStopID
	}
	return strings.Join(parts, "|")
}

// int64ArrayStr formats a slice of int64 as a comma-separated string for SQL.
func int64ArrayStr(ids []int64) string {
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = fmt.Sprintf("%d", id)
	}
	return strings.Join(parts, ", ")
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
