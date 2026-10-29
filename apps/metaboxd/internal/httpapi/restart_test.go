package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"metabox/internal/contract"
	"metabox/internal/httpapi"
)

// fakeRestarter replaces the detached launch of the init script: the launch itself is checked
// in internal/restart, here the answer and the call matter.
type fakeRestarter struct {
	err   error
	calls int
}

func (f *fakeRestarter) Restart(context.Context) error {
	f.calls++

	return f.err
}

func newRestartServer(t *testing.T, restarter httpapi.Restarter) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test", Restart: restarter},
	))
	t.Cleanup(srv.Close)

	return srv
}

func TestDaemonRestart(t *testing.T) {
	t.Run("launch accepted", func(t *testing.T) {
		restarter := &fakeRestarter{}
		srv := newRestartServer(t, restarter)

		got := request(t, srv, http.MethodPost, "/api/daemon/restart", srv.URL, nil)

		if got.status != http.StatusAccepted {
			t.Errorf("response code: got %d, expected %d", got.status, http.StatusAccepted)
		}

		if restarter.calls != 1 {
			t.Errorf("restart launches: got %d, expected 1", restarter.calls)
		}
	})

	t.Run("launch failed", func(t *testing.T) {
		srv := newRestartServer(t, &fakeRestarter{err: errors.New("exec: no such file")})

		got := request(t, srv, http.MethodPost, "/api/daemon/restart", srv.URL, nil)

		if got.status != http.StatusInternalServerError {
			t.Fatalf("response code: got %d, expected %d", got.status, http.StatusInternalServerError)
		}

		var body contract.Error
		got.decode(t, &body)

		if body.Code != contract.ErrInternal {
			t.Errorf("error code: got %q, expected %q", body.Code, contract.ErrInternal)
		}
	})

	t.Run("foreign origin", func(t *testing.T) {
		restarter := &fakeRestarter{}
		srv := newRestartServer(t, restarter)

		got := request(t, srv, http.MethodPost, "/api/daemon/restart", "http://evil.example", nil)

		if got.status != http.StatusForbidden {
			t.Errorf("response code: got %d, expected %d", got.status, http.StatusForbidden)
		}

		if restarter.calls != 0 {
			t.Errorf("a foreign page launched the restart")
		}
	})

	t.Run("no restarter", func(t *testing.T) {
		srv := newRestartServer(t, nil)

		got := request(t, srv, http.MethodPost, "/api/daemon/restart", srv.URL, nil)

		if got.status != http.StatusNotFound {
			t.Errorf("response code: got %d, expected %d", got.status, http.StatusNotFound)
		}
	})
}

// The panel waits for a different instance after a restart: each daemon process has its own,
// and a process keeps it.
func TestStatusInstance(t *testing.T) {
	first := newRestartServer(t, nil)
	second := newRestartServer(t, nil)

	instance := func(srv *httptest.Server) string {
		t.Helper()

		var body contract.Status
		request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &body)

		return body.Instance
	}

	a, again, b := instance(first), instance(first), instance(second)

	if a == "" {
		t.Fatal("status carries no instance")
	}

	if a != again {
		t.Errorf("instance changed within one process: %q, then %q", a, again)
	}

	if a == b {
		t.Errorf("two processes share the instance %q", a)
	}
}
