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

// testNow лежит между сроками аренд фикстуры: 1000000000 уже истёк,
// 2000000000 ещё нет.
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
		t.Fatalf("сборка списка устройств: %v", err)
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
		t.Fatalf("список: %v", err)
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
		t.Errorf("устройств %d, ожидали %d: %+v", len(got), len(want), list)
	}

	tests := []struct {
		name string
		mac  string
	}{
		{"аренда с именем", "aa:bb:cc:00:00:01"},
		{"аренда без имени", "aa:bb:cc:00:00:02"},
		{"истёкшая аренда офлайн", "aa:bb:cc:00:00:03"},
		{"статическая перекрывает DHCP", "aa:bb:cc:00:00:04"},
		{"второй MAC статической записи списком", "aa:bb:cc:00:00:05"},
		{"статическая без аренды", "aa:bb:cc:00:00:06"},
		{"бессрочная аренда онлайн", "aa:bb:cc:00:00:07"},
		{"два MAC через пробел и кавычка в имени", "aa:bb:cc:00:00:08"},
		{"второй MAC через пробел", "aa:bb:cc:00:00:09"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got[tt.mac] != want[tt.mac] {
				t.Errorf("получили %+v, ожидали %+v", got[tt.mac], want[tt.mac])
			}
		})
	}

	for i := 1; i < len(list); i++ {
		prev, cur := netip.MustParseAddr(list[i-1].IP), netip.MustParseAddr(list[i].IP)
		if prev.Compare(cur) > 0 {
			t.Errorf("список не упорядочен по адресу: %s перед %s", prev, cur)
		}
	}

	if len(runner.calls) != 1 || strings.Join(runner.calls[0], " ") != testUCI+" -q show dhcp" {
		t.Errorf("вызовы uci: %v", runner.calls)
	}
}

func TestCustomNameOverridesStaticAndSurvivesRestart(t *testing.T) {
	stateDir := filepath.Join(t.TempDir(), "metabox")
	store := newStore(t, stateDir)

	registry := newRegistry(t, uciFixture(t), store, leasesFile)

	if err := registry.Rename(t.Context(), "AA-BB-CC-00-00-06", "  Принтер в коридоре "); err != nil {
		t.Fatalf("правка имени: %v", err)
	}

	if err := registry.Rename(t.Context(), "aa:bb:cc:00:00:0a", "планшет"); err != nil {
		t.Fatalf("правка имени устройства без аренды: %v", err)
	}

	if _, err := os.Stat(filepath.Join(stateDir, "devices.json")); err != nil {
		t.Fatalf("файл имён не записан: %v", err)
	}

	restarted := newRegistry(t, uciFixture(t), newStore(t, stateDir), leasesFile)

	list, err := restarted.List(t.Context())
	if err != nil {
		t.Fatalf("список: %v", err)
	}

	got := byMAC(t, list)

	printer := got["aa:bb:cc:00:00:06"]
	if printer.Name != "Принтер в коридоре" || printer.NameSource != devices.SourceCustom || !printer.Static {
		t.Errorf("своё имя не перекрыло статическое после рестарта: %+v", printer)
	}

	tablet := got["aa:bb:cc:00:00:0a"]
	if tablet.Name != "планшет" || tablet.IP != "" || tablet.Online {
		t.Errorf("устройство со своим именем без аренды: %+v", tablet)
	}

	if last := list[len(list)-1]; last.MAC != "aa:bb:cc:00:00:0a" {
		t.Errorf("устройство без адреса не в конце: %+v", last)
	}

	if err := restarted.Rename(t.Context(), "aa:bb:cc:00:00:06", ""); err != nil {
		t.Fatalf("сброс имени: %v", err)
	}

	list, err = restarted.List(t.Context())
	if err != nil {
		t.Fatalf("список: %v", err)
	}

	if printer := byMAC(t, list)["aa:bb:cc:00:00:06"]; printer.Name != "printer" || printer.NameSource != devices.SourceStatic {
		t.Errorf("пустое имя не вернуло статическое: %+v", printer)
	}
}

func TestRenameRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name string
		mac  string
		dev  string
		want error
	}{
		{"не MAC", "router", "x", devices.ErrInvalidMAC},
		{"MAC из восьми байт", "aa:bb:cc:dd:ee:ff:00:11", "x", devices.ErrInvalidMAC},
		{"имя длиннее потолка", "aa:bb:cc:00:00:01", strings.Repeat("я", 65), devices.ErrInvalidName},
		{"управляющий символ", "aa:bb:cc:00:00:01", "a\nb", devices.ErrInvalidName},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stateDir := filepath.Join(t.TempDir(), "metabox")
			registry := newRegistry(t, uciFixture(t), newStore(t, stateDir), leasesFile)

			if err := registry.Rename(t.Context(), tt.mac, tt.dev); !errors.Is(err, tt.want) {
				t.Errorf("ошибка %v, ожидали %v", err, tt.want)
			}

			if _, err := os.Stat(filepath.Join(stateDir, "devices.json")); !errors.Is(err, fs.ErrNotExist) {
				t.Errorf("отклонённая правка оставила файл: %v", err)
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
		t.Fatal("отказ записи не дошёл до вызывающего")
	}

	list, err := registry.List(t.Context())
	if err != nil {
		t.Fatalf("список: %v", err)
	}

	if printer := byMAC(t, list)["aa:bb:cc:00:00:06"]; printer.NameSource != devices.SourceStatic {
		t.Errorf("незаписанное имя попало в список: %+v", printer)
	}
}

func TestNewRejectsBrokenNamesFile(t *testing.T) {
	_, err := devices.New(t.Context(), uciFixture(t).run, failingStore{data: []byte("{")}, devices.Options{})
	if err == nil {
		t.Fatal("битый файл имён принят: следующая правка затёрла бы его")
	}
}

func TestListSources(t *testing.T) {
	t.Run("без файла аренд остаются статические записи", func(t *testing.T) {
		registry := newRegistry(t, uciFixture(t), newStore(t, t.TempDir()), filepath.Join(t.TempDir(), "absent"))

		list, err := registry.List(t.Context())
		if err != nil {
			t.Fatalf("список: %v", err)
		}

		if len(list) != 5 {
			t.Errorf("устройств %d, ожидали 5 статических: %+v", len(list), list)
		}
	})

	t.Run("ненулевой код uci — статических записей нет", func(t *testing.T) {
		registry := newRegistry(t, &fakeRunner{code: 1}, newStore(t, t.TempDir()), leasesFile)

		list, err := registry.List(t.Context())
		if err != nil {
			t.Fatalf("список: %v", err)
		}

		if len(list) != 5 {
			t.Errorf("устройств %d, ожидали 5 аренд: %+v", len(list), list)
		}
	})

	t.Run("отказ запуска uci — ошибка", func(t *testing.T) {
		registry := newRegistry(t, &fakeRunner{err: errors.New("нет файла")}, newStore(t, t.TempDir()), leasesFile)

		if _, err := registry.List(t.Context()); err == nil {
			t.Error("отказ uci проглочен")
		}
	})
}
