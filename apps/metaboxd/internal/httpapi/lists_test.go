package httpapi_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"

	"metabox/internal/config"
	"metabox/internal/contract"
)

const applyEnvelopeType = "application/vnd.metabox.apply+json"

func envelopeRequest(t *testing.T, url, body string) *http.Request {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, url+"/api/apply", strings.NewReader(body))
	if err != nil {
		t.Fatalf("сборка запроса: %v", err)
	}

	req.Header.Set("Origin", url)
	req.Header.Set("Content-Type", applyEnvelopeType)

	return req
}

// Конверт применения довозит конфиг, файлы списков и базу набора: null в
// lists означает удаление файла.
func TestApplyEnvelopeCarriesLists(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	body := `{"config":"{\"log\":{}}","lists":{"my.json":"{\"rules\":[]}"},"remove_lists":["gone.json"],"lists_base":"base-1"}`

	resp, err := srv.Client().Do(envelopeRequest(t, srv.URL, body))
	if err != nil {
		t.Fatalf("запрос: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("код %d, ожидали %d", resp.StatusCode, http.StatusAccepted)
	}

	applier.mu.Lock()
	defer applier.mu.Unlock()

	if string(applier.received) != `{"log":{}}` {
		t.Errorf("конфиг доехал как %q", applier.received)
	}
	if string(applier.lists.Put["my.json"]) != `{"rules":[]}` {
		t.Errorf("файл доехал как %q", applier.lists.Put["my.json"])
	}
	if !slices.Equal(applier.lists.Remove, []string{"gone.json"}) {
		t.Errorf("удаления доехали как %v", applier.lists.Remove)
	}
	if applier.listsBase != "base-1" {
		t.Errorf("база набора доехала как %q", applier.listsBase)
	}
}

// Неразобранный конверт — отказ клиенту, а не пустое применение.
func TestApplyEnvelopeRejectsGarbage(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	resp, err := srv.Client().Do(envelopeRequest(t, srv.URL, "не json"))
	if err != nil {
		t.Fatalf("запрос: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("код %d, ожидали %d", resp.StatusCode, http.StatusBadRequest)
	}
}

// Тело без типа конверта читается как голые байты конфига — прежний контракт
// не меняется.
func TestApplyPlainBodyStaysRaw(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	got := applyRequest(t, srv, []byte(`{"log":{}}`))

	if got.status != http.StatusAccepted {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusAccepted)
	}

	applier.mu.Lock()
	defer applier.mu.Unlock()

	if len(applier.lists.Put) != 0 || len(applier.lists.Remove) != 0 {
		t.Errorf("голое тело принесло списки: %v", applier.lists)
	}
}

// Файлы списков отдаются с отпечатком набора: клиент вернёт его в lists_base.
func TestConfigListsServed(t *testing.T) {
	lists := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	srv := newTestServerWithReader(t, fakeReader{data: []byte("{}"), lists: lists})

	got := request(t, srv, http.MethodGet, "/api/config/rule-sets", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusOK)
	}

	var files contract.RuleSetFiles
	got.decode(t, &files)

	if files.Files["my.json"] != `{"rules":[]}` {
		t.Errorf("файл отдан как %q", files.Files["my.json"])
	}

	want := config.ListsEtag(map[string]string{"my.json": config.Sum(lists["my.json"])})
	if files.Etag != want {
		t.Errorf("etag %q, ожидали %q", files.Etag, want)
	}
}
