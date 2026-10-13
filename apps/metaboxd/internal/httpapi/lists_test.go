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
		t.Fatalf("building the request: %v", err)
	}

	req.Header.Set("Origin", url)
	req.Header.Set("Content-Type", applyEnvelopeType)

	return req
}

// The apply envelope carries the config, list files and the set base: null in
// lists means deleting the file.
func TestApplyEnvelopeCarriesLists(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	body := `{"config":"{\"log\":{}}","lists":{"my.json":"{\"rules\":[]}"},"remove_lists":["gone.json"],"lists_base":"base-1"}`

	resp, err := srv.Client().Do(envelopeRequest(t, srv.URL, body))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("code %d, expected %d", resp.StatusCode, http.StatusAccepted)
	}

	applier.mu.Lock()
	defer applier.mu.Unlock()

	if string(applier.received) != `{"log":{}}` {
		t.Errorf("config arrived as %q", applier.received)
	}
	if string(applier.lists.Put["my.json"]) != `{"rules":[]}` {
		t.Errorf("file arrived as %q", applier.lists.Put["my.json"])
	}
	if !slices.Equal(applier.lists.Remove, []string{"gone.json"}) {
		t.Errorf("deletions arrived as %v", applier.lists.Remove)
	}
	if applier.listsBase != "base-1" {
		t.Errorf("rule set base arrived as %q", applier.listsBase)
	}
}

// An unparsed envelope is a client failure, not an empty apply.
func TestApplyEnvelopeRejectsGarbage(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	resp, err := srv.Client().Do(envelopeRequest(t, srv.URL, "не json"))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("code %d, expected %d", resp.StatusCode, http.StatusBadRequest)
	}
}

// A body without the envelope type is read as bare config bytes: the previous contract
// does not change.
func TestApplyPlainBodyStaysRaw(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	got := applyRequest(t, srv, []byte(`{"log":{}}`))

	if got.status != http.StatusAccepted {
		t.Fatalf("code %d, expected %d", got.status, http.StatusAccepted)
	}

	applier.mu.Lock()
	defer applier.mu.Unlock()

	if len(applier.lists.Put) != 0 || len(applier.lists.Remove) != 0 {
		t.Errorf("a bare body brought lists: %v", applier.lists)
	}
}

// List files are returned with the set fingerprint: the client returns it in lists_base.
func TestConfigListsServed(t *testing.T) {
	lists := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	srv := newTestServerWithReader(t, fakeReader{data: []byte("{}"), lists: lists})

	got := request(t, srv, http.MethodGet, "/api/config/rule-sets", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("code %d, expected %d", got.status, http.StatusOK)
	}

	var files contract.RuleSetFiles
	got.decode(t, &files)

	if files.Files["my.json"] != `{"rules":[]}` {
		t.Errorf("file returned as %q", files.Files["my.json"])
	}

	want := config.ListsEtag(map[string]string{"my.json": config.Sum(lists["my.json"])})
	if files.Etag != want {
		t.Errorf("etag %q, expected %q", files.Etag, want)
	}
}
