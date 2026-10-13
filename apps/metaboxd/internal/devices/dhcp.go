package devices

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/netip"
	"os"
	"strconv"
	"strings"

	"metabox/internal/uci"
)

// maxLeasesBytes is the ceiling for reading the leases file. A lease line is about a hundred
// bytes, a megabyte covers the pool of any home network.
const maxLeasesBytes = 1 << 20

type lease struct {
	expires int64
	mac     string
	ip      string
	name    string
}

type host struct {
	name string
	ip   string
	macs []string
}

// readLeases parses the dnsmasq leases file: `<expiry> <mac> <ip> <name|*>
// <client-id|*>`. A missing file is a regular case: DHCP on the router
// is off. Lines of another kind (DUID of IPv6 leases) are skipped.
func readLeases(path string) ([]lease, error) {
	f, err := os.Open(path) //nolint:gosec // G304: the path comes by a flag, not from a request
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("аренды DHCP: %w", err)
	}
	defer func() { _ = f.Close() }()

	byMAC := map[string]lease{}
	order := []string{}

	scanner := bufio.NewScanner(io.LimitReader(f, maxLeasesBytes))
	for scanner.Scan() {
		l, ok := parseLease(scanner.Text())
		if !ok {
			continue
		}

		// dnsmasq does not keep two leases for one MAC, but the file is not written
		// atomically; of the two the later one is taken.
		prev, seen := byMAC[l.mac]
		if !seen {
			order = append(order, l.mac)
		}
		if !seen || later(l.expires, prev.expires) {
			byMAC[l.mac] = l
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("аренды DHCP: %w", err)
	}

	out := make([]lease, 0, len(order))
	for _, mac := range order {
		out = append(out, byMAC[mac])
	}

	return out, nil
}

// later compares lease expiries; zero in dnsmasq is a permanent lease.
func later(a, b int64) bool {
	return b != 0 && (a == 0 || a > b)
}

func parseLease(line string) (lease, bool) {
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return lease{}, false
	}

	expires, err := strconv.ParseInt(fields[0], 10, 64)
	if err != nil || expires < 0 {
		return lease{}, false
	}

	mac, err := normalizeMAC(fields[1])
	if err != nil {
		return lease{}, false
	}

	ip, err := netip.ParseAddr(fields[2])
	if err != nil {
		return lease{}, false
	}

	name := fields[3]
	if name == "*" {
		name = ""
	}

	return lease{expires: expires, mac: mac, ip: ip.String(), name: name}, true
}

// staticHosts reads the `host` sections from UCI `dhcp`. A non-zero uci code means the
// `dhcp` package is absent, and there are no static entries either; a launch failure is an error.
func (r *Registry) staticHosts(ctx context.Context) ([]host, error) {
	out, code, err := r.run(ctx, r.uci, "-q", "show", "dhcp")
	if err != nil {
		return nil, fmt.Errorf("uci show dhcp: %w", err)
	}

	if code != 0 {
		return nil, nil
	}

	return parseHosts(out), nil
}

// parseHosts selects the `host` sections from the `uci show dhcp` output. A MAC in an option
// comes both as a list and as one value separated by spaces: both forms reduce to
// one list.
func parseHosts(out string) []host {
	var hosts []host

	for _, section := range uci.Parse(out, "dhcp") {
		if section.Type != "host" {
			continue
		}

		h := host{name: section.Option("name")}

		if ip, err := netip.ParseAddr(section.Option("ip")); err == nil {
			h.ip = ip.String()
		}

		for _, value := range section.Options["mac"] {
			for raw := range strings.FieldsSeq(value) {
				if mac, err := normalizeMAC(raw); err == nil {
					h.macs = append(h.macs, mac)
				}
			}
		}

		if len(h.macs) > 0 {
			hosts = append(hosts, h)
		}
	}

	return hosts
}
