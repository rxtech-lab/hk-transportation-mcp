package osm

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestFindBusRoutesNear_Aberdeen(t *testing.T) {
	if os.Getenv("INTEGRATION") == "" {
		t.Skip("set INTEGRATION=1 to run")
	}

	client := NewOverpassClient(&http.Client{Timeout: 30 * time.Second}, nil)
	ctx := context.Background()

	// Aberdeen (Chengtu Road): 22.247815862091, 114.15479369053
	routes, err := client.FindBusRoutesNear(ctx, 22.247815862091, 114.15479369053, 500, 5)
	if err != nil {
		t.Fatalf("FindBusRoutesNear Aberdeen failed: %v", err)
	}

	if len(routes) == 0 {
		t.Fatal("expected bus routes near Aberdeen, got none")
	}
	if len(routes) > 5 {
		t.Errorf("expected at most 5 routes, got %d", len(routes))
	}

	t.Logf("Found %d bus routes near Aberdeen:", len(routes))
	for _, r := range routes {
		t.Logf("  ref=%s name=%s operator=%s", r.Ref, r.Name, r.Operator)
	}
}

func TestFindBusRoutesNear_TuenMunTownCentre(t *testing.T) {
	if os.Getenv("INTEGRATION") == "" {
		t.Skip("set INTEGRATION=1 to run")
	}

	client := NewOverpassClient(&http.Client{Timeout: 30 * time.Second}, nil)
	ctx := context.Background()

	// Tuen Mun Town Centre: 22.391635762091, 113.97549142053
	routes, err := client.FindBusRoutesNear(ctx, 22.391635762091, 113.97549142053, 500, 5)
	if err != nil {
		t.Fatalf("FindBusRoutesNear Tuen Mun failed: %v", err)
	}

	if len(routes) == 0 {
		t.Fatal("expected bus routes near Tuen Mun Town Centre, got none")
	}
	if len(routes) > 5 {
		t.Errorf("expected at most 5 routes, got %d", len(routes))
	}

	t.Logf("Found %d bus routes near Tuen Mun Town Centre:", len(routes))
	for _, r := range routes {
		t.Logf("  ref=%s name=%s operator=%s", r.Ref, r.Name, r.Operator)
	}
}

