package geo

import (
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

func TestFindTransferRoutes_NilDB(t *testing.T) {
	idx := NewStopIndex(nil)
	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results with nil db, got %v", results)
	}
}

func TestFindTransferRoutes_EmptyOrigin(t *testing.T) {
	db, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)
	results, err := idx.FindTransferRoutes([]string{}, []string{"S5"}, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results with empty origin, got %v", results)
	}
}

func TestFindTransferRoutes_EmptyDest(t *testing.T) {
	db, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)
	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{}, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results with empty dest, got %v", results)
	}
}

func TestFindTransferRoutes_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	// Load stops into the in-memory index so GetStop works
	idx.Reload([]models.BusStop{
		{StopID: "S1", NameEn: "Origin Stop", Lat: 22.30, Lon: 114.17, Operator: "KMB"},
		{StopID: "S3", NameEn: "Transfer Stop", Lat: 22.31, Lon: 114.18, Operator: "KMB"},
		{StopID: "S5", NameEn: "Dest Stop", Lat: 22.32, Lon: 114.19, Operator: "KMB"},
	}, nil)

	rows := sqlmock.NewRows([]string{
		"route_id", "origin_stop_id", "transfer_stop_id", "route_id", "dest_stop_id",
	}).AddRow("KMB-1A-O-1", "S1", "S3", "KMB-2B-O-1", "S5")

	mock.ExpectQuery("WITH first_leg AS").WillReturnRows(rows)

	results, err := idx.FindTransferRoutes([]string{"S1", "S2"}, []string{"S5", "S6"}, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.FirstRouteID != "KMB-1A-O-1" {
		t.Errorf("expected first route KMB-1A-O-1, got %s", r.FirstRouteID)
	}
	if r.OriginStopID != "S1" {
		t.Errorf("expected origin stop S1, got %s", r.OriginStopID)
	}
	if r.TransferStopID != "S3" {
		t.Errorf("expected transfer stop S3, got %s", r.TransferStopID)
	}
	if r.SecondRouteID != "KMB-2B-O-1" {
		t.Errorf("expected second route KMB-2B-O-1, got %s", r.SecondRouteID)
	}
	if r.DestStopID != "S5" {
		t.Errorf("expected dest stop S5, got %s", r.DestStopID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_MultipleResults(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	rows := sqlmock.NewRows([]string{
		"route_id", "origin_stop_id", "transfer_stop_id", "route_id", "dest_stop_id",
	}).
		AddRow("KMB-1A-O-1", "S1", "S3", "KMB-2B-O-1", "S5").
		AddRow("KMB-3C-O-1", "S2", "S4", "KMB-4D-O-1", "S6")

	mock.ExpectQuery("WITH first_leg AS").WillReturnRows(rows)

	results, err := idx.FindTransferRoutes([]string{"S1", "S2"}, []string{"S5", "S6"}, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	if results[0].FirstRouteID != "KMB-1A-O-1" || results[1].FirstRouteID != "KMB-3C-O-1" {
		t.Errorf("unexpected route IDs: %v", results)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_NoResults(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	rows := sqlmock.NewRows([]string{
		"route_id", "origin_stop_id", "transfer_stop_id", "route_id", "dest_stop_id",
	})

	mock.ExpectQuery("WITH first_leg AS").WillReturnRows(rows)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	mock.ExpectQuery("WITH first_leg AS").WillReturnError(
		sqlmock.ErrCancelled,
	)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 10)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if results != nil {
		t.Errorf("expected nil results on error, got %v", results)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_DefaultMaxResults(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	rows := sqlmock.NewRows([]string{
		"route_id", "origin_stop_id", "transfer_stop_id", "route_id", "dest_stop_id",
	})
	mock.ExpectQuery("WITH first_leg AS").WillReturnRows(rows)

	// Pass 0 for maxResults; should default to 20
	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results == nil {
		// nil is acceptable for zero results from scan
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestPlaceholders(t *testing.T) {
	tests := []struct {
		start, count int
		expected     string
	}{
		{1, 1, "$1"},
		{1, 3, "$1, $2, $3"},
		{4, 2, "$4, $5"},
		{1, 0, ""},
	}

	for _, tt := range tests {
		got := placeholders(tt.start, tt.count)
		if got != tt.expected {
			t.Errorf("placeholders(%d, %d) = %q, want %q", tt.start, tt.count, got, tt.expected)
		}
	}
}
