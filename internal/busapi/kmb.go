package busapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

const (
	kmbBaseURL = "https://data.etabus.gov.hk/v1/transport/kmb"
	opKMB      = "KMB"
)

// KMBClient implements BusAPIClient for KMB.
type KMBClient struct {
	http *http.Client
}

// NewKMBClient creates a new KMB API client.
func NewKMBClient(c *http.Client) *KMBClient {
	return &KMBClient{http: c}
}

func (k *KMBClient) Operator() string { return opKMB }

type kmbResponse[T any] struct {
	Type      string `json:"type"`
	Version   string `json:"version"`
	Data      T      `json:"data"`
	Generated string `json:"generated_timestamp"`
}

type kmbStop struct {
	Stop   string `json:"stop"`
	NameEn string `json:"name_en"`
	NameTc string `json:"name_tc"`
	NameSc string `json:"name_sc"`
	Lat    string `json:"lat"`
	Long   string `json:"long"`
}

type kmbRoute struct {
	Route       string `json:"route"`
	Bound       string `json:"bound"`
	ServiceType string `json:"service_type"`
	OrigEn      string `json:"orig_en"`
	DestEn      string `json:"dest_en"`
}

type kmbRouteStop struct {
	Route       string `json:"route"`
	Bound       string `json:"bound"`
	ServiceType string `json:"service_type"`
	Seq         string `json:"seq"`
	Stop        string `json:"stop"`
}

type kmbETA struct {
	Route         string  `json:"route"`
	Dir           string  `json:"dir"`
	ServiceType   int     `json:"service_type"`
	Seq           int     `json:"seq"`
	DestEn        string  `json:"dest_en"`
	ETA           *string `json:"eta"`
	RmkEn         string  `json:"rmk_en"`
	DataTimestamp string  `json:"data_timestamp"`
}

func (k *KMBClient) FetchAllStops(ctx context.Context) ([]models.BusStop, error) {
	var resp kmbResponse[[]kmbStop]
	if err := k.get(ctx, kmbBaseURL+"/stop", &resp); err != nil {
		return nil, err
	}

	stops := make([]models.BusStop, 0, len(resp.Data))
	for _, s := range resp.Data {
		lat, _ := strconv.ParseFloat(s.Lat, 64)
		lon, _ := strconv.ParseFloat(s.Long, 64)
		stops = append(stops, models.BusStop{
			StopID:   s.Stop,
			NameEn:   s.NameEn,
			NameTc:   s.NameTc,
			NameSc:   s.NameSc,
			Lat:      lat,
			Lon:      lon,
			Operator: opKMB,
		})
	}
	return stops, nil
}

func (k *KMBClient) FetchAllRoutes(ctx context.Context) ([]models.Route, error) {
	var resp kmbResponse[[]kmbRoute]
	if err := k.get(ctx, kmbBaseURL+"/route/", &resp); err != nil {
		return nil, err
	}

	routes := make([]models.Route, 0, len(resp.Data))
	for _, r := range resp.Data {
		routes = append(routes, models.Route{
			RouteID:     fmt.Sprintf("KMB-%s-%s-%s", r.Route, r.Bound, r.ServiceType),
			Route:       r.Route,
			Bound:       r.Bound,
			ServiceType: r.ServiceType,
			OrigEn:      r.OrigEn,
			DestEn:      r.DestEn,
			Operator:    opKMB,
		})
	}
	return routes, nil
}

func (k *KMBClient) FetchRouteStops(ctx context.Context, route, bound, serviceType string) ([]models.RouteStop, error) {
	dir := kmbDirection(bound)
	url := fmt.Sprintf("%s/route-stop/%s/%s/%s", kmbBaseURL, route, dir, serviceType)
	var resp kmbResponse[[]kmbRouteStop]
	if err := k.get(ctx, url, &resp); err != nil {
		return nil, err
	}

	stops := make([]models.RouteStop, 0, len(resp.Data))
	for _, rs := range resp.Data {
		seq, _ := strconv.Atoi(rs.Seq)
		stops = append(stops, models.RouteStop{
			RouteID:  fmt.Sprintf("KMB-%s-%s-%s", rs.Route, rs.Bound, rs.ServiceType),
			StopID:   rs.Stop,
			StopSeq:  seq,
			Operator: opKMB,
		})
	}
	return stops, nil
}

func (k *KMBClient) FetchETA(ctx context.Context, stopID, route string) ([]models.ETAArrival, error) {
	url := fmt.Sprintf("%s/eta/%s/%s/1", kmbBaseURL, stopID, route)
	var resp kmbResponse[[]kmbETA]
	if err := k.get(ctx, url, &resp); err != nil {
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
			Operator:    opKMB,
			Remark:      e.RmkEn,
		})
	}
	return arrivals, nil
}

// kmbDirection converts KMB bound code to API direction string.
func kmbDirection(bound string) string {
	switch bound {
	case "I":
		return "inbound"
	case "O":
		return "outbound"
	default:
		return bound
	}
}

func (k *KMBClient) get(ctx context.Context, url string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("kmb: create request: %w", err)
	}
	resp, err := k.http.Do(req)
	if err != nil {
		return fmt.Errorf("kmb: request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("kmb: unexpected status %d for %s", resp.StatusCode, url)
	}
	return json.NewDecoder(resp.Body).Decode(dest)
}
