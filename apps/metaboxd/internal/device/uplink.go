package device

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Interface counters in `/proc/net/dev` follow the colon: first the received
// bytes, ninth the sent ones.
const (
	receivedField    = 0
	transmittedField = 8
)

// A `/proc/net/route` row: "Iface Destination Gateway Flags RefCnt Use Metric Mask".
const (
	routeIfaceField  = 0
	routeTargetField = 1
	routeMetricField = 6
	routeMaskField   = 7

	// The default route is a zero destination address and mask.
	routeDefault = "00000000"
)

// Link is the interface counters since it came up, in bytes.
type Link struct {
	Name string `json:"name"`
	RX   int64  `json:"rx"`
	TX   int64  `json:"tx"`
}

// uplink returns the counters of the interface the device goes outside through.
//
// It is needed for comparison: how much of the channel went through sing-box is visible only
// next to how much went in total. Only increments over one window can be compared:
// the interface counter counts from the link coming up, and the Clash API counter from
// the process start.
func (r *Reader) uplink() (*Link, error) {
	name, err := r.defaultRoute()
	if err != nil {
		return nil, err
	}

	return r.counters(name)
}

// defaultRoute selects the default route interface with the lowest metric.
// Tunnels are skipped: in TUN mode the default route belongs to sing-box itself,
// and its traffic would be both the dividend and the divisor.
func (r *Reader) defaultRoute() (string, error) {
	path := filepath.Join(r.proc, "net", "route")

	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}

	best := ""
	bestMetric := 0
	fallback := ""

	for line := range strings.Lines(string(data)) {
		fields := strings.Fields(line)
		if len(fields) <= routeMaskField {
			continue
		}

		if fields[routeTargetField] != routeDefault || fields[routeMaskField] != routeDefault {
			continue
		}

		name := fields[routeIfaceField]
		if fallback == "" {
			fallback = name
		}

		if r.isTunnel(name) {
			continue
		}

		metric, err := strconv.Atoi(fields[routeMetricField])
		if err != nil {
			continue
		}

		if best == "" || metric < bestMetric {
			best, bestMetric = name, metric
		}
	}

	if best != "" {
		return best, nil
	}

	// All default routes are tunnel ones: better to show this interface
	// than nothing, the share then comes out around a hundred percent.
	if fallback != "" {
		return fallback, nil
	}

	return "", errors.New("no default route")
}

// isTunnel tells TUN/TAP by a file the kernel creates only for them.
func (r *Reader) isTunnel(name string) bool {
	_, err := os.Stat(filepath.Join(r.sys, "class", "net", name, "tun_flags"))

	return err == nil
}

func (r *Reader) counters(name string) (*Link, error) {
	path := filepath.Join(r.proc, "net", "dev")

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	for line := range strings.Lines(string(data)) {
		iface, rest, found := strings.Cut(line, ":")
		if !found || strings.TrimSpace(iface) != name {
			continue
		}

		fields := strings.Fields(rest)
		if len(fields) <= transmittedField {
			return nil, fmt.Errorf("parse %s: %s has %d fields", path, name, len(fields))
		}

		rx, err := strconv.ParseInt(fields[receivedField], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("parse counter %s: %w", name, err)
		}

		tx, err := strconv.ParseInt(fields[transmittedField], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("parse counter %s: %w", name, err)
		}

		return &Link{Name: name, RX: rx, TX: tx}, nil
	}

	return nil, fmt.Errorf("no interface %s in %s", name, path)
}
