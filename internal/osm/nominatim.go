package osm

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/cache"
)

const (
	nominatimURL     = "https://nominatim.openstreetmap.org/search"
	nominatimCacheTTL = 30 * time.Minute
	userAgent         = "hk-transportation-mcp/1.0"
)

// NominatimResult represents a geocoding result.
type NominatimResult struct {
	DisplayName string  `json:"display_name"`
	Lat         float64 `json:"lat_f"`
	Lon         float64 `json:"lon_f"`
	RawLat      string  `json:"lat"`
	RawLon      string  `json:"lon"`
	Type        string  `json:"type"`
	Class       string  `json:"class"`
}

// NominatimClient handles geocoding via Nominatim.
type NominatimClient struct {
	http      *http.Client
	cache     *cache.Cache
	mu        sync.Mutex
	lastCall  time.Time
}

// NewNominatimClient creates a new Nominatim geocoding client.
func NewNominatimClient(httpClient *http.Client, c *cache.Cache) *NominatimClient {
	return &NominatimClient{
		http:  httpClient,
		cache: c,
	}
}

// Search performs a geocoding search restricted to Hong Kong.
func (n *NominatimClient) Search(ctx context.Context, query string, limit int) ([]NominatimResult, error) {
	if limit <= 0 {
		limit = 5
	}

	log.Printf("[nominatim] searching query=%q limit=%d", query, limit)

	// Check cache
	cacheKey := fmt.Sprintf("nominatim:%x", sha256.Sum256([]byte(query+strconv.Itoa(limit))))
	if n.cache != nil {
		if results, ok, err := cache.GetJSON[[]NominatimResult](ctx, n.cache, cacheKey); err == nil && ok {
			log.Printf("[nominatim] cache hit for query=%q, %d results", query, len(results))
			return results, nil
		}
	}

	// Rate limit: 1 req/s
	n.mu.Lock()
	elapsed := time.Since(n.lastCall)
	if elapsed < time.Second {
		time.Sleep(time.Second - elapsed)
	}
	n.lastCall = time.Now()
	n.mu.Unlock()

	params := url.Values{
		"q":            {query},
		"format":       {"json"},
		"countrycodes": {"cn"},
		"limit":        {strconv.Itoa(limit)},
		"viewbox":      {"113.835,22.15,114.41,22.565"},
		"bounded":      {"1"},
	}

	fullURL := nominatimURL + "?" + params.Encode()
	log.Printf("[nominatim] requesting URL=%s", fullURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, fmt.Errorf("nominatim: create request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := n.http.Do(req)
	if err != nil {
		log.Printf("[nominatim] request failed: %v", err)
		return nil, fmt.Errorf("nominatim: request failed: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("[nominatim] response status=%d", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim: unexpected status %d", resp.StatusCode)
	}

	var results []NominatimResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		log.Printf("[nominatim] decode error: %v", err)
		return nil, fmt.Errorf("nominatim: decode response: %w", err)
	}

	// Parse lat/lon strings to float
	for i := range results {
		results[i].Lat, _ = strconv.ParseFloat(results[i].RawLat, 64)
		results[i].Lon, _ = strconv.ParseFloat(results[i].RawLon, 64)
	}

	// Filter to Hong Kong results only
	var filtered []NominatimResult
	for _, r := range results {
		name := strings.ToLower(r.DisplayName)
		if strings.Contains(name, "hong kong") || strings.Contains(name, "香港") {
			filtered = append(filtered, r)
		} else {
			log.Printf("[nominatim] filtered out non-HK result: %q", r.DisplayName)
		}
	}
	results = filtered

	log.Printf("[nominatim] got %d results for query=%q (after HK filter)", len(results), query)
	for i, r := range results {
		log.Printf("[nominatim]   result[%d]: name=%q lat=%f lon=%f type=%s class=%s", i, r.DisplayName, r.Lat, r.Lon, r.Type, r.Class)
	}

	// Cache results
	if n.cache != nil {
		_ = cache.SetJSON(ctx, n.cache, cacheKey, results, nominatimCacheTTL)
	}

	return results, nil
}
