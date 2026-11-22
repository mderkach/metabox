package events_test

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/events"
)

func TestPinnedControllerUsesNewConnections(t *testing.T) {
	type connKey struct{}

	var opened atomic.Int64
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprint(w, r.Context().Value(connKey{}))
	}))
	server.Config.ConnContext = func(ctx context.Context, _ net.Conn) context.Context {
		return context.WithValue(ctx, connKey{}, opened.Add(1))
	}
	server.Start()
	defer server.Close()

	settings := clashapi.Settings{Address: strings.TrimPrefix(server.URL, "http://")}
	source := events.NewClashSource(events.ClashSettings(func(context.Context) (clashapi.Settings, error) {
		return settings, nil
	}), nil, nil, time.Second)
	pinned, err := source.WithController(settings)
	if err != nil {
		t.Fatal(err)
	}

	initial, err := source.Snapshot(t.Context(), "/connections")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/connections", "/rules"} {
		next, err := pinned.Snapshot(t.Context(), path)
		if err != nil || string(next) == string(initial) {
			t.Fatalf("request %s reused connection %s or failed: %s %v", path, initial, next, err)
		}
		initial = next
	}
}
