package busapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

const (
	citybusBaseURL = "https://rt.data.gov.hk/v2/transport/citybus"
	opCitybus      = "CTB"
)

// CitybusClient implements BusAPIClient for Citybus.
type CitybusClient struct {
	http *http.Client
}

// NewCitybusClient creates a new Citybus API client.
func NewCitybusClient(c *http.Client) *CitybusClient {
	return &CitybusClient{http: c}
}

func (c *CitybusClient) Operator() string { return opCitybus }

type citybusResponse[T any] struct {
	Type      string `json:"type"`
	Version   string `json:"version"`
	Data      T      `json:"data"`
	Generated string `json:"generated_timestamp"`
}

type citybusStop struct {
	Stop   string `json:"stop"`
	NameEn string `json:"name_en"`
	NameTc string `json:"name_tc"`
	NameSc string `json:"name_sc"`
	Lat    string `json:"lat"`
	Long   string `json:"long"`
}

type citybusRoute struct {
	Route  string `json:"route"`
	OrigEn string `json:"orig_en"`
	DestEn string `json:"dest_en"`
}

type citybusRouteStop struct {
	Route string `json:"route"`
	Dir   string `json:"dir"`
	Seq   int    `json:"seq"`
	Stop  string `json:"stop"`
}

type citybusETA struct {
	Route         string  `json:"route"`
	Dir           string  `json:"dir"`
	Seq           int     `json:"seq"`
	DestEn        string  `json:"dest_en"`
	ETA           *string `json:"eta"`
	RmkEn         string  `json:"rmk_en"`
	DataTimestamp string  `json:"data_timestamp"`
}

func (c *CitybusClient) FetchAllStops(ctx context.Context) ([]models.BusStop, error) {
	// Citybus has no bulk stop endpoint, so we collect unique stop IDs from all
	// route-stops and fetch each stop individually.
	routes, err := c.FetchAllRoutes(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetch routes for stops: %w", err)
	}

	stopIDSet := make(map[string]struct{})
	for _, r := range routes {
		rs, err := c.FetchRouteStops(ctx, r.Route, r.Bound, r.ServiceType)
		if err != nil {
			continue
		}
		for _, s := range rs {
			stopIDSet[s.StopID] = struct{}{}
		}
	}

	log.Printf("CTB: fetching %d individual stops...", len(stopIDSet))
	var stops []models.BusStop
	for sid := range stopIDSet {
		log.Printf("CTB: fetching stop %s...", sid)
		stop, err := c.FetchStopByID(ctx, sid)
		if err != nil {
			continue
		}
		stops = append(stops, *stop)
	}
	log.Printf("CTB: fetched %d stops", len(stops))
	return stops, nil
}

func (c *CitybusClient) FetchAllRoutes(ctx context.Context) ([]models.Route, error) {
	var resp citybusResponse[[]citybusRoute]
	if err := c.get(ctx, citybusBaseURL+"/route/ctb", &resp); err != nil {
		return nil, err
	}

	routes := make([]models.Route, 0, len(resp.Data)*2)
	for _, r := range resp.Data {
		// Citybus routes have inbound/outbound
		for _, bound := range []string{"I", "O"} {
			routes = append(routes, models.Route{
				RouteID:     fmt.Sprintf("CTB-%s-%s", r.Route, bound),
				Route:       r.Route,
				Bound:       bound,
				ServiceType: "1",
				OrigEn:      r.OrigEn,
				DestEn:      r.DestEn,
				Operator:    opCitybus,
			})
		}
	}
	return routes, nil
}

func (c *CitybusClient) FetchRouteStops(ctx context.Context, route, bound, serviceType string) ([]models.RouteStop, error) {
	log.Printf("CTB: fetching route-stops for route %s bound %s...", route, bound)
	dir := citybusDirection(bound)
	url := fmt.Sprintf("%s/route-stop/ctb/%s/%s", citybusBaseURL, route, dir)
	var resp citybusResponse[[]citybusRouteStop]
	if err := c.get(ctx, url, &resp); err != nil {
		return nil, err
	}

	stops := make([]models.RouteStop, 0, len(resp.Data))
	for _, rs := range resp.Data {
		stops = append(stops, models.RouteStop{
			RouteID:  fmt.Sprintf("CTB-%s-%s", rs.Route, bound),
			StopID:   rs.Stop,
			StopSeq:  rs.Seq,
			Operator: opCitybus,
		})
	}
	return stops, nil
}

func (c *CitybusClient) FetchETA(ctx context.Context, stopID, route string) ([]models.ETAArrival, error) {
	url := fmt.Sprintf("%s/eta/ctb/%s/%s", citybusBaseURL, stopID, route)
	var resp citybusResponse[[]citybusETA]
	if err := c.get(ctx, url, &resp); err != nil {
		return nil, err
	}

	arrivals := make([]models.ETAArrival, 0, len(resp.Data))
	for _, e := range resp.Data {
		var eta *time.Time
		if e.ETA != nil && *e.ETA != "" {
			t, err := time.Parse(time.RFC3339, *e.ETA)
			if err == nil {
				eta = &t
			}
		}
		arrivals = append(arrivals, models.ETAArrival{
			Route:       e.Route,
			Direction:   e.Dir,
			Destination: e.DestEn,
			StopID:      stopID,
			StopSeq:     e.Seq,
			ETA:         eta,
			Operator:    opCitybus,
			Remark:      e.RmkEn,
		})
	}
	return arrivals, nil
}

func (c *CitybusClient) FetchStopByID(ctx context.Context, stopID string) (*models.BusStop, error) {
	url := fmt.Sprintf("%s/stop/%s", citybusBaseURL, stopID)
	var resp citybusResponse[citybusStop]
	if err := c.get(ctx, url, &resp); err != nil {
		return nil, err
	}

	lat, _ := strconv.ParseFloat(resp.Data.Lat, 64)
	lon, _ := strconv.ParseFloat(resp.Data.Long, 64)
	return &models.BusStop{
		StopID:   resp.Data.Stop,
		NameEn:   resp.Data.NameEn,
		NameTc:   resp.Data.NameTc,
		NameSc:   resp.Data.NameSc,
		Lat:      lat,
		Lon:      lon,
		Operator: opCitybus,
	}, nil
}

// citybusDirection converts bound code to API direction string.
func citybusDirection(bound string) string {
	switch bound {
	case "I":
		return "inbound"
	case "O":
		return "outbound"
	default:
		return bound
	}
}

func (c *CitybusClient) get(ctx context.Context, url string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("citybus: create request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("citybus: request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("citybus: unexpected status %d for %s", resp.StatusCode, url)
	}
	return json.NewDecoder(resp.Body).Decode(dest)
}
