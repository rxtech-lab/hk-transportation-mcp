package busapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

const (
	gmbBaseURL = "https://data.etagmb.gov.hk"
	opGMB      = "GMB"
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
	http *http.Client
	mu   sync.RWMutex
	// routeIDMap maps "routeCode:bound:serviceType" → GMB numeric route_id.
	// Populated during FetchAllRoutes and used by FetchRouteStops.
	routeIDMap map[string]int64
	// routeCodeToIDs maps route code → slice of GMB numeric route_ids.
	// Used by FetchETA to look up the route_id from a route code.
	routeCodeToIDs map[string][]int64
	// routeDestMap maps "gmbRouteID:routeSeq" → destination info.
	// Populated during FetchAllRoutes and used by FetchETA.
	routeDestMap map[string]gmbDestInfo
}

// NewGMBClient creates a new GMB API client.
func NewGMBClient(c *http.Client) *GMBClient {
	return &GMBClient{
		http:           c,
		routeIDMap:     make(map[string]int64),
		routeCodeToIDs: make(map[string][]int64),
		routeDestMap:   make(map[string]gmbDestInfo),
	}
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
						RouteID:     fmt.Sprintf("GMB-%s-%s-%s", routeCode, bound, svcType),
						Route:       routeCode,
						Bound:       bound,
						ServiceType: svcType,
						OrigEn:      dir.OrigEn,
						DestEn:      dir.DestEn,
						Operator:    opGMB,
					}
					allRoutes = append(allRoutes, route)

					// Store mapping for later use by FetchRouteStops and FetchETA
					key := routeCode + ":" + bound + ":" + svcType
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

func (g *GMBClient) FetchAllStops(ctx context.Context) ([]models.BusStop, error) {
	// GMB has no bulk stop endpoint. Collect unique stop IDs from all
	// route-stops and fetch each stop individually for coordinates.
	routes, err := g.FetchAllRoutes(ctx)
	if err != nil {
		return nil, fmt.Errorf("gmb: fetch routes for stops: %w", err)
	}

	// stopInfo collects name and coordinate data per stop.
	type stopInfo struct {
		nameEn string
		nameTc string
	}
	stopMap := make(map[string]*stopInfo) // stopID → info

	// Fetch route-stop details for each route to get stop IDs and names.
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
		key := r.Route + ":" + r.Bound + ":" + r.ServiceType
		gmbRouteID, ok := routeIDMapCopy[key]
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

	log.Printf("gmb: fetching %d individual stops for coordinates...", len(stopMap))

	var stops []models.BusStop
	stopCount := 0
	totalStops := len(stopMap)
	for sid, info := range stopMap {
		stopIDInt, err := strconv.ParseInt(sid, 10, 64)
		if err != nil {
			continue
		}
		var resp gmbResponse[gmbStopData]
		if err := g.get(ctx, fmt.Sprintf("%s/stop/%d", gmbBaseURL, stopIDInt), &resp); err != nil {
			log.Printf("gmb: fetch stop %s: %v", sid, err)
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

	log.Printf("gmb: fetched %d stops", len(stops))
	return stops, nil
}

func (g *GMBClient) FetchRouteStops(ctx context.Context, route, bound, serviceType string) ([]models.RouteStop, error) {
	key := route + ":" + bound + ":" + serviceType
	g.mu.RLock()
	gmbRouteID, ok := g.routeIDMap[key]
	g.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("gmb: unknown route key %q (call FetchAllRoutes first)", key)
	}

	routeSeq := gmbRouteSeq(bound)
	url := fmt.Sprintf("%s/route-stop/%d/%d", gmbBaseURL, gmbRouteID, routeSeq)
	var resp gmbResponse[gmbRouteStopData]
	if err := g.get(ctx, url, &resp); err != nil {
		return nil, err
	}

	routeID := fmt.Sprintf("GMB-%s-%s-%s", route, bound, serviceType)
	stops := make([]models.RouteStop, 0, len(resp.Data.RouteStops))
	for _, rs := range resp.Data.RouteStops {
		stops = append(stops, models.RouteStop{
			RouteID:  routeID,
			StopID:   strconv.FormatInt(rs.StopID, 10),
			StopSeq:  rs.StopSeq,
			Operator: opGMB,
		})
	}
	return stops, nil
}

func (g *GMBClient) FetchETA(ctx context.Context, stopID, route string) ([]models.ETAArrival, error) {
	// Look up all GMB route_ids for this route code
	g.mu.RLock()
	gmbRouteIDs := g.routeCodeToIDs[route]
	g.mu.RUnlock()

	// Lazily populate route mappings if not yet loaded (e.g. fresh server start).
	if len(gmbRouteIDs) == 0 {
		if _, err := g.FetchAllRoutes(ctx); err != nil {
			return nil, fmt.Errorf("gmb: failed to populate routes for ETA: %w", err)
		}
		g.mu.RLock()
		gmbRouteIDs = g.routeCodeToIDs[route]
		g.mu.RUnlock()
	}

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
