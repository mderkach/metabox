package httpapi

import (
	"net"
	"slices"
	"testing"
)

func TestAddrs(t *testing.T) {
	tests := []struct {
		name string
		spec string
		want []string
	}{
		{"one address", "192.168.1.1:8088", []string{"192.168.1.1:8088"}},
		{"several addresses", "192.168.1.1:8088,192.168.2.1:8088", []string{"192.168.1.1:8088", "192.168.2.1:8088"}},
		{"spaces around a comma", "192.168.1.1:8088, 10.0.0.1:8088", []string{"192.168.1.1:8088", "10.0.0.1:8088"}},
		{"trailing comma", "192.168.1.1:8088,", []string{"192.168.1.1:8088"}},
		{"empty", "", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Addrs(tt.spec)

			if len(got) != len(tt.want) {
				t.Fatalf("got %v, expected %v", got, tt.want)
			}

			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("address %d: got %q, expected %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// The panel must come up on the interfaces that already exist: on a router networks
// come up out of order, and the guest network address may appear later than the daemon.
func TestListenSurvivesUnavailableAddress(t *testing.T) {
	free := freePort(t)

	listeners, failures, err := Listen([]string{"127.0.0.1:" + free, "203.0.113.1:" + free})
	if err != nil {
		t.Fatalf("the daemon did not start because of one unavailable address: %v", err)
	}

	t.Cleanup(func() {
		for _, listener := range listeners {
			if err := listener.Close(); err != nil {
				t.Error(err)
			}
		}
	})

	if len(listeners) != 1 {
		t.Errorf("listeners open %d, expected 1", len(listeners))
	}
	if len(failures) != 1 {
		t.Errorf("the unavailable address did not get into the failures: %v", failures)
	}
}

func TestListenFailsWhenNothingOpened(t *testing.T) {
	if _, _, err := Listen([]string{"203.0.113.1:8088"}); err == nil {
		t.Error("the daemon started without opening a single address")
	}
}

func TestListenRejectsEmptyList(t *testing.T) {
	if _, _, err := Listen(nil); err == nil {
		t.Error("an empty address list accepted")
	}
}

func freePort(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}

	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}

	return port
}

func TestHosts(t *testing.T) {
	got := Hosts([]string{"192.168.1.1:8088", "[fd00::1]:8088", "10.0.0.1"}, "http://router.lan:5173")
	want := []string{"192.168.1.1", "fd00::1", "10.0.0.1", "router.lan"}

	if !slices.Equal(got, want) {
		t.Errorf("hosts %v, want %v", got, want)
	}

	if got := Hosts(nil, ""); len(got) != 0 {
		t.Errorf("hosts without addresses: %v", got)
	}
}
