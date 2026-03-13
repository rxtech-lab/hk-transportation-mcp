package sync

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/rxtech-lab/hk-transportation-mcp/internal/busapi"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/geo"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

// Syncer handles periodic data synchronization from bus APIs to the database and index.
type Syncer struct {
	db      *sql.DB
	clients []busapi.BusAPIClient
	index   *geo.StopIndex
}

// NewSyncer creates a new Syncer.
func NewSyncer(db *sql.DB, index *geo.StopIndex, clients ...busapi.BusAPIClient) *Syncer {
	return &Syncer{
		db:      db,
		clients: clients,
		index:   index,
	}
}

// FullSync fetches all data from all bus API clients concurrently and updates the database + index.
// Data is written to the database on the fly as each client finishes fetching. Duplicate stops are skipped.
func (s *Syncer) FullSync(ctx context.Context) error {
	log.Println("Starting full data sync...")
	start := time.Now()

	var (
		mu        sync.Mutex
		seenStops map[string]struct{} = make(map[string]struct{})
		allStops  []models.BusStop
		allRStops []models.RouteStop
		wg        sync.WaitGroup
		firstErr  error
	)

	for _, client := range s.clients {
		wg.Add(1)
		go func(c busapi.BusAPIClient) {
			defer wg.Done()

			// --- Stops ---
			log.Printf("sync: %s: fetching stops...", c.Operator())
			stops, err := c.FetchAllStops(ctx)
			if err != nil {
				log.Printf("sync: %s: fetch stops: %v", c.Operator(), err)
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("%s stops: %w", c.Operator(), err)
				}
				mu.Unlock()
				return
			}
			log.Printf("sync: %s: fetched %d stops", c.Operator(), len(stops))

			// Deduplicate and write stops immediately
			mu.Lock()
			var uniqueStops []models.BusStop
			for _, stop := range stops {
				if _, exists := seenStops[stop.StopID]; !exists {
					seenStops[stop.StopID] = struct{}{}
					uniqueStops = append(uniqueStops, stop)
					allStops = append(allStops, stop)
				}
			}
			mu.Unlock()

			if len(uniqueStops) > 0 {
				log.Printf("sync: %s: writing %d stops to database (%d duplicates skipped)...",
					c.Operator(), len(uniqueStops), len(stops)-len(uniqueStops))
				if err := s.upsertStops(ctx, uniqueStops); err != nil {
					log.Printf("sync: %s: upsert stops: %v", c.Operator(), err)
					mu.Lock()
					if firstErr == nil {
						firstErr = fmt.Errorf("%s upsert stops: %w", c.Operator(), err)
					}
					mu.Unlock()
					return
				}
			}

			// --- Routes ---
			log.Printf("sync: %s: fetching routes...", c.Operator())
			routes, err := c.FetchAllRoutes(ctx)
			if err != nil {
				log.Printf("sync: %s: fetch routes: %v", c.Operator(), err)
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("%s routes: %w", c.Operator(), err)
				}
				mu.Unlock()
				return
			}
			log.Printf("sync: %s: fetched %d routes", c.Operator(), len(routes))

			// Write routes immediately
			log.Printf("sync: %s: writing %d routes to database...", c.Operator(), len(routes))
			if err := s.upsertRoutes(ctx, routes); err != nil {
				log.Printf("sync: %s: upsert routes: %v", c.Operator(), err)
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("%s upsert routes: %w", c.Operator(), err)
				}
				mu.Unlock()
				return
			}

			// --- Route-Stops ---
			log.Printf("sync: %s: fetching route-stops for %d routes...", c.Operator(), len(routes))
			var routeStops []models.RouteStop
			errors := 0
			for i, r := range routes {
				if (i+1)%50 == 0 || i+1 == len(routes) {
					log.Printf("sync: %s: route-stops progress %d/%d (fetched %d stops so far)",
						c.Operator(), i+1, len(routes), len(routeStops))
				}
				rs, err := c.FetchRouteStops(ctx, r.Route, r.Bound, r.ServiceType)
				if err != nil {
					errors++
					continue
				}
				routeStops = append(routeStops, rs...)
			}
			if errors > 0 {
				log.Printf("sync: %s: %d route-stop fetch errors (skipped)", c.Operator(), errors)
			}

			// Write route-stops immediately
			log.Printf("sync: %s: writing %d route-stops to database...", c.Operator(), len(routeStops))
			if err := s.upsertRouteStops(ctx, routeStops); err != nil {
				log.Printf("sync: %s: upsert route-stops: %v", c.Operator(), err)
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("%s upsert route-stops: %w", c.Operator(), err)
				}
				mu.Unlock()
				return
			}

			mu.Lock()
			allRStops = append(allRStops, routeStops...)
			mu.Unlock()

			log.Printf("sync: %s: done — %d stops, %d routes, %d route-stops",
				c.Operator(), len(uniqueStops), len(routes), len(routeStops))
		}(client)
	}

	wg.Wait()

	// Reload in-memory index
	log.Println("sync: reloading in-memory index...")
	s.index.Reload(allStops, allRStops)

	// Rebuild pgRouting transit graph
	if err := s.index.BuildTransitGraph(); err != nil {
		log.Printf("sync: failed to rebuild transit graph: %v", err)
	}

	log.Printf("Full sync completed in %v: %d stops, %d route-stops",
		time.Since(start), len(allStops), len(allRStops))
	return firstErr
}

