package clashapi

import (
	"net"
	"net/netip"
	"testing"
)

func TestPinLocalControllerKeepsOnlyLocalDestinations(t *testing.T) {
	for _, address := range []string{":9090", "0.0.0.0:9090", "[::]:9090", "127.0.0.1:9090", "192.0.2.23:9090"} {
		t.Run(address, func(t *testing.T) {
			settings := Settings{Address: address, Secret: "test-secret"}
			pinned, port := settings.PinLocalController(t.Context())
			if address == "192.0.2.23:9090" {
				if port != 0 || (pinned != Settings{}) {
					t.Fatal("a remote controller must not be pinned")
				}

				return
			}
			if port != 9090 || pinned.Secret != settings.Secret || pinned.LocalPort() != port {
				t.Fatalf("expected a local destination on the original port, got %d", port)
			}
		})
	}
}

func TestPinLocalControllerAcceptsLocalInterface(t *testing.T) {
	owned, err := localInterfaceAddrs()
	if err != nil {
		t.Fatal(err)
	}
	for addr := range owned {
		if addr.IsLoopback() || !addr.Is4() || addr == netip.IPv4Unspecified() {
			continue
		}
		settings := Settings{Address: net.JoinHostPort(addr.String(), "9090"), Secret: "test-secret"}
		if pinned, port := settings.PinLocalController(t.Context()); port != 9090 || pinned != settings {
			t.Fatal("controller on an address of the local interface must be pinnable")
		}

		return
	}
	t.Skip("no non-loopback IPv4 interface")
}
