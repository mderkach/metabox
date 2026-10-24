package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/locale"
)

func TestErrorMessageFollowsLang(t *testing.T) {
	tests := []struct {
		lang        locale.Lang
		wantMissing string
		wantOrigin  string
	}{
		{locale.English, "endpoint not found", "request origin does not match the panel address"},
		{locale.Russian, "ручка не найдена", "источник запроса не совпадает с адресом панели"},
	}

	for _, tt := range tests {
		t.Run(string(tt.lang), func(t *testing.T) {
			srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
				Version: "test",
				Lang:    tt.lang,
			}))
			t.Cleanup(srv.Close)

			// Refused by a handler and by the middleware: both reach the same error writer.
			for _, c := range []struct {
				method, origin, want string
				code                 contract.ErrorCode
			}{
				{http.MethodGet, "", tt.wantMissing, contract.ErrNotFound},
				{http.MethodPost, "http://evil.example", tt.wantOrigin, contract.ErrOriginMismatch},
			} {
				var got contract.Error

				request(t, srv, c.method, "/api/nope", c.origin, nil).decode(t, &got)

				if got.Code != c.code || got.Message != c.want {
					t.Errorf("%s: got %q %q, want %q %q", c.method, got.Code, got.Message, c.code, c.want)
				}
			}
		})
	}
}