// StartPeriodic runs FullSync on a 1-hour interval. It blocks until ctx is cancelled.
func (s *Syncer) StartPeriodic(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.FullSync(ctx); err != nil {
				log.Printf("periodic sync error: %v", err)
			}
		}
	}
}

const batchSize = 500

func (s *Syncer) upsertStops(ctx context.Context, stops []models.BusStop) error {
	for i := 0; i < len(stops); i += batchSize {
		end := i + batchSize
		if end > len(stops) {
			end = len(stops)
		}
		batch := stops[i:end]

		query := `INSERT INTO bus_stops (stop_id, name_en, name_tc, name_sc, lat, lon, operator, geom) VALUES `
		args := make([]interface{}, 0, len(batch)*7)
		for j, stop := range batch {
			p := j * 7
			if j > 0 {
				query += ", "
			}
			query += fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d, ST_SetSRID(ST_MakePoint($%d, $%d), 4326)::geography)",
				p+1, p+2, p+3, p+4, p+5, p+6, p+7, p+6, p+5)
			args = append(args, stop.StopID, stop.NameEn, stop.NameTc, stop.NameSc, stop.Lat, stop.Lon, stop.Operator)
		}
		query += ` ON CONFLICT (stop_id) DO UPDATE SET
			name_en = EXCLUDED.name_en, name_tc = EXCLUDED.name_tc, name_sc = EXCLUDED.name_sc,
			lat = EXCLUDED.lat, lon = EXCLUDED.lon, operator = EXCLUDED.operator, geom = EXCLUDED.geom`

		if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
			return err
		}
	}
	return nil
}

func (s *Syncer) upsertRoutes(ctx context.Context, routes []models.Route) error {
	for i := 0; i < len(routes); i += batchSize {
		end := i + batchSize
		if end > len(routes) {
			end = len(routes)
		}
		batch := routes[i:end]

		query := `INSERT INTO routes (route_id, route, bound, service_type, orig_en, dest_en, operator) VALUES `
		args := make([]interface{}, 0, len(batch)*7)
		for j, r := range batch {
			p := j * 7
			if j > 0 {
				query += ", "
			}
			query += fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d)", p+1, p+2, p+3, p+4, p+5, p+6, p+7)
			args = append(args, r.RouteID, r.Route, r.Bound, r.ServiceType, r.OrigEn, r.DestEn, r.Operator)
		}
		query += ` ON CONFLICT (route_id) DO UPDATE SET
			route = EXCLUDED.route, bound = EXCLUDED.bound, service_type = EXCLUDED.service_type,
			orig_en = EXCLUDED.orig_en, dest_en = EXCLUDED.dest_en, operator = EXCLUDED.operator`

		if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
			return err
		}
	}
	return nil
}

func (s *Syncer) upsertRouteStops(ctx context.Context, routeStops []models.RouteStop) error {
	for i := 0; i < len(routeStops); i += batchSize {
		end := i + batchSize
		if end > len(routeStops) {
			end = len(routeStops)
		}
		batch := routeStops[i:end]

		query := `INSERT INTO route_stops (route_id, stop_id, stop_seq, operator) VALUES `
		args := make([]interface{}, 0, len(batch)*4)
		for j, rs := range batch {
			p := j * 4
			if j > 0 {
				query += ", "
			}
			query += fmt.Sprintf("($%d, $%d, $%d, $%d)", p+1, p+2, p+3, p+4)
			args = append(args, rs.RouteID, rs.StopID, rs.StopSeq, rs.Operator)
		}
		query += ` ON CONFLICT (route_id, stop_id, stop_seq) DO UPDATE SET operator = EXCLUDED.operator`

		if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
			return err
		}
	}
	return nil
}
