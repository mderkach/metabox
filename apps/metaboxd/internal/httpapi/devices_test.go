package httpapi_test

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/devices"
	"metabox/internal/httpapi"
)

const testLeases = "2000000000 aa:bb:cc:00:00:01 192.168.1.10 phone *\n"

// newDevicesServer starts the layer on top of a real device list: the name write
// is checked together with the file in the service directory, not on a fake.
func newDevicesServer(t *testing.T, stateDir, leases string) *httptest.Server {
	t.Helper()

	store, err := config.NewStore(filepath.Join(t.TempDir(), "sing-box"), "config.json", stateDir)
	if err != nil {
		t.Fatal(err)
	}

	noStatic := func(context.Context, string, ...string) (string, int, error) { return "", 1, nil }

	registry, err := devices.New(t.Context(), noStatic, store, devices.Options{
		Leases: leases,
		UCI:    "/sbin/uci",
		Now:    func() time.Time { return time.Unix(1500000000, 0) },
	})
	if err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version: "test",
		Devices: registry,
	}))
	t.Cleanup(srv.Close)

	return srv
}

func TestDevicesNameSurvivesRestart(t *testing.T) {
	stateDir := t.TempDir()
	leases := filepath.Join(t.TempDir(), "dhcp.leases")
	if err := os.WriteFile(leases, []byte(testLeases), 0o600); err != nil {
		t.Fatal(err)
	}

	srv := newDevicesServer(t, stateDir, leases)

	got := request(t, srv, http.MethodPut, "/api/devices/AA:BB:CC:00:00:01", srv.URL, []byte(`{"name":"Телефон"}`))
	if got.status != http.StatusOK {
		t.Fatalf("edit code %d, body %s", got.status, got.body)
	}

	var put contract.Devices
	got.decode(t, &put)

	if len(put.Devices) != 1 || put.Devices[0].Name != "Телефон" || put.Devices[0].NameSource != devices.SourceCustom {
		t.Errorf("edit response %+v", put)
	}

	restarted := newDevicesServer(t, stateDir, leases)

	got = request(t, restarted, http.MethodGet, "/api/devices", "", nil)
	if got.status != http.StatusOK {
		t.Fatalf("list code %d, body %s", got.status, got.body)
	}

	var list contract.Devices
	got.decode(t, &list)

	if len(list.Devices) != 1 || list.Devices[0].Name != "Телефон" || list.Devices[0].IP != "192.168.1.10" {
		t.Errorf("name did not survive the restart: %+v", list)
	}
}

func TestDevicesRenameRejects(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		origin bool
		body   string
		status int
		code   contract.ErrorCode
	}{
		{"invalid MAC", "/api/devices/router", true, `{"name":"x"}`, http.StatusBadRequest, contract.ErrDeviceInvalid},
		{"body is not JSON", "/api/devices/aa:bb:cc:00:00:01", true, `name`, http.StatusBadRequest, contract.ErrDeviceInvalid},
		{"control character in the name", "/api/devices/aa:bb:cc:00:00:01", true, `{"name":"a\u0007"}`, http.StatusBadRequest, contract.ErrDeviceInvalid},
		{"no Origin", "/api/devices/aa:bb:cc:00:00:01", false, `{"name":"x"}`, http.StatusForbidden, contract.ErrOriginMismatch},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stateDir := filepath.Join(t.TempDir(), "metabox")
			srv := newDevicesServer(t, stateDir, filepath.Join(t.TempDir(), "absent"))

			origin := ""
			if tt.origin {
				origin = srv.URL
			}

			got := request(t, srv, http.MethodPut, tt.path, origin, []byte(tt.body))
			if got.status != tt.status {
				t.Fatalf("code %d, expected %d; body %s", got.status, tt.status, got.body)
			}

			var body contract.Error
			got.decode(t, &body)

			if body.Code != tt.code {
				t.Errorf("rejection code %q, expected %q", body.Code, tt.code)
			}

			if _, err := os.Stat(filepath.Join(stateDir, "devices.json")); !errors.Is(err, fs.ErrNotExist) {
				t.Errorf("a rejected edit left the names file: %v", err)
			}
		})
	}
}

func TestDevicesAbsent(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	if got := request(t, srv, http.MethodGet, "/api/devices", "", nil); got.status != http.StatusNotFound {
		t.Errorf("without a device list the handler answered %d, expected 404", got.status)
	}
}
