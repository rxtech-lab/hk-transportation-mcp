package busapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

const (
	gmbBaseURL          = "https://data.etagmb.gov.hk"
	opGMB               = "GMB"
	gmbFailedStopsKey   = "gmb:failed_stop_ids"
)

// GMB regions
var gmbRegions = []string{"HKI", "KLN", "NT"}

// gmbDestInfo stores destination info for a GMB route direction.
type gmbDestInfo struct {
	DestEn string
	DestTc string
	DestSc string
}

// GMBClient implements BusAPIClient for Hong Kong Green Minibuses (GMB).
type GMBClient struct {
	http  *http.Client
	redis *redis.Client // optional, for persisting failed stop IDs across runs
	mu    sync.RWMutex
	// routeIDMap maps "region:routeCode:bound:serviceType" → GMB numeric route_id.
	routeIDMap map[string]int64
	// routeCodeToIDs maps route code → slice of GMB numeric route_ids.
	routeCodeToIDs map[string][]int64
	// routeDestMap maps "gmbRouteID:routeSeq" → destination info.
	routeDestMap map[string]gmbDestInfo
	// cachedStopNames caches stop ID → names from FetchRouteStops calls.
	cachedStopNames map[string][2]string // stopID → [nameEn, nameTc]
}

// NewGMBClient creates a new GMB API client.
// An optional Redis client can be passed for persisting failed stop IDs across runs.
func NewGMBClient(c *http.Client, rdb ...*redis.Client) *GMBClient {
	g := &GMBClient{
		http:            c,
		routeIDMap:      make(map[string]int64),
		routeCodeToIDs:  make(map[string][]int64),
		routeDestMap:    make(map[string]gmbDestInfo),
		cachedStopNames: make(map[string][2]string),
	}
	if len(rdb) > 0 && rdb[0] != nil {
		g.redis = rdb[0]
	}
	return g
}

func (g *GMBClient) Operator() string { return opGMB }

// --- GMB API response types ---

type gmbResponse[T any] struct {
	Type      string `json:"type"`
	Version   string `json:"version"`
	Data      T      `json:"data"`
	Generated string `json:"generated_timestamp"`
}

type gmbRegionRoutes struct {
	Routes []string `json:"routes"`
}

type gmbRouteInfo struct {
	RouteID       int64              `json:"route_id"`
	DescriptionTc string             `json:"description_tc"`
	DescriptionSc string             `json:"description_sc"`
	DescriptionEn string             `json:"description_en"`
	Directions    []gmbRouteDirection `json:"directions"`
}

type gmbRouteDirection struct {
	RouteSeq int              `json:"route_seq"`
	OrigTc   string           `json:"orig_tc"`
	OrigEn   string           `json:"orig_en"`
	OrigSc   string           `json:"orig_sc"`
	DestTc   string           `json:"dest_tc"`
	DestEn   string           `json:"dest_en"`
	DestSc   string           `json:"dest_sc"`
	Headways []gmbHeadway     `json:"headways"`
}

type gmbHeadway struct {
	Weekdays  []bool  `json:"weekdays"`
	StartTime string  `json:"start_time"`
	EndTime   string  `json:"end_time"`
	Frequency *int    `json:"frequency"`
}

type gmbRouteStopData struct {
	RouteStops []gmbRouteStop `json:"route_stops"`
}

type gmbRouteStop struct {
	StopID  int64  `json:"stop_id"`
	StopSeq int    `json:"stop_seq"`
	NameTc  string `json:"name_tc"`
	NameSc  string `json:"name_sc"`
	NameEn  string `json:"name_en"`
}

type gmbStopData struct {
	Coordinates gmbCoordinates `json:"coordinates"`
}

type gmbCoordinates struct {
	WGS84 gmbWGS84 `json:"wgs84"`
}

type gmbWGS84 struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type gmbETARouteStop struct {
	RouteSeq int      `json:"route_seq"`
	StopSeq  int      `json:"stop_seq"`
	ETAs     []gmbETA `json:"eta"`
}

