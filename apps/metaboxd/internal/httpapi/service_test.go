package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/locale"
	"metabox/internal/singbox"
)

// fakeService replaces service control: the init script call itself
// is checked in internal/singbox, here the response codes and the body format matter.
type fakeService struct {
	running    bool
	failed     bool
	uptime     time.Duration
	runningErr error
	failOn     string
	calls      []string
}

func (f *fakeService) State(context.Context) (singbox.State, error) {
	f.calls = append(f.calls, "running")

	if f.runningErr != nil {
		return singbox.State{}, f.runningErr
	}

	return singbox.State{Running: f.running, Failed: f.failed, Uptime: f.uptime}, nil
}

func (f *fakeService) Start(context.Context) error   { return f.act("start") }
func (f *fakeService) Stop(context.Context) error    { return f.act("stop") }
func (f *fakeService) Restart(context.Context) error { return f.act("restart") }

func (f *fakeService) act(action string) error {
	f.calls = append(f.calls, action)

	if f.failOn == action {
		return errors.New("init-скрипт отказал")
	}

	switch action {
	case "start", "restart":
		f.running = true
	case "stop":
		f.running = false
	}

	return nil
}

type serviceBody struct {
	Status        string `json:"status"`
	Uptime        int    `json:"uptime"`
	Binary        string `json:"binary"`
	Managed       bool   `json:"managed"`
	LastError     string `json:"lastError"`
	LastErrorCode string `json:"lastErrorCode"`
}

func newServiceServer(t *testing.T, service httpapi.Service) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test", SingboxVersion: testSingboxVersion, Service: service},
	))
	t.Cleanup(srv.Close)

	return srv
}

func TestServiceState(t *testing.T) {
	tests := []struct {
		name       string
		service    *fakeService
		wantStatus string
		wantError  bool
		wantCode   string
	}{
		{"service up", &fakeService{running: true, uptime: 90 * time.Second}, "running", false, ""},
		{"service stopped", &fakeService{running: false}, "stopped", false, ""},
		{"service failed", &fakeService{running: false, failed: true}, "failed", false, ""},
		{
			"state not read",
			&fakeService{runningErr: errors.New("init-скрипт не найден")},
			"stopped",
			true,
			"service_state_unread",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newServiceServer(t, tt.service)

			got := request(t, srv, http.MethodGet, "/api/service", "", nil)

			// The service poll failed, and the screen must open: this is not
			// a panel failure.
			if got.status != http.StatusOK {
				t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
			}

			var body serviceBody
			got.decode(t, &body)

			if body.Status != tt.wantStatus {
				t.Errorf("state: got %q, expected %q", body.Status, tt.wantStatus)
			}

			if body.Binary != testSingboxVersion {
				t.Errorf("binary version: got %q, expected %q", body.Binary, testSingboxVersion)
			}

			// The age is shown only for a running service: for the others
			// there is nothing to show, and the panel draws zero as a dash.
			if wantUptime := tt.wantStatus == "running"; (body.Uptime > 0) != wantUptime {
				t.Errorf("age: got %d with status %q", body.Uptime, body.Status)
			}

			if hasError := body.LastError != ""; hasError != tt.wantError {
				t.Errorf("rejection reason: got %q, expected presence=%v", body.LastError, tt.wantError)
			}

			if body.LastErrorCode != tt.wantCode {
				t.Errorf("rejection code: got %q, expected %q", body.LastErrorCode, tt.wantCode)
			}
		})
	}
}

func TestServiceAction(t *testing.T) {
	tests := []struct {
		name       string
		action     string
		running    bool
		wantCall   string
		wantStatus string
	}{
		{"start of a stopped one", "start", false, "start", "running"},
		{"restart of a running one", "restart", true, "restart", "running"},
		{"stop of a running one", "stop", true, "stop", "stopped"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &fakeService{running: tt.running}
			srv := newServiceServer(t, service)

			got := request(t, srv, http.MethodPost, "/api/service/"+tt.action, srv.URL, nil)

			if got.status != http.StatusOK {
				t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
			}

			if len(service.calls) == 0 || service.calls[0] != tt.wantCall {
				t.Fatalf("init script calls: got %v, expected first %q", service.calls, tt.wantCall)
			}

			// The response carries the new state: the panel must not make
			// a separate request for it.
			var body serviceBody
			got.decode(t, &body)

			if body.Status != tt.wantStatus {
				t.Errorf("state after the action: got %q, expected %q", body.Status, tt.wantStatus)
			}
		})
	}
}

