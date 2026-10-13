package httpapi_test

import (
	"errors"
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
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}

	var body struct {
		Versions []config.Version `json:"versions"`
	}
	got.decode(t, &body)

	if len(body.Versions) != 2 {
		t.Fatalf("versions in the response %d, expected 2", len(body.Versions))
	}

	// The storage order is preserved: newest first.
	if body.Versions[0].ID != 3 {
		t.Errorf("first version %d, expected 3", body.Versions[0].ID)
	}

	if body.Versions[0].Sum != "c3" {
		t.Errorf("fingerprint of the first version %q, expected %q", body.Versions[0].Sum, "c3")
	}
}

func TestConfigVersionsEmpty(t *testing.T) {
	got := request(t, newTestServerWithReader(t, fakeReader{}), http.MethodGet, "/api/config/versions", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}
}

// A version is returned with exactly the bytes it lies as: the formatting and key order
// of the owner are preserved.
func TestConfigVersionContent(t *testing.T) {
	raw := "{\n  \"log\": {\"level\": \"error\"}\n}\n"
	reader := fakeReader{byID: map[int][]byte{7: []byte(raw)}}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config/versions/7", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}

	if got.body != raw {
		t.Errorf("version content: got %q, expected %q", got.body, raw)
	}

	if got.header.Get("Cache-Control") != "no-store" {
		t.Errorf("version caching: %q", got.header.Get("Cache-Control"))
	}
}

func TestConfigVersionNotFound(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"no such version", "/api/config/versions/42"},
		{"number is not a numeral", "/api/config/versions/abc"},
		{"number is zero", "/api/config/versions/0"},
	}

	reader := fakeReader{byID: map[int][]byte{1: []byte("{}")}}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := request(t, newTestServerWithReader(t, reader), http.MethodGet, tt.path, "", nil)

			if got.status != http.StatusNotFound {
				t.Errorf("response code: got %d, expected %d", got.status, http.StatusNotFound)
			}
		})
	}
}

// A rollback goes as an ordinary apply: the response carries the transaction, not "done".
func TestConfigVersionRestoreStartsApply(t *testing.T) {
	raw := []byte(`{"log":{"level":"warn"}}`)
	applier := &fakeApplier{}
	reader := fakeReader{byID: map[int][]byte{2: raw}}

	srv := newTestServerWith(t, applier, reader, "", nil)
	got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

	if got.status != http.StatusAccepted {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusAccepted)
	}

	if string(applier.received) != string(raw) {
		t.Errorf("%q went to apply, expected %q", applier.received, raw)
	}
}

func TestConfigVersionRestoreUnknown(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServerWith(t, applier, fakeReader{}, "", nil)

	got := request(t, srv, http.MethodPost, "/api/config/versions/9/restore", srv.URL, nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusNotFound)
	}

	if applier.received != nil {
		t.Errorf("apply started on an unknown version: %q", applier.received)
	}
}

func TestConfigVersionsCurrentSum(t *testing.T) {
	applied := []byte("{\"log\": {}}\n")

	t.Run("the fingerprint of the applied config comes next to the versions", func(t *testing.T) {
		got := request(t, newTestServerWithReader(t, fakeReader{data: applied}), http.MethodGet, "/api/config/versions", "", nil)

		var body struct {
			CurrentSum string `json:"current_sum"`
		}
		got.decode(t, &body)

		if want := config.Sum(applied); body.CurrentSum != want {
			t.Errorf("fingerprint %q, expected %q", body.CurrentSum, want)
		}
	})

	t.Run("without a config on the device there is no field, but the list is returned", func(t *testing.T) {
		got := request(t, newTestServerWithReader(t, fakeReader{readErr: config.ErrNoConfig}), http.MethodGet, "/api/config/versions", "", nil)

		if got.status != http.StatusOK {
			t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
		}

		var body map[string]any
		got.decode(t, &body)

		if _, ok := body["current_sum"]; ok {
			t.Errorf("the current_sum field is in the response: %v", body["current_sum"])
		}
	})
}