type gmbETA struct {
	Timestamp string `json:"timestamp"`
	RemarksTc string `json:"remarks_tc"`
	RemarksSc string `json:"remarks_sc"`
	RemarksEn string `json:"remarks_en"`
}

// --- BusAPIClient interface implementation ---

func (g *GMBClient) FetchAllRoutes(ctx context.Context) ([]models.Route, error) {
	g.mu.Lock()
	g.routeIDMap = make(map[string]int64)
	g.routeCodeToIDs = make(map[string][]int64)
	g.routeDestMap = make(map[string]gmbDestInfo)
	g.mu.Unlock()

	var allRoutes []models.Route

	for _, region := range gmbRegions {
		// Fetch route codes for this region
		var regionResp gmbResponse[gmbRegionRoutes]
		if err := g.get(ctx, fmt.Sprintf("%s/route/%s", gmbBaseURL, region), &regionResp); err != nil {
			log.Printf("gmb: fetch routes for region %s: %v", region, err)
			continue
		}

		log.Printf("gmb: region %s has %d routes", region, len(regionResp.Data.Routes))

		// Fetch details for each route code
		for _, routeCode := range regionResp.Data.Routes {
			var routeResp gmbResponse[[]gmbRouteInfo]
			if err := g.get(ctx, fmt.Sprintf("%s/route/%s/%s", gmbBaseURL, region, routeCode), &routeResp); err != nil {
				log.Printf("gmb: fetch route %s/%s: %v", region, routeCode, err)
				continue
			}

			// Service type 1 is reserved for normal service ("正常班次").
			// Non-normal variants are numbered starting at 2.
			nextNonNormalSvcType := 2
			for _, routeInfo := range routeResp.Data {
				svcType := "1"
				if routeInfo.DescriptionTc != "" && routeInfo.DescriptionTc != "正常班次" {
					svcType = strconv.Itoa(nextNonNormalSvcType)
					nextNonNormalSvcType++
				}

				for _, dir := range routeInfo.Directions {
					bound := gmbBound(dir.RouteSeq)

					route := models.Route{
						RouteID:      fmt.Sprintf("GMB-%s-%s-%s-%s", region, routeCode, bound, svcType),
						Route:        routeCode,
						Bound:        bound,
						ServiceType:  svcType,
						OrigEn:       dir.OrigEn,
						DestEn:       dir.DestEn,
						DestTc:       dir.DestTc,
						DestSc:       dir.DestSc,
						Operator:     opGMB,
						GmbNumericID: routeInfo.RouteID,
					}
					allRoutes = append(allRoutes, route)

					// Store mapping for later use by FetchRouteStops and FetchETA
					// Key includes region to avoid collisions between same route code in different regions.
					key := region + ":" + routeCode + ":" + bound + ":" + svcType
					destKey := fmt.Sprintf("%d:%d", routeInfo.RouteID, dir.RouteSeq)
					g.mu.Lock()
					g.routeIDMap[key] = routeInfo.RouteID
					g.routeCodeToIDs[routeCode] = appendUnique(g.routeCodeToIDs[routeCode], routeInfo.RouteID)
					g.routeDestMap[destKey] = gmbDestInfo{
						DestEn: dir.DestEn,
						DestTc: dir.DestTc,
						DestSc: dir.DestSc,
					}
					g.mu.Unlock()
				}
			}
		}
	}

	log.Printf("gmb: fetched %d routes total across all regions", len(allRoutes))
	return allRoutes, nil
}

