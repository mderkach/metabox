package devices_test

import (
	"context"
	"errors"
	"io/fs"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"metabox/internal/config"
	"metabox/internal/devices"
)

const (
	testUCI    = "/sbin/uci"
	leasesFile = "testdata/dhcp.leases"
)

// testNow lies between the lease expiries of the fixture: 1000000000 has already expired,
// 2000000000 has not yet.
var testNow = time.Unix(1500000000, 0)

type fakeRunner struct {
	stdout string
	code   int
	err    error
	calls  [][]string
}

func (f *fakeRunner) run(_ context.Context, name string, args ...string) (string, int, error) {
	f.calls = append(f.calls, append([]string{name}, args...))

	return f.stdout, f.code, f.err
}

func uciFixture(t *testing.T) *fakeRunner {
	t.Helper()

	data, err := os.ReadFile("testdata/uci-dhcp.txt")
	if err != nil {
		t.Fatal(err)
	}

	return &fakeRunner{stdout: string(data)}
}

func newStore(t *testing.T, stateDir string) *config.Store {
	t.Helper()

	store, err := config.NewStore(filepath.Join(t.TempDir(), "sing-box"), "config.json", stateDir)
	if err != nil {
		t.Fatal(err)
	}

	return store
}

func newRegistry(t *testing.T, runner *fakeRunner, store devices.Store, leases string) *devices.Registry {
	t.Helper()

	registry, err := devices.New(t.Context(), runner.run, store, devices.Options{
		Leases: leases,
		UCI:    testUCI,
		Now:    func() time.Time { return testNow },
	})
	if err != nil {
		t.Fatalf("device list build: %v", err)
	}

	return registry
}

func byMAC(t *testing.T, list []devices.Device) map[string]devices.Device {
	t.Helper()

	out := make(map[string]devices.Device, len(list))
	for _, d := range list {
		out[d.MAC] = d
	}

	return out
}

func TestListMergesLeasesAndStaticHosts(t *testing.T) {
	runner := uciFixture(t)
	registry := newRegistry(t, runner, newStore(t, t.TempDir()), leasesFile)

	list, err := registry.List(t.Context())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	want := map[string]devices.Device{
		"aa:bb:cc:00:00:01": {
			IP: "192.168.1.10", MAC: "aa:bb:cc:00:00:01", Name: "phone",
			NameSource: devices.SourceDHCP, Online: true, LeaseExpires: 2000000000,
		},
		"aa:bb:cc:00:00:02": {
			IP: "192.168.1.11", MAC: "aa:bb:cc:00:00:02",
			NameSource: devices.SourceNone, Online: true, LeaseExpires: 2000000000,
		},
		"aa:bb:cc:00:00:03": {
			IP: "192.168.1.12", MAC: "aa:bb:cc:00:00:03", Name: "old-tv",
			NameSource: devices.SourceDHCP, LeaseExpires: 1000000000,
		},
		"aa:bb:cc:00:00:04": {
			IP: "192.168.1.20", MAC: "aa:bb:cc:00:00:04", Name: "laptop",
			NameSource: devices.SourceStatic, Static: true, Online: true, LeaseExpires: 2000000000,
		},
		"aa:bb:cc:00:00:05": {
			IP: "192.168.1.20", MAC: "aa:bb:cc:00:00:05", Name: "laptop",
			NameSource: devices.SourceStatic, Static: true,
		},
		"aa:bb:cc:00:00:06": {
			IP: "192.168.1.36", MAC: "aa:bb:cc:00:00:06", Name: "printer",
			NameSource: devices.SourceStatic, Static: true,
		},
		"aa:bb:cc:00:00:07": {
			IP: "192.168.1.30", MAC: "aa:bb:cc:00:00:07", Name: "nas",
			NameSource: devices.SourceDHCP, Online: true,
		},
		"aa:bb:cc:00:00:08": {
			IP: "192.168.1.50", MAC: "aa:bb:cc:00:00:08", Name: "o'brien",
			NameSource: devices.SourceStatic, Static: true,
		},
		"aa:bb:cc:00:00:09": {
			IP: "192.168.1.50", MAC: "aa:bb:cc:00:00:09", Name: "o'brien",
			NameSource: devices.SourceStatic, Static: true,
		},
	}

	got := byMAC(t, list)
	if len(got) != len(want) {
		t.Errorf("devices %d, expected %d: %+v", len(got), len(want), list)
	}

	tests := []struct {
		name string
		mac  string
	}{
		{"lease with a name", "aa:bb:cc:00:00:01"},
		{"lease without a name", "aa:bb:cc:00:00:02"},
		{"expired lease offline", "aa:bb:cc:00:00:03"},
		{"static overrides DHCP", "aa:bb:cc:00:00:04"},
		{"second MAC of a static entry as a list", "aa:bb:cc:00:00:05"},
		{"static without a lease", "aa:bb:cc:00:00:06"},
		{"permanent lease online", "aa:bb:cc:00:00:07"},
		{"two MACs separated by a space and a quote in the name", "aa:bb:cc:00:00:08"},
		{"second MAC separated by a space", "aa:bb:cc:00:00:09"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got[tt.mac] != want[tt.mac] {
				t.Errorf("got %+v, expected %+v", got[tt.mac], want[tt.mac])
			}
		})
	}

	for i := 1; i < len(list); i++ {
		prev, cur := netip.MustParseAddr(list[i-1].IP), netip.MustParseAddr(list[i].IP)
		if prev.Compare(cur) > 0 {
			t.Errorf("list is not ordered by address: %s before %s", prev, cur)
		}
	}

	if len(runner.calls) != 1 || strings.Join(runner.calls[0], " ") != testUCI+" -q show dhcp" {
		t.Errorf("uci calls: %v", runner.calls)
	}
}

