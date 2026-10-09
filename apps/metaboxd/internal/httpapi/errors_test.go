package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
)

func TestStatusFor(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   contract.ErrorCode
	}{
		{"ручки нет", errNotFound, http.StatusNotFound, contract.ErrNotFound},
		{"чужой источник", errOriginMismatch, http.StatusForbidden, contract.ErrOriginMismatch},
		{"обёрнутый sentinel", fmt.Errorf("маршрут: %w", errNotFound), http.StatusNotFound, contract.ErrNotFound},
		{"конфига нет", config.ErrNoConfig, http.StatusNotFound, contract.ErrConfigMissing},
		{"незнакомая ошибка", errors.New("что-то своё"), http.StatusInternalServerError, contract.ErrInternal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code := statusFor(tt.err)
			if status != tt.wantStatus || code != tt.wantCode {
				t.Errorf("получили %d/%q, ожидали %d/%q", status, code, tt.wantStatus, tt.wantCode)
			}
		})
	}
}

func TestFailHidesUnknownError(t *testing.T) {
	rec := httptest.NewRecorder()

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodGet, "/api/status", nil),
		errors.New("временный файл в /etc/metabox: нет места"))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusInternalServerError)
	}
	if body := rec.Body.String(); strings.Contains(body, "/etc/metabox") {
		t.Errorf("тело %q: путь на диске наружу не идёт", body)
	}
}

func TestFailStaysQuietOnCancel(t *testing.T) {
	rec := httptest.NewRecorder()

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodGet, "/api/config", nil), context.Canceled)

	if body := rec.Body.String(); body != "" {
		t.Errorf("тело %q, ожидали пустое: отвечать отменившему запрос клиенту некому", body)
	}
}

func TestFailKeepsKnownMessage(t *testing.T) {
	rec := httptest.NewRecorder()

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodGet, "/api/nope", nil), errNotFound)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusNotFound)
	}
	if body := rec.Body.String(); !strings.Contains(body, errNotFound.Error()) {
		t.Errorf("тело %q, ожидали текст %q", body, errNotFound.Error())
	}
}

// Служба на чужом конфиге — отдельный код, а пути её команды остаются в логе.
func TestFailHidesLaunchPaths(t *testing.T) {
	rec := httptest.NewRecorder()
	err := fmt.Errorf("применение: %w", &apply.LaunchError{
		Configs: []string{"/var/run/homeproxy/sing-box-c.json"},
		Config:  "/etc/sing-box/config.json",
	})

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodPost, "/api/apply", nil), err)

	if rec.Code != http.StatusConflict {
		t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusConflict)
	}

	body := rec.Body.String()
	if !strings.Contains(body, string(contract.ErrLaunchMismatch)) {
		t.Errorf("тело %q, ожидали код %q", body, contract.ErrLaunchMismatch)
	}
	if strings.Contains(body, "/var/run") || strings.Contains(body, "/etc/sing-box") {
		t.Errorf("тело %q: пути команды службы наружу не идут", body)
	}
}