// LoadRouteMappings populates the in-memory route ID and destination maps
// from the database, so FetchETA does not need to call FetchAllRoutes.
func (g *GMBClient) LoadRouteMappings(db *sql.DB) error {
	rows, err := db.Query(
		`SELECT route_id, route, bound, service_type, dest_en, dest_tc, dest_sc, gmb_numeric_id
		 FROM routes WHERE operator = $1 AND gmb_numeric_id > 0`, opGMB)
	if err != nil {
		return fmt.Errorf("gmb: query route mappings: %w", err)
	}
	defer rows.Close()

	g.mu.Lock()
	defer g.mu.Unlock()

	count := 0
	for rows.Next() {
		var routeID, route, bound, svcType, destEn, destTc, destSc string
		var numericID int64
		if err := rows.Scan(&routeID, &route, &bound, &svcType, &destEn, &destTc, &destSc, &numericID); err != nil {
			return fmt.Errorf("gmb: scan route mapping: %w", err)
		}

		// Extract region from routeID (format: GMB-{region}-{route}-{bound}-{svcType})
		parts := strings.SplitN(routeID, "-", 3)
		if len(parts) < 3 {
			continue
		}
		region := parts[1]

		key := region + ":" + route + ":" + bound + ":" + svcType
		g.routeIDMap[key] = numericID
		g.routeCodeToIDs[route] = appendUnique(g.routeCodeToIDs[route], numericID)

		// Determine route_seq from bound
		routeSeq := gmbRouteSeq(bound)
		destKey := fmt.Sprintf("%d:%d", numericID, routeSeq)
		g.routeDestMap[destKey] = gmbDestInfo{
			DestEn: destEn,
			DestTc: destTc,
			DestSc: destSc,
		}
		count++
	}

	log.Printf("gmb: loaded %d route mappings from database", count)
	return rows.Err()
}