func TestCustomNameOverridesStaticAndSurvivesRestart(t *testing.T) {
	stateDir := filepath.Join(t.TempDir(), "metabox")
	store := newStore(t, stateDir)

	registry := newRegistry(t, uciFixture(t), store, leasesFile)

	if err := registry.Rename(t.Context(), "AA-BB-CC-00-00-06", "  Принтер в коридоре "); err != nil {
		t.Fatalf("name edit: %v", err)
	}

	if err := registry.Rename(t.Context(), "aa:bb:cc:00:00:0a", "планшет"); err != nil {
		t.Fatalf("edit of a device name without a lease: %v", err)
	}

	if _, err := os.Stat(filepath.Join(stateDir, "devices.json")); err != nil {
		t.Fatalf("names file not written: %v", err)
	}

	restarted := newRegistry(t, uciFixture(t), newStore(t, stateDir), leasesFile)

	list, err := restarted.List(t.Context())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	got := byMAC(t, list)

	printer := got["aa:bb:cc:00:00:06"]
	if printer.Name != "Принтер в коридоре" || printer.NameSource != devices.SourceCustom || !printer.Static {
		t.Errorf("own name did not override the static one after a restart: %+v", printer)
	}

	tablet := got["aa:bb:cc:00:00:0a"]
	if tablet.Name != "планшет" || tablet.IP != "" || tablet.Online {
		t.Errorf("device with its own name and no lease: %+v", tablet)
	}

	if last := list[len(list)-1]; last.MAC != "aa:bb:cc:00:00:0a" {
		t.Errorf("device without an address is not at the end: %+v", last)
	}

	if err := restarted.Rename(t.Context(), "aa:bb:cc:00:00:06", ""); err != nil {
		t.Fatalf("name reset: %v", err)
	}

	list, err = restarted.List(t.Context())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if printer := byMAC(t, list)["aa:bb:cc:00:00:06"]; printer.Name != "printer" || printer.NameSource != devices.SourceStatic {
		t.Errorf("empty name did not restore the static one: %+v", printer)
	}
}

func TestRenameRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name string
		mac  string
		dev  string
		want error
	}{
		{"not a MAC", "router", "x", devices.ErrInvalidMAC},
		{"eight-byte MAC", "aa:bb:cc:dd:ee:ff:00:11", "x", devices.ErrInvalidMAC},
		{"name longer than the ceiling", "aa:bb:cc:00:00:01", strings.Repeat("я", 65), devices.ErrInvalidName},
		{"control character", "aa:bb:cc:00:00:01", "a\nb", devices.ErrInvalidName},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stateDir := filepath.Join(t.TempDir(), "metabox")
			registry := newRegistry(t, uciFixture(t), newStore(t, stateDir), leasesFile)

			if err := registry.Rename(t.Context(), tt.mac, tt.dev); !errors.Is(err, tt.want) {
				t.Errorf("error %v, expected %v", err, tt.want)
			}

			if _, err := os.Stat(filepath.Join(stateDir, "devices.json")); !errors.Is(err, fs.ErrNotExist) {
				t.Errorf("a rejected edit left a file: %v", err)
			}
		})
	}
}

type failingStore struct {
	data []byte
}

func (f failingStore) ReadDevices(context.Context) ([]byte, error) {
	if f.data == nil {
		return nil, fs.ErrNotExist
	}

	return f.data, nil
}

func (failingStore) WriteDevices(context.Context, []byte) error {
	return errors.New("диск только для чтения")
}

func TestRenameKeepsNameOutOfMemoryWhenWriteFails(t *testing.T) {
	registry := newRegistry(t, uciFixture(t), failingStore{}, leasesFile)

	if err := registry.Rename(t.Context(), "aa:bb:cc:00:00:06", "Принтер"); err == nil {
		t.Fatal("write failure did not reach the caller")
	}

	list, err := registry.List(t.Context())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if printer := byMAC(t, list)["aa:bb:cc:00:00:06"]; printer.NameSource != devices.SourceStatic {
		t.Errorf("unwritten name got into the list: %+v", printer)
	}
}

func TestNewRejectsBrokenNamesFile(t *testing.T) {
	_, err := devices.New(t.Context(), uciFixture(t).run, failingStore{data: []byte("{")}, devices.Options{})
	if err == nil {
		t.Fatal("broken names file accepted: the next edit would overwrite it")
	}
}

func TestListSources(t *testing.T) {
	t.Run("without a lease file the static entries remain", func(t *testing.T) {
		registry := newRegistry(t, uciFixture(t), newStore(t, t.TempDir()), filepath.Join(t.TempDir(), "absent"))

		list, err := registry.List(t.Context())
		if err != nil {
			t.Fatalf("list: %v", err)
		}

		if len(list) != 5 {
			t.Errorf("devices %d, expected 5 static: %+v", len(list), list)
		}
	})

	t.Run("non-zero uci code means no static entries", func(t *testing.T) {
		registry := newRegistry(t, &fakeRunner{code: 1}, newStore(t, t.TempDir()), leasesFile)

		list, err := registry.List(t.Context())
		if err != nil {
			t.Fatalf("list: %v", err)
		}

		if len(list) != 5 {
			t.Errorf("devices %d, expected 5 leases: %+v", len(list), list)
		}
	})

	t.Run("uci launch failure is an error", func(t *testing.T) {
		registry := newRegistry(t, &fakeRunner{err: errors.New("нет файла")}, newStore(t, t.TempDir()), leasesFile)

		if _, err := registry.List(t.Context()); err == nil {
			t.Error("uci failure swallowed")
		}
	})
}
