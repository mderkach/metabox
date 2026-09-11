package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"metabox/internal/httpapi"
	"metabox/internal/singbox"
)

// fakeService подменяет управление сервисом: сам вызов init-скрипта
// проверяется в internal/singbox, здесь важны коды ответов и формат тела.
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
	Status    string `json:"status"`
	Uptime    int    `json:"uptime"`
	Binary    string `json:"binary"`
	LastError string `json:"lastError"`
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
	}{
		{"сервис поднят", &fakeService{running: true, uptime: 90 * time.Second}, "running", false},
		{"сервис остановлен", &fakeService{running: false}, "stopped", false},
		{"сервис упал", &fakeService{running: false, failed: true}, "failed", false},
		{
			"состояние не прочитано",
			&fakeService{runningErr: errors.New("init-скрипт не найден")},
			"stopped",
			true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newServiceServer(t, tt.service)

			got := request(t, srv, http.MethodGet, "/api/service", "", nil)

			// Опрос сервиса упал, а экран обязан открыться (NFR-1): отказом
			// панели это не является.
			if got.status != http.StatusOK {
				t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
			}

			var body serviceBody
			got.decode(t, &body)

			if body.Status != tt.wantStatus {
				t.Errorf("состояние: получили %q, ожидали %q", body.Status, tt.wantStatus)
			}

			if body.Binary != testSingboxVersion {
				t.Errorf("версия бинаря: получили %q, ожидали %q", body.Binary, testSingboxVersion)
			}

			// Возраст показывается только у поднятого сервиса: у остальных
			// показывать нечего, и ноль панель рисует прочерком.
			if wantUptime := tt.wantStatus == "running"; (body.Uptime > 0) != wantUptime {
				t.Errorf("возраст: получили %d при статусе %q", body.Uptime, body.Status)
			}

			if hasError := body.LastError != ""; hasError != tt.wantError {
				t.Errorf("причина отказа: получили %q, ожидали наличие=%v", body.LastError, tt.wantError)
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
		{"запуск остановленного", "start", false, "start", "running"},
		{"рестарт поднятого", "restart", true, "restart", "running"},
		{"остановка поднятого", "stop", true, "stop", "stopped"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &fakeService{running: tt.running}
			srv := newServiceServer(t, service)

			got := request(t, srv, http.MethodPost, "/api/service/"+tt.action, srv.URL, nil)

			if got.status != http.StatusOK {
				t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
			}

			if len(service.calls) == 0 || service.calls[0] != tt.wantCall {
				t.Fatalf("вызовы init-скрипта: получили %v, ожидали первым %q", service.calls, tt.wantCall)
			}

			// Ответ несёт новое состояние: отдельный запрос за ним панель
			// делать не должна.
			var body serviceBody
			got.decode(t, &body)

			if body.Status != tt.wantStatus {
				t.Errorf("состояние после действия: получили %q, ожидали %q", body.Status, tt.wantStatus)
			}
		})
	}
}

func TestServiceActionRejected(t *testing.T) {
	t.Run("неизвестное действие", func(t *testing.T) {
		service := &fakeService{running: true}
		srv := newServiceServer(t, service)

		got := request(t, srv, http.MethodPost, "/api/service/reload", srv.URL, nil)

		if got.status != http.StatusNotFound {
			t.Errorf("код ответа: получили %d, ожидали %d", got.status, http.StatusNotFound)
		}

		if len(service.calls) != 0 {
			t.Errorf("init-скрипт вызван на неизвестном действии: %v", service.calls)
		}
	})

	t.Run("действие отклонено init-скриптом", func(t *testing.T) {
		srv := newServiceServer(t, &fakeService{failOn: "restart"})

		got := request(t, srv, http.MethodPost, "/api/service/restart", srv.URL, nil)

		if got.status != http.StatusInternalServerError {
			t.Errorf("код ответа: получили %d, ожидали %d", got.status, http.StatusInternalServerError)
		}
	})
}

// Без зависимости управление сервисом не появляется: панель открывается, а
// карточка сервиса остаётся пустой.
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
		t.Errorf("код ответа: получили %d, ожидали %d", got.status, http.StatusNotFound)
	}
}