func (g *GMBClient) FetchAllStops(ctx context.Context) ([]models.BusStop, error) {
	// GMB has no bulk stop endpoint. Collect unique stop IDs from
	// cachedStopIDs (populated by prior FetchRouteStops calls) or by
	// fetching route-stops from the API.

	type stopInfo struct {
		nameEn string
		nameTc string
	}
	stopMap := make(map[string]*stopInfo)

	g.mu.RLock()
	hasCached := len(g.cachedStopNames) > 0
	g.mu.RUnlock()

	if hasCached {
		// Use cached stop IDs from prior FetchRouteStops calls.
		g.mu.RLock()
		for sid, names := range g.cachedStopNames {
			stopMap[sid] = &stopInfo{nameEn: names[0], nameTc: names[1]}
		}
		g.mu.RUnlock()
		log.Printf("gmb: reusing %d cached stop IDs from FetchRouteStops", len(stopMap))
	} else {
		// Fallback: fetch routes and route-stops from API.
		routes, err := g.FetchAllRoutes(ctx)
		if err != nil {
			return nil, fmt.Errorf("gmb: fetch routes for stops: %w", err)
		}

		g.mu.RLock()
		routeIDMapCopy := make(map[string]int64, len(g.routeIDMap))
		for k, v := range g.routeIDMap {
			routeIDMapCopy[k] = v
		}
		g.mu.RUnlock()

		log.Printf("gmb: fetching route-stops for %d routes...", len(routes))
		for i, r := range routes {
			if (i+1)%50 == 0 || i+1 == len(routes) {
				log.Printf("gmb: route-stops progress %d/%d", i+1, len(routes))
			}
			var gmbRouteID int64
			var ok bool
			for _, reg := range gmbRegions {
				key := reg + ":" + r.Route + ":" + r.Bound + ":" + r.ServiceType
				gmbRouteID, ok = routeIDMapCopy[key]
				if ok {
					break
				}
			}
			if !ok {
				continue
			}
			routeSeq := gmbRouteSeq(r.Bound)
			url := fmt.Sprintf("%s/route-stop/%d/%d", gmbBaseURL, gmbRouteID, routeSeq)
			var resp gmbResponse[gmbRouteStopData]
			if err := g.get(ctx, url, &resp); err != nil {
				continue
			}
			for _, rs := range resp.Data.RouteStops {
				sid := strconv.FormatInt(rs.StopID, 10)
				if _, exists := stopMap[sid]; !exists {
					stopMap[sid] = &stopInfo{nameEn: rs.NameEn, nameTc: rs.NameTc}
				}
			}
			if i < len(routes)-1 {
				time.Sleep(1 * time.Second)
			}
		}
	}

	// Load previously failed stop IDs from Redis and prioritize them.
	var retryIDs []string
	if g.redis != nil {
		members, err := g.redis.SMembers(ctx, gmbFailedStopsKey).Result()
		if err == nil && len(members) > 0 {
			log.Printf("gmb: %d previously failed stops to retry first", len(members))
			for _, sid := range members {
				if _, exists := stopMap[sid]; !exists {
					// Add to stopMap with empty names (coordinates are what we need).
					stopMap[sid] = &stopInfo{}
				}
				retryIDs = append(retryIDs, sid)
			}
		}
		// Clear the set; we'll re-add any that fail again.
		g.redis.Del(ctx, gmbFailedStopsKey)
	}

	// Build ordered list: retry IDs first, then remaining stops.
	retrySet := make(map[string]struct{}, len(retryIDs))
	orderedIDs := make([]string, 0, len(stopMap))
	for _, sid := range retryIDs {
		retrySet[sid] = struct{}{}
		orderedIDs = append(orderedIDs, sid)
	}
	for sid := range stopMap {
		if _, isRetry := retrySet[sid]; !isRetry {
			orderedIDs = append(orderedIDs, sid)
		}
	}

	log.Printf("gmb: fetching %d individual stops for coordinates (%d retries)...", len(orderedIDs), len(retryIDs))

	var stops []models.BusStop
	var failedIDs []string
	stopCount := 0
	totalStops := len(orderedIDs)
	for _, sid := range orderedIDs {
		info := stopMap[sid]
		stopIDInt, err := strconv.ParseInt(sid, 10, 64)
		if err != nil {
			continue
		}

		// Retry with backoff on 403 (rate limiting).
		var resp gmbResponse[gmbStopData]
		url := fmt.Sprintf("%s/stop/%d", gmbBaseURL, stopIDInt)
		fetched := false
		for attempt := 0; attempt < 3; attempt++ {
			if err := g.get(ctx, url, &resp); err != nil {
				if attempt < 2 {
					backoff := time.Duration(5*(attempt+1)) * time.Second
					log.Printf("gmb: fetch stop %s: %v (retrying in %v)", sid, err, backoff)
					time.Sleep(backoff)
					continue
				}
				log.Printf("gmb: fetch stop %s: %v (giving up)", sid, err)
			} else {
				fetched = true
			}
			break
		}
		if !fetched {
			failedIDs = append(failedIDs, sid)
			continue
		}

		stops = append(stops, models.BusStop{
			StopID:   sid,
			NameEn:   info.nameEn,
			NameTc:   info.nameTc,
			NameSc:   "",
			Lat:      resp.Data.Coordinates.WGS84.Latitude,
			Lon:      resp.Data.Coordinates.WGS84.Longitude,
			Operator: opGMB,
		})
		stopCount++
		if stopCount%50 == 0 || stopCount == totalStops {
			log.Printf("gmb: stop coordinates progress %d/%d", stopCount, totalStops)
		}
		if stopCount < totalStops {
			time.Sleep(1 * time.Second)
		}
	}

	// Persist failed stop IDs to Redis for the next run.
	if g.redis != nil && len(failedIDs) > 0 {
		members := make([]interface{}, len(failedIDs))
		for i, id := range failedIDs {
			members[i] = id
		}
		if err := g.redis.SAdd(ctx, gmbFailedStopsKey, members...).Err(); err != nil {
			log.Printf("gmb: failed to save %d failed stop IDs to Redis: %v", len(failedIDs), err)
		} else {
			log.Printf("gmb: saved %d failed stop IDs to Redis for next run", len(failedIDs))
		}
	}

	log.Printf("gmb: fetched %d stops (%d failed)", len(stops), len(failedIDs))
	return stops, nil
}

