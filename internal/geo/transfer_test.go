package geo

import (
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/rxtech-lab/hk-transportation-mcp/internal/models"
)

func TestFindTransferRoutes_NilDB(t *testing.T) {
	idx := NewStopIndex(nil)
	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 2, 10)
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
	results, err := idx.FindTransferRoutes([]string{}, []string{"S5"}, 2, 10)
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
	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{}, 2, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results with empty dest, got %v", results)
	}
}

func TestFindTransferRoutes_NoOriginNodes(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	// Return empty rows for origin node lookup
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}))
	// Dest query still runs
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(5))

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 2, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results with no origin nodes, got %v", results)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_SingleTransfer(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)
	idx.Reload([]models.BusStop{
		{StopID: "S1", NameEn: "Origin", Lat: 22.30, Lon: 114.17, Operator: "KMB"},
		{StopID: "S3", NameEn: "Transfer", Lat: 22.31, Lon: 114.18, Operator: "KMB"},
		{StopID: "S5", NameEn: "Dest", Lat: 22.32, Lon: 114.19, Operator: "KMB"},
	}, nil)

	// Mock getNodeIDs for origin stops
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	// Mock getNodeIDs for dest stops
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(5))

	// Mock pgr_dijkstra result: S1 → S3 (Route A), S3 → S5 (Route B)
	mock.ExpectQuery("pgr_dijkstra").WillReturnRows(
		sqlmock.NewRows([]string{
			"path_seq", "start_vid", "end_vid", "node", "edge", "agg_cost", "stop_id", "route_id",
		}).
			AddRow(1, 1, 5, 1, 101, 0.0, "S1", "KMB-1A-O-1").
			AddRow(2, 1, 5, 3, 102, 1.0, "S3", "KMB-2B-O-1").
			AddRow(3, 1, 5, 5, -1, 2.0, "S5", ""),
	)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 2, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if len(r.Legs) != 2 {
		t.Fatalf("expected 2 legs, got %d", len(r.Legs))
	}
	if r.Legs[0].RouteID != "KMB-1A-O-1" {
		t.Errorf("expected first leg route KMB-1A-O-1, got %s", r.Legs[0].RouteID)
	}
	if r.Legs[0].BoardStopID != "S1" || r.Legs[0].AlightStopID != "S3" {
		t.Errorf("first leg: expected S1→S3, got %s→%s", r.Legs[0].BoardStopID, r.Legs[0].AlightStopID)
	}
	if r.Legs[1].RouteID != "KMB-2B-O-1" {
		t.Errorf("expected second leg route KMB-2B-O-1, got %s", r.Legs[1].RouteID)
	}
	if r.Legs[1].BoardStopID != "S3" || r.Legs[1].AlightStopID != "S5" {
		t.Errorf("second leg: expected S3→S5, got %s→%s", r.Legs[1].BoardStopID, r.Legs[1].AlightStopID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_TwoTransfers(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(5))

	// S1 → S2 (R1), S2 → S3 (R1), S3 → S4 (R2), S4 → S5 (R3)
	mock.ExpectQuery("pgr_dijkstra").WillReturnRows(
		sqlmock.NewRows([]string{
			"path_seq", "start_vid", "end_vid", "node", "edge", "agg_cost", "stop_id", "route_id",
		}).
			AddRow(1, 1, 5, 1, 1, 0.0, "S1", "R1").
			AddRow(2, 1, 5, 2, 2, 1.0, "S2", "R1").
			AddRow(3, 1, 5, 3, 3, 2.0, "S3", "R2").
			AddRow(4, 1, 5, 4, 4, 3.0, "S4", "R3").
			AddRow(5, 1, 5, 5, -1, 4.0, "S5", ""),
	)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 3, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if len(r.Legs) != 3 {
		t.Fatalf("expected 3 legs (2 transfers), got %d legs", len(r.Legs))
	}
	if r.Legs[0].BoardStopID != "S1" || r.Legs[0].AlightStopID != "S3" {
		t.Errorf("leg 0: expected S1→S3, got %s→%s", r.Legs[0].BoardStopID, r.Legs[0].AlightStopID)
	}
	if r.Legs[1].BoardStopID != "S3" || r.Legs[1].AlightStopID != "S4" {
		t.Errorf("leg 1: expected S3→S4, got %s→%s", r.Legs[1].BoardStopID, r.Legs[1].AlightStopID)
	}
	if r.Legs[2].BoardStopID != "S4" || r.Legs[2].AlightStopID != "S5" {
		t.Errorf("leg 2: expected S4→S5, got %s→%s", r.Legs[2].BoardStopID, r.Legs[2].AlightStopID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_ExceedsMaxTransfers(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(5))

	// Path with 2 transfers (3 legs), but maxTransfers = 1
	mock.ExpectQuery("pgr_dijkstra").WillReturnRows(
		sqlmock.NewRows([]string{
			"path_seq", "start_vid", "end_vid", "node", "edge", "agg_cost", "stop_id", "route_id",
		}).
			AddRow(1, 1, 5, 1, 1, 0.0, "S1", "R1").
			AddRow(2, 1, 5, 3, 2, 1.0, "S3", "R2").
			AddRow(3, 1, 5, 4, 3, 2.0, "S4", "R3").
			AddRow(4, 1, 5, 5, -1, 3.0, "S5", ""),
	)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 0 {
		t.Errorf("expected 0 results (exceeds max_transfers=1), got %d", len(results))
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

	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(5))

	mock.ExpectQuery("pgr_dijkstra").WillReturnError(sqlmock.ErrCancelled)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 2, 10)
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

func TestFindTransferRoutes_NoPath(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(5))

	// Empty result = no path found
	mock.ExpectQuery("pgr_dijkstra").WillReturnRows(
		sqlmock.NewRows([]string{
			"path_seq", "start_vid", "end_vid", "node", "edge", "agg_cost", "stop_id", "route_id",
		}),
	)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S5"}, 2, 10)
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

func TestDecomposePath_SingleLeg(t *testing.T) {
	steps := []pathStep{
		{pathSeq: 1, stopID: "S1", routeID: "R1", edge: 1},
		{pathSeq: 2, stopID: "S2", routeID: "R1", edge: 2},
		{pathSeq: 3, stopID: "S3", routeID: "", edge: -1},
	}

	legs := decomposePath(steps)
	if len(legs) != 1 {
		t.Fatalf("expected 1 leg, got %d", len(legs))
	}
	if legs[0].RouteID != "R1" || legs[0].BoardStopID != "S1" || legs[0].AlightStopID != "S3" {
		t.Errorf("unexpected leg: %+v", legs[0])
	}
}

func TestDecomposePath_OneTransfer(t *testing.T) {
	steps := []pathStep{
		{pathSeq: 1, stopID: "S1", routeID: "R1", edge: 1},
		{pathSeq: 2, stopID: "S2", routeID: "R2", edge: 2},
		{pathSeq: 3, stopID: "S3", routeID: "", edge: -1},
	}

	legs := decomposePath(steps)
	if len(legs) != 2 {
		t.Fatalf("expected 2 legs, got %d", len(legs))
	}
	if legs[0].RouteID != "R1" || legs[0].BoardStopID != "S1" || legs[0].AlightStopID != "S2" {
		t.Errorf("unexpected leg 0: %+v", legs[0])
	}
	if legs[1].RouteID != "R2" || legs[1].BoardStopID != "S2" || legs[1].AlightStopID != "S3" {
		t.Errorf("unexpected leg 1: %+v", legs[1])
	}
}

func TestDecomposePath_TwoTransfers(t *testing.T) {
	steps := []pathStep{
		{pathSeq: 1, stopID: "S1", routeID: "R1", edge: 1},
		{pathSeq: 2, stopID: "S2", routeID: "R1", edge: 2},
		{pathSeq: 3, stopID: "S3", routeID: "R2", edge: 3},
		{pathSeq: 4, stopID: "S4", routeID: "R3", edge: 4},
		{pathSeq: 5, stopID: "S5", routeID: "", edge: -1},
	}

	legs := decomposePath(steps)
	if len(legs) != 3 {
		t.Fatalf("expected 3 legs, got %d", len(legs))
	}
	if legs[0].RouteID != "R1" || legs[0].BoardStopID != "S1" || legs[0].AlightStopID != "S3" {
		t.Errorf("unexpected leg 0: %+v", legs[0])
	}
	if legs[1].RouteID != "R2" || legs[1].BoardStopID != "S3" || legs[1].AlightStopID != "S4" {
		t.Errorf("unexpected leg 1: %+v", legs[1])
	}
	if legs[2].RouteID != "R3" || legs[2].BoardStopID != "S4" || legs[2].AlightStopID != "S5" {
		t.Errorf("unexpected leg 2: %+v", legs[2])
	}
}

func TestDecomposePath_Empty(t *testing.T) {
	legs := decomposePath(nil)
	if legs != nil {
		t.Errorf("expected nil, got %v", legs)
	}

	legs = decomposePath([]pathStep{{pathSeq: 1, stopID: "S1", edge: -1}})
	if legs != nil {
		t.Errorf("expected nil for single step, got %v", legs)
	}
}

func TestInt64ArrayStr(t *testing.T) {
	tests := []struct {
		input    []int64
		expected string
	}{
		{[]int64{1}, "1"},
		{[]int64{1, 2, 3}, "1, 2, 3"},
		{[]int64{}, ""},
	}
	for _, tt := range tests {
		got := int64ArrayStr(tt.input)
		if got != tt.expected {
			t.Errorf("int64ArrayStr(%v) = %q, want %q", tt.input, got, tt.expected)
		}
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

func TestLegSignature(t *testing.T) {
	legs := []TransferLeg{
		{RouteID: "R1", BoardStopID: "S1", AlightStopID: "S3"},
		{RouteID: "R2", BoardStopID: "S3", AlightStopID: "S5"},
	}
	sig := legSignature(legs)
	expected := "R1:S1->S3|R2:S3->S5"
	if sig != expected {
		t.Errorf("legSignature = %q, want %q", sig, expected)
	}
}

func TestBuildTransitGraph_NilDB(t *testing.T) {
	idx := NewStopIndex(nil)
	err := idx.BuildTransitGraph()
	if err != nil {
		t.Fatalf("expected nil error with nil db, got %v", err)
	}
}

func TestBuildTransitGraph_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)

	// Expect truncate
	mock.ExpectExec("TRUNCATE transit_edges, transit_node_map RESTART IDENTITY").
		WillReturnResult(sqlmock.NewResult(0, 0))

	// Expect node map population
	mock.ExpectExec("INSERT INTO transit_node_map").
		WillReturnResult(sqlmock.NewResult(0, 100))

	// Expect route edge population
	mock.ExpectExec("INSERT INTO transit_edges").
		WillReturnResult(sqlmock.NewResult(0, 500))

	// Expect walking edge population
	mock.ExpectExec("INSERT INTO transit_edges").
		WillReturnResult(sqlmock.NewResult(0, 50))

	err = idx.BuildTransitGraph()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestDecomposePath_WalkingTransfer(t *testing.T) {
	// Scenario: Bus R1 from S1→S2, walk from S2→S3, bus R2 from S3→S4
	steps := []pathStep{
		{pathSeq: 1, stopID: "S1", routeID: "R1", edge: 1},
		{pathSeq: 2, stopID: "S2", routeID: WalkRouteID, edge: 2},
		{pathSeq: 3, stopID: "S3", routeID: "R2", edge: 3},
		{pathSeq: 4, stopID: "S4", routeID: "", edge: -1},
	}

	legs := decomposePath(steps)
	if len(legs) != 3 {
		t.Fatalf("expected 3 legs, got %d", len(legs))
	}

	// Leg 0: bus R1 from S1 to S2
	if legs[0].RouteID != "R1" || legs[0].IsWalking {
		t.Errorf("leg 0: expected bus R1, got route=%s walking=%v", legs[0].RouteID, legs[0].IsWalking)
	}
	if legs[0].BoardStopID != "S1" || legs[0].AlightStopID != "S2" {
		t.Errorf("leg 0: expected S1→S2, got %s→%s", legs[0].BoardStopID, legs[0].AlightStopID)
	}

	// Leg 1: walk from S2 to S3
	if legs[1].RouteID != WalkRouteID || !legs[1].IsWalking {
		t.Errorf("leg 1: expected walking, got route=%s walking=%v", legs[1].RouteID, legs[1].IsWalking)
	}
	if legs[1].BoardStopID != "S2" || legs[1].AlightStopID != "S3" {
		t.Errorf("leg 1: expected S2→S3, got %s→%s", legs[1].BoardStopID, legs[1].AlightStopID)
	}

	// Leg 2: bus R2 from S3 to S4
	if legs[2].RouteID != "R2" || legs[2].IsWalking {
		t.Errorf("leg 2: expected bus R2, got route=%s walking=%v", legs[2].RouteID, legs[2].IsWalking)
	}
	if legs[2].BoardStopID != "S3" || legs[2].AlightStopID != "S4" {
		t.Errorf("leg 2: expected S3→S4, got %s→%s", legs[2].BoardStopID, legs[2].AlightStopID)
	}
}

func TestDecomposePath_WalkAtStart(t *testing.T) {
	// Walk from S1→S2, then bus R1 from S2→S3
	steps := []pathStep{
		{pathSeq: 1, stopID: "S1", routeID: WalkRouteID, edge: 1},
		{pathSeq: 2, stopID: "S2", routeID: "R1", edge: 2},
		{pathSeq: 3, stopID: "S3", routeID: "", edge: -1},
	}

	legs := decomposePath(steps)
	if len(legs) != 2 {
		t.Fatalf("expected 2 legs, got %d", len(legs))
	}

	if !legs[0].IsWalking || legs[0].RouteID != WalkRouteID {
		t.Errorf("leg 0: expected walking, got route=%s walking=%v", legs[0].RouteID, legs[0].IsWalking)
	}
	if legs[0].BoardStopID != "S1" || legs[0].AlightStopID != "S2" {
		t.Errorf("leg 0: expected S1→S2, got %s→%s", legs[0].BoardStopID, legs[0].AlightStopID)
	}

	if legs[1].IsWalking || legs[1].RouteID != "R1" {
		t.Errorf("leg 1: expected bus R1, got route=%s walking=%v", legs[1].RouteID, legs[1].IsWalking)
	}
}

func TestCountBusTransfers(t *testing.T) {
	tests := []struct {
		name string
		legs []TransferLeg
		want int
	}{
		{"single bus", []TransferLeg{{RouteID: "R1"}}, 0},
		{"two buses", []TransferLeg{{RouteID: "R1"}, {RouteID: "R2"}}, 1},
		{"bus-walk-bus", []TransferLeg{
			{RouteID: "R1"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R2"},
		}, 1},
		{"bus-walk-bus-walk-bus (3 buses)", []TransferLeg{
			{RouteID: "R1"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R2"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R3"},
		}, 2},
		{"bus-walk-bus-walk-bus-walk-bus (4 buses)", []TransferLeg{
			{RouteID: "R1"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R2"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R3"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R4"},
		}, 3},
		{"empty", []TransferLeg{}, 0},
		{"only walks", []TransferLeg{
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: WalkRouteID, IsWalking: true},
		}, 0},
		{"walk-bus-walk-bus", []TransferLeg{
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R1"},
			{RouteID: WalkRouteID, IsWalking: true},
			{RouteID: "R2"},
		}, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := countBusTransfers(tt.legs)
			if got != tt.want {
				t.Errorf("countBusTransfers() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestFindTransferRoutes_WalkingLegsNotCountedAsTransfers(t *testing.T) {
	// A 3-bus route with walking legs: bus→walk→bus→walk→bus = 5 legs
	// Old bug: len(legs)-1 = 4 "transfers" → filtered out by maxTransfers=2
	// Fix: countBusTransfers = 2 → allowed with maxTransfers=2
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)
	idx.Reload([]models.BusStop{
		{StopID: "S1", NameEn: "A", Lat: 22.30, Lon: 114.17, Operator: "KMB"},
		{StopID: "S2", NameEn: "B", Lat: 22.31, Lon: 114.18, Operator: "KMB"},
		{StopID: "S3", NameEn: "C", Lat: 22.31, Lon: 114.18, Operator: "CTB"},
		{StopID: "S4", NameEn: "D", Lat: 22.32, Lon: 114.19, Operator: "CTB"},
		{StopID: "S5", NameEn: "E", Lat: 22.32, Lon: 114.19, Operator: "KMB"},
		{StopID: "S6", NameEn: "F", Lat: 22.33, Lon: 114.20, Operator: "KMB"},
	}, nil)

	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(6))

	// Path: S1→S2 (R1), S2→S3 (WALK), S3→S4 (R2), S4→S5 (WALK), S5→S6 (R3)
	mock.ExpectQuery("pgr_dijkstra").WillReturnRows(
		sqlmock.NewRows([]string{
			"path_seq", "start_vid", "end_vid", "node", "edge", "agg_cost", "stop_id", "route_id",
		}).
			AddRow(1, 1, 6, 1, 101, 0.0, "S1", "R1").
			AddRow(2, 1, 6, 2, 102, 1.0, "S2", WalkRouteID).
			AddRow(3, 1, 6, 3, 103, 6.0, "S3", "R2").
			AddRow(4, 1, 6, 4, 104, 7.0, "S4", WalkRouteID).
			AddRow(5, 1, 6, 5, 105, 12.0, "S5", "R3").
			AddRow(6, 1, 6, 6, -1, 13.0, "S6", ""),
	)

	// maxTransfers=2 should allow this route (2 bus transfers, despite 5 legs)
	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S6"}, 2, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result (walking legs should not count as transfers), got %d", len(results))
	}

	r := results[0]
	if len(r.Legs) != 5 {
		t.Fatalf("expected 5 legs (bus+walk+bus+walk+bus), got %d", len(r.Legs))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}

func TestFindTransferRoutes_WalkingTransfer(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	idx := NewStopIndex(db)
	idx.Reload([]models.BusStop{
		{StopID: "S1", NameEn: "Origin", Lat: 22.30, Lon: 114.17, Operator: "KMB"},
		{StopID: "S2", NameEn: "Alight", Lat: 22.305, Lon: 114.175, Operator: "KMB"},
		{StopID: "S3", NameEn: "Walk To", Lat: 22.306, Lon: 114.176, Operator: "CTB"},
		{StopID: "S4", NameEn: "Dest", Lat: 22.32, Lon: 114.19, Operator: "CTB"},
	}, nil)

	// Mock getNodeIDs
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(1))
	mock.ExpectQuery("SELECT node_id FROM transit_node_map").
		WillReturnRows(sqlmock.NewRows([]string{"node_id"}).AddRow(4))

	// pgr_dijkstra result: S1→S2 (R1), S2→S3 (WALK), S3→S4 (R2)
	mock.ExpectQuery("pgr_dijkstra").WillReturnRows(
		sqlmock.NewRows([]string{
			"path_seq", "start_vid", "end_vid", "node", "edge", "agg_cost", "stop_id", "route_id",
		}).
			AddRow(1, 1, 4, 1, 101, 0.0, "S1", "KMB-1A-O-1").
			AddRow(2, 1, 4, 2, 102, 1.0, "S2", WalkRouteID).
			AddRow(3, 1, 4, 3, 103, 6.0, "S3", "CTB-5B-O-1").
			AddRow(4, 1, 4, 4, -1, 7.0, "S4", ""),
	)

	results, err := idx.FindTransferRoutes([]string{"S1"}, []string{"S4"}, 2, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if len(r.Legs) != 3 {
		t.Fatalf("expected 3 legs (bus + walk + bus), got %d", len(r.Legs))
	}

	// Verify bus leg
	if r.Legs[0].IsWalking || r.Legs[0].RouteID != "KMB-1A-O-1" {
		t.Errorf("leg 0: expected bus KMB-1A-O-1, got route=%s walking=%v", r.Legs[0].RouteID, r.Legs[0].IsWalking)
	}

	// Verify walking leg
	if !r.Legs[1].IsWalking || r.Legs[1].RouteID != WalkRouteID {
		t.Errorf("leg 1: expected walking, got route=%s walking=%v", r.Legs[1].RouteID, r.Legs[1].IsWalking)
	}
	if r.Legs[1].BoardStopID != "S2" || r.Legs[1].AlightStopID != "S3" {
		t.Errorf("leg 1: expected S2→S3 walk, got %s→%s", r.Legs[1].BoardStopID, r.Legs[1].AlightStopID)
	}

	// Verify second bus leg
	if r.Legs[2].IsWalking || r.Legs[2].RouteID != "CTB-5B-O-1" {
		t.Errorf("leg 2: expected bus CTB-5B-O-1, got route=%s walking=%v", r.Legs[2].RouteID, r.Legs[2].IsWalking)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}
