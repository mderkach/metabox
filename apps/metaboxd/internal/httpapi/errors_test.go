package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
		{"no handler", errNotFound, http.StatusNotFound, contract.ErrNotFound},
		{"foreign origin", errOriginMismatch, http.StatusForbidden, contract.ErrOriginMismatch},
		{"обёрнутый sentinel", fmt.Errorf("маршрут: %w", errNotFound), http.StatusNotFound, contract.ErrNotFound},
		{"no config", config.ErrNoConfig, http.StatusNotFound, contract.ErrConfigMissing},
		{"незнакомая ошибка", errors.New("что-то своё"), http.StatusInternalServerError, contract.ErrInternal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code := statusFor(tt.err)
			if status != tt.wantStatus || code != tt.wantCode {
				t.Errorf("got %d/%q, expected %d/%q", status, code, tt.wantStatus, tt.wantCode)
			}
		})
	}
}

func TestFailHidesUnknownError(t *testing.T) {
	rec := httptest.NewRecorder()

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodGet, "/api/status", nil),
		errors.New("временный файл в /etc/metabox: нет места"))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("code %d, expected %d", rec.Code, http.StatusInternalServerError)
	}
	if body := rec.Body.String(); strings.Contains(body, "/etc/metabox") {
		t.Errorf("body %q: the path on disk does not go outside", body)
	}
}

func TestFailStaysQuietOnCancel(t *testing.T) {
	rec := httptest.NewRecorder()

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodGet, "/api/config", nil), context.Canceled)

	if body := rec.Body.String(); body != "" {
		t.Errorf("body %q, expected empty: there is nobody to answer a client that cancelled the request", body)
	}
}

func TestFailKeepsKnownMessage(t *testing.T) {
	rec := httptest.NewRecorder()

	fail(testLogger(t), rec, httptest.NewRequest(http.MethodGet, "/api/nope", nil), errNotFound)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("code %d, expected %d", rec.Code, http.StatusNotFound)
	}
	if body := rec.Body.String(); !strings.Contains(body, errNotFound.Error()) {
		t.Errorf("body %q, expected the text %q", body, errNotFound.Error())
	}
}