// A version with a snapshot is restored together with the lists: snapshot files
// are written, current ones beyond the snapshot are deleted, there is no check base.
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
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusAccepted)
	}

	if string(applier.lists.Put["my.json"]) != string(snapshot["my.json"]) || len(applier.lists.Put) != 1 {
		t.Errorf("written %q, expected snapshot files %q", applier.lists.Put, snapshot)
	}

	if want := []string{"late.json"}; !slices.Equal(applier.lists.Remove, want) {
		t.Errorf("deleted %v, expected %v", applier.lists.Remove, want)
	}

	if applier.base != "" || applier.listsBase != "" {
		t.Errorf("restore has check bases %q and %q, expected empty", applier.base, applier.listsBase)
	}
}

// A version saved before list snapshots is restored by the config alone:
// list files stay as they are.
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
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusAccepted)
	}

	if applier.lists.Put != nil || applier.lists.Remove != nil {
		t.Errorf("restoring an old version touched the lists: %+v", applier.lists)
	}

}

// Lists that cannot be read are not guessed by the restore: the apply does not
// start and does not go with the config alone bypassing the snapshot.
func TestConfigVersionRestoreUnreadableLists(t *testing.T) {
	snapshot := map[int]map[string][]byte{2: {"my.json": []byte("{}")}}
	tests := []struct {
		name   string
		reader fakeReader
	}{
		{"снимок версии не читается", fakeReader{versionListsErr: errors.New("снимок")}},
		{"текущие списки не читаются", fakeReader{versionLists: snapshot, listSumsErr: errors.New("списки")}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			applier := &fakeApplier{}
			tt.reader.byID = map[int][]byte{2: []byte("{}")}

			srv := newTestServerWith(t, applier, tt.reader, "", nil)
			got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

			if got.status != http.StatusInternalServerError {
				t.Errorf("response code: got %d, expected %d", got.status, http.StatusInternalServerError)
			}

			if applier.received != nil {
				t.Errorf("apply started: %q", applier.received)
			}
		})
	}
}

// A restore with lists goes through the same working directory check as
// an edit from the editor, and the failure goes with the same code.
func TestConfigVersionRestoreWorkdirMismatch(t *testing.T) {
	applier := &fakeApplier{startErr: &apply.WorkdirError{Workdir: "/usr/share/sing-box", ConfigDir: "/etc/sing-box"}}
	reader := fakeReader{
		byID:         map[int][]byte{2: []byte("{}")},
		versionLists: map[int]map[string][]byte{2: {"my.json": []byte("{}")}},
	}

	srv := newTestServerWith(t, applier, reader, "", nil)
	got := request(t, srv, http.MethodPost, "/api/config/versions/2/restore", srv.URL, nil)

	if got.status != http.StatusConflict {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusConflict)
	}

	var apiErr struct {
		Code string `json:"code"`
	}
	got.decode(t, &apiErr)

	if apiErr.Code != string(contract.ErrWorkdirMismatch) {
		t.Errorf("error code %q, expected %q", apiErr.Code, contract.ErrWorkdirMismatch)
	}
}

// The fingerprint of the current list set goes next to the versions in the same notation
// as the version snapshot fingerprint.
func TestConfigVersionsCurrentListsSum(t *testing.T) {
	sums := map[string]string{"my.json": config.Sum([]byte("{}"))}
	reader := fakeReader{data: []byte("{}"), listSums: sums}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config/versions", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("response code: got %d, expected %d", got.status, http.StatusOK)
	}

	var body contract.Versions
	got.decode(t, &body)

	if want := config.ListsEtag(sums); body.CurrentListsSum != want {
		t.Errorf("lists fingerprint %q, expected %q", body.CurrentListsSum, want)
	}
}
