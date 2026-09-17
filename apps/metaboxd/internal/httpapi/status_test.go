package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"metabox/internal/contract"
	"metabox/internal/httpapi"
)

func newStatusServer(t *testing.T, opts httpapi.Options) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), opts))
	t.Cleanup(srv.Close)

	return srv
}

// Панель обязана различать «источник другой» и «данных нет», поэтому состав
// источников идёт контрактом, а не угадывается по наличию данных.
func TestStatusReportsRuntimeSources(t *testing.T) {
	stub := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})

	tests := []struct {
		name        string
		opts        httpapi.Options
		sources     []contract.RuntimeSource
		connections contract.RuntimeSource
	}{
		{
			name:        "поток собран",
			opts:        httpapi.Options{Events: stub, Clash: stub},
			sources:     []contract.RuntimeSource{contract.SourceClashAPI},
			connections: contract.SourceClashAPI,
		},
		{
			name:    "только прокси",
			opts:    httpapi.Options{Clash: stub},
			sources: []contract.RuntimeSource{contract.SourceClashAPI},
		},
		{
			name:    "рантайма нет",
			opts:    httpapi.Options{},
			sources: []contract.RuntimeSource{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := request(t, newStatusServer(t, tt.opts), http.MethodGet, "/api/status", "", nil)

			if got.status != http.StatusOK {
				t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
			}

			var body contract.Status
			got.decode(t, &body)

			if len(body.Runtime.Sources) != len(tt.sources) {
				t.Fatalf("источники %v, ожидали %v", body.Runtime.Sources, tt.sources)
			}

			for i, want := range tt.sources {
				if body.Runtime.Sources[i] != want {
					t.Errorf("источник %d: получили %q, ожидали %q", i, body.Runtime.Sources[i], want)
				}
			}

			if body.Runtime.Connections != tt.connections {
				t.Errorf("источник соединений %q, ожидали %q", body.Runtime.Connections, tt.connections)
			}
		})
	}
}

func TestStatusSourcesAreListEvenWhenEmpty(t *testing.T) {
	got := request(t, newStatusServer(t, httpapi.Options{}), http.MethodGet, "/api/status", "", nil)

	var body struct {
		Runtime struct {
			Sources []contract.RuntimeSource `json:"sources"`
		} `json:"runtime"`
	}
	got.decode(t, &body)

	if body.Runtime.Sources == nil {
		t.Error("список источников пришёл как null, ожидали пустой массив")
	}
}
