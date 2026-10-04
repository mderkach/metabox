package httpapi_test

import (
	"net/http"
	"slices"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
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

func TestConfigVersionsCurrentSum(t *testing.T) {
	applied := []byte("{\"log\": {}}\n")

	t.Run("отпечаток применённого конфига идёт рядом с версиями", func(t *testing.T) {
		got := request(t, newTestServerWithReader(t, fakeReader{data: applied}), http.MethodGet, "/api/config/versions", "", nil)

		var body struct {
			CurrentSum string `json:"current_sum"`
		}
		got.decode(t, &body)

		if want := config.Sum(applied); body.CurrentSum != want {
			t.Errorf("отпечаток %q, ожидали %q", body.CurrentSum, want)
		}
	})

	t.Run("без конфига на устройстве поля нет, а список отдаётся", func(t *testing.T) {
		got := request(t, newTestServerWithReader(t, fakeReader{readErr: config.ErrNoConfig}), http.MethodGet, "/api/config/versions", "", nil)

		if got.status != http.StatusOK {
			t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
		}

		var body map[string]any
		got.decode(t, &body)

		if _, ok := body["current_sum"]; ok {
			t.Errorf("поле current_sum есть в ответе: %v", body["current_sum"])
		}
	})
}

// Версия со снимком восстанавливается вместе со списками: файлы снимка
// пишутся, текущие сверх снимка удаляются, базы сверки нет.
func TestConfigVersionRestoreCarriesLists(t *testing.T) {
	raw := []byte(`{"log":{"level":"warn"}}`)
	snapshot := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	applier := &fakeApplier{}
	reader := fakeReader{
		byID:         map[int][]byte{2: raw},
		versionLists: map[int]map[string][]byte{2: snapshot},
		listSums:     map[string]string{"my.json": "x", "late.json": "y"},
	}

	srv := newTestServerWith(t, applier, reader, "", nil)
	got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

	if got.status != http.StatusAccepted {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusAccepted)
	}

	if string(applier.lists.Put["my.json"]) != string(snapshot["my.json"]) || len(applier.lists.Put) != 1 {
		t.Errorf("пишутся %q, ожидали файлы снимка %q", applier.lists.Put, snapshot)
	}

	if want := []string{"late.json"}; !slices.Equal(applier.lists.Remove, want) {
		t.Errorf("удаляются %v, ожидали %v", applier.lists.Remove, want)
	}

	if applier.base != "" || applier.listsBase != "" {
		t.Errorf("у восстановления базы сверки %q и %q, ожидали пусто", applier.base, applier.listsBase)
	}
}

// Версия, сохранённая до снимков списков, восстанавливается одним конфигом:
// файлы списков остаются как есть.
func TestConfigVersionRestoreLegacyKeepsLists(t *testing.T) {
	raw := []byte(`{"log":{"level":"warn"}}`)
	applier := &fakeApplier{}
	reader := fakeReader{
		byID:     map[int][]byte{2: raw},
		listSums: map[string]string{"my.json": "x"},
	}

	srv := newTestServerWith(t, applier, reader, "", nil)
	got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

	if got.status != http.StatusAccepted {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusAccepted)
	}

	if applier.lists.Put != nil || applier.lists.Remove != nil {
		t.Errorf("восстановление старой версии тронуло списки: %+v", applier.lists)
	}
}

// Восстановление со списками проходит ту же сверку рабочего каталога, что и
// правка из редактора, и отказ уходит тем же кодом.
func TestConfigVersionRestoreWorkdirMismatch(t *testing.T) {
	applier := &fakeApplier{startErr: &apply.WorkdirError{Workdir: "/usr/share/sing-box", ConfigDir: "/etc/sing-box"}}
	reader := fakeReader{
		byID:         map[int][]byte{2: []byte("{}")},
		versionLists: map[int]map[string][]byte{2: {"my.json": []byte("{}")}},
	}

	srv := newTestServerWith(t, applier, reader, "", nil)
	got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

	if got.status != http.StatusConflict {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusConflict)
	}

	var apiErr struct {
		Code string `json:"code"`
	}
	got.decode(t, &apiErr)

	if apiErr.Code != string(contract.ErrWorkdirMismatch) {
		t.Errorf("код ошибки %q, ожидали %q", apiErr.Code, contract.ErrWorkdirMismatch)
	}
}

// Отпечаток текущего набора списков идёт рядом с версиями в той же записи,
// что и отпечаток снимка версии.
func TestConfigVersionsCurrentListsSum(t *testing.T) {
	sums := map[string]string{"my.json": config.Sum([]byte("{}"))}
	reader := fakeReader{data: []byte("{}"), listSums: sums}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config/versions", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
	}

	var body contract.Versions
	got.decode(t, &body)

	if want := config.ListsEtag(sums); body.CurrentListsSum != want {
		t.Errorf("отпечаток списков %q, ожидали %q", body.CurrentListsSum, want)
	}
}