func TestServiceActionRejected(t *testing.T) {
	t.Run("unknown action", func(t *testing.T) {
		service := &fakeService{running: true}
		srv := newServiceServer(t, service)

		got := request(t, srv, http.MethodPost, "/api/service/reload", srv.URL, nil)

		if got.status != http.StatusNotFound {
			t.Errorf("response code: got %d, expected %d", got.status, http.StatusNotFound)
		}

		if len(service.calls) != 0 {
			t.Errorf("the init script was called on an unknown action: %v", service.calls)
		}
	})

	t.Run("action rejected by the init script", func(t *testing.T) {
		srv := newServiceServer(t, &fakeService{failOn: "restart"})

		got := request(t, srv, http.MethodPost, "/api/service/restart", srv.URL, nil)

		if got.status != http.StatusInternalServerError {
			t.Errorf("response code: got %d, expected %d", got.status, http.StatusInternalServerError)
		}
	})
}

// Without the dependency service control does not appear: the panel opens, and
// the service card stays empty.
func TestServiceAbsent(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test"},
	))
	t.Cleanup(srv.Close)

	got := request(t, srv, http.MethodGet, "/api/service", "", nil)

	if got.status != http.StatusNotFound {
		t.Errorf("response code: got %d, expected %d", got.status, http.StatusNotFound)
	}
}

// Routing on the device may be owned by another service that starts the same
// binary, and procd knows nothing about it.
func TestServiceStateObservedRuntime(t *testing.T) {
	tests := []struct {
		name        string
		running     bool
		observed    bool
		wantStatus  string
		wantManaged bool
	}{
		{"the service owns the process", true, true, "running", true},
		{"process alive outside the service", false, true, "running", false},
		{"no process", false, false, "stopped", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(httpapi.NewServer(
				&fakeApplier{},
				fakeReader{},
				testLogger(t),
				httpapi.Options{
					Version:        "test",
					SingboxVersion: testSingboxVersion,
					Service:        &fakeService{running: tt.running, uptime: time.Minute},
					Runtime:        func(context.Context) bool { return tt.observed },
				},
			))
			t.Cleanup(srv.Close)

			var body serviceBody
			request(t, srv, http.MethodGet, "/api/service", "", nil).decode(t, &body)

			if body.Status != tt.wantStatus {
				t.Errorf("state: got %q, expected %q", body.Status, tt.wantStatus)
			}

			if body.Managed != tt.wantManaged {
				t.Errorf("process ownership: got %v, expected %v", body.Managed, tt.wantManaged)
			}
		})
	}
}

func TestServiceStateFollowsLang(t *testing.T) {
	tests := []struct {
		lang locale.Lang
		want string
	}{
		{locale.English, "service state not read"},
		{locale.Russian, "состояние службы не прочитано"},
	}

	for _, tt := range tests {
		body, ok := httpapi.ServiceState(singbox.State{}, testSingboxVersion, context.DeadlineExceeded, false, tt.lang).(contract.Service)
		if !ok || body.LastError != tt.want {
			t.Errorf("%s: last error %q, want %q", tt.lang, body.LastError, tt.want)
		}
	}
}

// A procd read failure is not a stop: the status in such a response is substituted, and
// the panel tells it from an observed one only by the reason code. The code must
// arrive on any error, including when a live process is visible and the service
// poll just did not fit in the timeout.
func TestServiceStateUnreadCarriesCode(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		observed bool
		wantCode contract.ServiceErrorCode
	}{
		{"init-скрипт не ответил", errors.New("init-скрипт не найден"), false, contract.ServiceStateUnread},
		{"poll did not fit in the timeout", context.DeadlineExceeded, true, contract.ServiceStateUnread},
		{"poll cancelled", context.Canceled, true, contract.ServiceStateUnread},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, ok := httpapi.ServiceState(singbox.State{}, testSingboxVersion, tt.err, tt.observed, locale.English).(contract.Service)
			if !ok {
				t.Fatal("response body is not contract.Service")
			}

			if body.LastErrorCode != tt.wantCode {
				t.Errorf("reason code: got %q, expected %q", body.LastErrorCode, tt.wantCode)
			}

			if body.LastError == "" {
				t.Error("no rejection details")
			}
		})
	}
}
