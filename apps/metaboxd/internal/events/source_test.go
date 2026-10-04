package events

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newSnapshotSource(t *testing.T, body string) *ClashSource {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	resolve := func(context.Context) (Settings, error) {
		return Settings{BaseURL: srv.URL}, nil
	}

	return NewClashSource(resolve, nil, nil, 5*time.Second)
}

// Ответ больше потолка отклоняется, а не читается в память целиком.
func TestSnapshotLimit(t *testing.T) {
	source := newSnapshotSource(t, `"`+strings.Repeat("x", maxSnapshotBytes)+`"`)

	if _, err := source.Snapshot(t.Context(), "/connections"); !errors.Is(err, errSnapshotTooLarge) {
		t.Errorf("ошибка %v, ожидали errSnapshotTooLarge", err)
	}
}

func TestSnapshot(t *testing.T) {
	source := newSnapshotSource(t, `{"connections":[]}`)

	body, err := source.Snapshot(t.Context(), "/connections")
	if err != nil {
		t.Fatalf("снапшот: %v", err)
	}
	if string(body) != `{"connections":[]}` {
		t.Errorf("тело %q, ожидали ответ источника без изменений", body)
	}
}
