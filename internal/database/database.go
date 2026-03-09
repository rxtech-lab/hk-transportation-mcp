package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// NewConnection creates a new PostgreSQL database connection and runs migrations.
func NewConnection(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.PingContext(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	log.Println("Running database migrations...")

	statements := []string{
		`CREATE EXTENSION IF NOT EXISTS postgis`,
		`CREATE TABLE IF NOT EXISTS bus_stops (
			stop_id TEXT PRIMARY KEY,
			name_en TEXT NOT NULL DEFAULT '',
			name_tc TEXT NOT NULL DEFAULT '',
			name_sc TEXT NOT NULL DEFAULT '',
			lat DOUBLE PRECISION NOT NULL,
			lon DOUBLE PRECISION NOT NULL,
			operator TEXT NOT NULL,
			geom geography(Point, 4326)
		)`,
		`CREATE TABLE IF NOT EXISTS routes (
			route_id TEXT PRIMARY KEY,
			route TEXT NOT NULL,
			bound TEXT NOT NULL,
			service_type TEXT NOT NULL DEFAULT '1',
			orig_en TEXT NOT NULL DEFAULT '',
			dest_en TEXT NOT NULL DEFAULT '',
			operator TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS route_stops (
			route_id TEXT NOT NULL,
			stop_id TEXT NOT NULL,
			stop_seq INTEGER NOT NULL,
			operator TEXT NOT NULL,
			PRIMARY KEY (route_id, stop_id, stop_seq)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_route_stops_stop ON route_stops(stop_id)`,
		`CREATE INDEX IF NOT EXISTS idx_bus_stops_geom ON bus_stops USING GIST(geom)`,
		`CREATE TABLE IF NOT EXISTS chat_messages (
			id SERIAL PRIMARY KEY,
			jid TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_messages_jid ON chat_messages(jid, created_at DESC)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migration failed: %w\nstatement: %s", err, stmt)
		}
	}

	log.Println("Database migrations completed successfully")
	return nil
}
