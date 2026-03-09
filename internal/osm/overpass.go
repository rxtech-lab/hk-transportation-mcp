package osm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

const (
	overpassURL      = "https://overpass-api.de/api/interpreter"
	overpassCacheTTL = 30 * time.Minute
)

// OverpassClient queries the Overpass API for bus stops.
type OverpassClient struct {
	http  *http.Client
	cache *cache.Cache
}

// NewOverpassClient creates a new Overpass API client.
func NewOverpassClient(httpClient *http.Client, c *cache.Cache) *OverpassClient {
	return &OverpassClient{
		http:  httpClient,
		cache: c,
	}
}

type overpassResponse struct {
	Elements []overpassElement `json:"elements"`
}

type overpassElement struct {
	Type string            `json:"type"`
	ID   int64             `json:"id"`
	Lat  float64           `json:"lat"`
	Lon  float64           `json:"lon"`
	Tags map[string]string `json:"tags"`
}

// FindNearbyStops queries Overpass for bus stops near the given coordinates.
func (o *OverpassClient) FindNearbyStops(ctx context.Context, lat, lon float64, radiusM int) ([]models.BusStop, error) {
	if radiusM <= 0 {
		radiusM = 300
	}

	cacheKey := fmt.Sprintf("overpass:%.5f:%.5f:%d", lat, lon, radiusM)
	if o.cache != nil {
		if stops, ok, err := cache.GetJSON[[]models.BusStop](ctx, o.cache, cacheKey); err == nil && ok {
			return stops, nil
		}
	}

	query := fmt.Sprintf(`[out:json][timeout:10];
(
  node["highway"="bus_stop"](around:%d,%f,%f);
  node["public_transport"="platform"]["bus"="yes"](around:%d,%f,%f);
  node["public_transport"="stop_position"]["bus"="yes"](around:%d,%f,%f);
);
out body;`, radiusM, lat, lon, radiusM, lat, lon, radiusM, lat, lon)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, overpassURL, strings.NewReader("data="+query))
	if err != nil {
		return nil, fmt.Errorf("overpass: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent)

	resp, err := o.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("overpass: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("overpass: unexpected status %d", resp.StatusCode)
	}

	var result overpassResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("overpass: decode response: %w", err)
	}

	stops := make([]models.BusStop, 0, len(result.Elements))
	for _, el := range result.Elements {
		stop := models.BusStop{
			StopID: "OSM-" + strconv.FormatInt(el.ID, 10),
			NameEn: el.Tags["name:en"],
			NameTc: el.Tags["name:zh"],
			Lat:    el.Lat,
			Lon:    el.Lon,
		}
		if stop.NameEn == "" {
			stop.NameEn = el.Tags["name"]
		}
		stops = append(stops, stop)
	}

	if o.cache != nil {
		_ = cache.SetJSON(ctx, o.cache, cacheKey, stops, overpassCacheTTL)
	}

	return stops, nil
}
