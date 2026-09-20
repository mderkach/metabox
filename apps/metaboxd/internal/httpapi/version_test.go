package httpapi_test

import (
	"net/http"
	"testing"

	"metabox/internal/config"
)

func TestConfigVersionsList(t *testing.T) {
	reader := fakeReader{versions: []config.Version{
		{ID: 3, Size: 120, Sum: "c3", SavedAt: 300},
		{ID: 2, Size: 110, Sum: "c2", SavedAt: 200},
	}}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config/versions", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
	}

	var body struct {
		Versions []config.Version `json:"versions"`
	}
	got.decode(t, &body)

	if len(body.Versions) != 2 {
		t.Fatalf("версий в ответе %d, ожидали 2", len(body.Versions))
	}

	// Порядок хранилища сохраняется: свежая первой.
	if body.Versions[0].ID != 3 {
		t.Errorf("первая версия %d, ожидали 3", body.Versions[0].ID)
	}

	if body.Versions[0].Sum != "c3" {
		t.Errorf("отпечаток первой версии %q, ожидали %q", body.Versions[0].Sum, "c3")
	}
}

func TestConfigVersionsEmpty(t *testing.T) {
	got := request(t, newTestServerWithReader(t, fakeReader{}), http.MethodGet, "/api/config/versions", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
	}
}

// Версия отдаётся ровно теми байтами, какими лежит: форматирование и порядок
// ключей владельца сохраняются.
func TestConfigVersionContent(t *testing.T) {
	raw := "{\n  \"log\": {\"level\": \"error\"}\n}\n"
	reader := fakeReader{byID: map[int][]byte{7: []byte(raw)}}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config/versions/7", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
	}

	if got.body != raw {
		t.Errorf("содержимое версии: получили %q, ожидали %q", got.body, raw)
	}

	if got.header.Get("Cache-Control") != "no-store" {
		t.Errorf("кэширование версии: %q", got.header.Get("Cache-Control"))
	}
}

func TestConfigVersionNotFound(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"версии нет", "/api/config/versions/42"},
		{"номер не число", "/api/config/versions/abc"},
		{"номер нулевой", "/api/config/versions/0"},
	}

	reader := fakeReader{byID: map[int][]byte{1: []byte("{}")}}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := request(t, newTestServerWithReader(t, reader), http.MethodGet, tt.path, "", nil)

			if got.status != http.StatusNotFound {
				t.Errorf("код ответа: получили %d, ожидали %d", got.status, http.StatusNotFound)
			}
		})
	}
}

// Откат идёт обычным применением: ответ несёт транзакцию, а не «готово».
func TestConfigVersionRestoreStartsApply(t *testing.T) {
	raw := []byte(`{"log":{"level":"warn"}}`)
	applier := &fakeApplier{}
	reader := fakeReader{byID: map[int][]byte{2: raw}}

	srv := newTestServerWith(t, applier, reader, "", nil)
	got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

	if got.status != http.StatusAccepted {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusAccepted)
	}

	if string(applier.received) != string(raw) {
		t.Errorf("в применение ушло %q, ожидали %q", applier.received, raw)
	}
}

func TestConfigVersionRestoreUnknown(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServerWith(t, applier, fakeReader{}, "", nil)

	got := request(t, srv, http.MethodPost, "/api/config/versions/9/restore", srv.URL, nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusNotFound)
	}

	if applier.received != nil {
		t.Errorf("применение запущено на неизвестной версии: %q", applier.received)
	}
}
