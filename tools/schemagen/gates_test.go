package main

import "testing"

// The tag table is read from the fork sources, not from the registry: a stub without
// the tag registers the same type. Here the cases where parsing is easy to
// get wrong are checked.
func TestBuildGates(t *testing.T) {
	dir, err := forkDir()
	if err != nil {
		t.Fatal(err)
	}

	gates, err := buildGates(dir)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name     string
		registry string
		key      string
		want     string
	}{
		{"direct registration in a stub", "outbound", "hysteria2", "with_quic"},
		{"type only in a file with the tag, through the protocol package", "endpoint", "warp", "with_wireguard"},
		{"condition with a platform part", "service", "usbip-server", "with_usbip"},
		{"DNS transport", "dns", "dhcp", "with_dhcp"},
		{"a neighbouring package function registers a type without a tag", "inbound", "naive", ""},
		{"type with no tag at all", "outbound", "vless", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := gates[tt.registry][tt.key]; got != tt.want {
				t.Errorf("%s/%s: tag %q, expected %q", tt.registry, tt.key, got, tt.want)
			}
		})
	}
}
