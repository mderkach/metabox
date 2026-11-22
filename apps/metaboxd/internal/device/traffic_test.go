package device_test

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"testing"

	"metabox/internal/device"
	"metabox/internal/history"
	"metabox/internal/logs"
)

func TestSystemFrameCarriesTrafficAndBlocking(t *testing.T) {
	fs := newTree(t)

	const mib = 1024 * 1024
	reader := device.New(device.Options{
		Proc: fs.proc,
		Sys:  fs.sys,
		Traffic: func() history.TrafficTotals {
			return history.TrafficTotals{
				Split: history.Split{Proxy: 30 * mib, Direct: 20 * mib},
				Outbounds: map[string]history.OutboundTraffic{
					"proxy":  {Bytes: 30 * mib, Rate: 128, Origin: "computed"},
					"direct": {Bytes: 20 * mib, Rate: 45, Origin: "observed"},
				},
				Servers: map[string]history.TrafficValue{
					"__proto__": {Bytes: 30 * mib, Rate: 128, Origin: "computed"},
				},
			}
		},
		Blocked: func() logs.BlockedTraffic {
			return logs.BlockedTraffic{
				Origin: "computed",
				Reject: logs.BlockedKind{Used: true, Visible: false},
				Block:  logs.BlockedKind{Used: true, Visible: true},
			}
		},
	})

	netDev := filepath.Join(fs.proc, "net", "dev")
	const counters = "pppoe-wan: %d 100 0 0 0 0 0 0 1024 100 0 0 0 0 0 0\n"
	fs.write(t, netDev, fmt.Sprintf(counters, mib))
	_, _ = reader.Read(t.Context())
	fs.write(t, netDev, fmt.Sprintf(counters, 101*mib))

	body, err := reader.Encoded(slog.New(slog.NewTextHandler(io.Discard, nil)))(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	var wire device.Stat
	if err := json.Unmarshal(body, &wire); err != nil {
		t.Fatal(err)
	}

	if wire.Share.Link != 100*mib || wire.Share.Split != (history.Split{Proxy: 30 * mib, Direct: 20 * mib}) {
		t.Errorf("share: got %+v, want 100 MiB WAN and 30/20 MiB core split", wire.Share)
	}

	if wire.Outbounds == nil || wire.Servers == nil {
		t.Fatalf("missing telemetry rows: %s", body)
	}

	outbounds, servers := *wire.Outbounds, *wire.Servers
	if len(outbounds) != 2 || outbounds[0].Tag != "direct" || outbounds[0].Bytes != 20*mib ||
		outbounds[1].Tag != "proxy" || outbounds[1].Bytes != 30*mib ||
		outbounds[1].Rate != 128 || outbounds[1].Origin != "computed" {
		t.Errorf("outbounds: got %+v", outbounds)
	}

	if len(servers) != 1 || servers[0].Tag != "__proto__" || servers[0].Bytes != 30*mib {
		t.Errorf("servers: got %+v", servers)
	}

	if wire.Blocked == nil || wire.Blocked.Count != nil || wire.Blocked.Origin != "computed" ||
		!wire.Blocked.Reject.Used || wire.Blocked.Reject.Visible || !wire.Blocked.Block.Visible {
		t.Errorf("blocking availability: got %+v", wire.Blocked)
	}
}

func TestSystemFrameDistinguishesEmptyTrafficFromMissingTelemetry(t *testing.T) {
	fs := newTree(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	for _, configured := range []bool{true, false} {
		opts := device.Options{Proc: fs.proc, Sys: fs.sys}
		if configured {
			opts.Traffic = func() history.TrafficTotals { return history.TrafficTotals{} }
		}

		body, err := device.New(opts).Encoded(logger)(t.Context())
		if err != nil {
			t.Fatal(err)
		}

		var fields map[string]json.RawMessage
		if err := json.Unmarshal(body, &fields); err != nil {
			t.Fatal(err)
		}
		for _, key := range []string{"outbounds", "servers"} {
			value, present := fields[key]
			if present != configured || (configured && string(value) != "[]") {
				t.Errorf("telemetry configured %t, %s: got present=%t value=%s", configured, key, present, value)
			}
		}
	}
}