func (g *GMBClient) FetchRouteStops(ctx context.Context, route, bound, serviceType string) ([]models.RouteStop, error) {
	// Try all regions to find the matching key (key includes region prefix).
	g.mu.RLock()
	var gmbRouteID int64
	var region string
	for _, r := range gmbRegions {
		key := r + ":" + route + ":" + bound + ":" + serviceType
		if id, ok := g.routeIDMap[key]; ok {
			gmbRouteID = id
			region = r
			break
		}
	}
	g.mu.RUnlock()

	if region == "" {
		return nil, fmt.Errorf("gmb: unknown route key %q (call FetchAllRoutes first)", route+":"+bound+":"+serviceType)
	}

	routeSeq := gmbRouteSeq(bound)
	url := fmt.Sprintf("%s/route-stop/%d/%d", gmbBaseURL, gmbRouteID, routeSeq)
	var resp gmbResponse[gmbRouteStopData]
	if err := g.get(ctx, url, &resp); err != nil {
		return nil, err
	}

	routeID := fmt.Sprintf("GMB-%s-%s-%s-%s", region, route, bound, serviceType)
	stops := make([]models.RouteStop, 0, len(resp.Data.RouteStops))
	g.mu.Lock()
	for _, rs := range resp.Data.RouteStops {
		sid := strconv.FormatInt(rs.StopID, 10)
		stops = append(stops, models.RouteStop{
			RouteID:  routeID,
			StopID:   sid,
			StopSeq:  rs.StopSeq,
			Operator: opGMB,
		})
		// Cache stop ID and name for FetchAllStops to reuse.
		if _, exists := g.cachedStopNames[sid]; !exists {
			g.cachedStopNames[sid] = [2]string{rs.NameEn, rs.NameTc}
		}
	}
	g.mu.Unlock()
	return stops, nil
}

func (g *GMBClient) FetchETA(ctx context.Context, stopID, route string) ([]models.ETAArrival, error) {
	// Look up all GMB route_ids for this route code.
	// These must be pre-loaded via LoadRouteMappings (from DB) or FetchAllRoutes (sync).
	g.mu.RLock()
	gmbRouteIDs := g.routeCodeToIDs[route]
	g.mu.RUnlock()

	if len(gmbRouteIDs) == 0 {
		return []models.ETAArrival{}, nil
	}

	var allArrivals []models.ETAArrival

	for _, gmbRouteID := range gmbRouteIDs {
		url := fmt.Sprintf("%s/eta/route-stop/%d/%s", gmbBaseURL, gmbRouteID, stopID)
		var resp gmbResponse[[]gmbETARouteStop]
		if err := g.get(ctx, url, &resp); err != nil {
			log.Printf("gmb: fetch ETA route_id=%d stop=%s: %v", gmbRouteID, stopID, err)
			continue
		}

		for _, etaRS := range resp.Data {
			dir := gmbBound(etaRS.RouteSeq)

			// Look up destination info from stored route directions
			destKey := fmt.Sprintf("%d:%d", gmbRouteID, etaRS.RouteSeq)
			g.mu.RLock()
			dest := g.routeDestMap[destKey]
			g.mu.RUnlock()

			for _, eta := range etaRS.ETAs {
				var etaTime *time.Time
				if eta.Timestamp != "" {
					t, err := time.Parse(time.RFC3339, eta.Timestamp)
					if err == nil {
						etaTime = &t
					}
				}
				allArrivals = append(allArrivals, models.ETAArrival{
					Route:       route,
					Direction:   dir,
					Destination: dest.DestEn,
					DestTc:      dest.DestTc,
					DestSc:      dest.DestSc,
					StopID:      stopID,
					StopSeq:     etaRS.StopSeq,
					ETA:         etaTime,
					Operator:    opGMB,
					Remark:      eta.RemarksEn,
				})
			}
		}
	}

	return allArrivals, nil
}

// --- Helper functions ---

// gmbBound converts GMB route_seq to standard bound code.
func gmbBound(routeSeq int) string {
	if routeSeq == 2 {
		return "I"
	}
	return "O"
}

// gmbRouteSeq converts standard bound code to GMB route_seq.
func gmbRouteSeq(bound string) int {
	if bound == "I" {
		return 2
	}
	return 1
}

// appendUnique appends value to slice only if not already present.
func appendUnique(slice []int64, val int64) []int64 {
	for _, v := range slice {
		if v == val {
			return slice
		}
	}
	return append(slice, val)
}

func (g *GMBClient) get(ctx context.Context, url string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("gmb: create request: %w", err)
	}
	resp, err := g.http.Do(req)
	if err != nil {
		return fmt.Errorf("gmb: request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gmb: unexpected status %d for %s", resp.StatusCode, url)
	}
	return json.NewDecoder(resp.Body).Decode(dest)
}
