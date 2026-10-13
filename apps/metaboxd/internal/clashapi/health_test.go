package clashapi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"metabox/internal/clashapi"
)

// settingsFor turns the test server address into what the daemon would read
// from the config.
func settingsFor(t *testing.T, srv *httptest.Server, secret string) clashapi.Settings {
	t.Helper()

	return clashapi.Settings{Address: strings.TrimPrefix(srv.URL, "http://"), Secret: secret}
}

func TestWaitSucceeds(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	checker := clashapi.NewChecker(time.Second, 10*time.Millisecond)
	if err := checker.Wait(t.Context(), settingsFor(t, srv, "")); err != nil {
		t.Errorf("healthcheck: %v", err)
	}
}

// An empty secret is a regular case: the fork disables authorization entirely, and
// the header is not needed then.
func TestWaitSendsSecretOnlyWhenSet(t *testing.T) {
	tests := []struct {
		name   string
		secret string
		want   string
	}{
		{"secret set", "токен", "Bearer токен"},
		{"no secret", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got atomic.Pointer[string]
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				header := r.Header.Get("Authorization")
				got.Store(&header)
				w.WriteHeader(http.StatusOK)
			}))
			t.Cleanup(srv.Close)

			checker := clashapi.NewChecker(time.Second, 10*time.Millisecond)
			if err := checker.Wait(t.Context(), settingsFor(t, srv, tt.secret)); err != nil {
				t.Fatalf("healthcheck: %v", err)
			}

			if header := got.Load(); header == nil || *header != tt.want {
				t.Errorf("header %v, expected %q", header, tt.want)
			}
		})
	}
}

// The service does not come up instantly: the polling must survive the first failures.
func TestWaitRetriesUntilServiceIsUp(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if attempts.Add(1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)

			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	checker := clashapi.NewChecker(time.Second, 10*time.Millisecond)
	if err := checker.Wait(t.Context(), settingsFor(t, srv, "")); err != nil {
		t.Fatalf("healthcheck: %v", err)
	}
	if got := attempts.Load(); got < 3 {
		t.Errorf("attempts %d, expected at least three", got)
	}
}

func TestWaitGivesUpOnDeadline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()

	checker := clashapi.NewChecker(time.Second, 10*time.Millisecond)
	if err := checker.Wait(ctx, settingsFor(t, srv, "")); err == nil {
		t.Error("service did not come up, but healthcheck reported success")
	}
}

func TestWaitRejectsEmptyAddress(t *testing.T) {
	checker := clashapi.NewChecker(time.Second, 10*time.Millisecond)

	if err := checker.Wait(t.Context(), clashapi.Settings{}); err == nil {
		t.Error("empty address accepted")
	}
}
