package events

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func decodeSnapshot(t *testing.T, body string) ConnectionsSnapshot {
	t.Helper()

	raw, _, err := connectionsSnapshot(json.RawMessage(body))
	if err != nil {
		t.Fatalf("snapshot translation: %v", err)
	}

	var snapshot ConnectionsSnapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		t.Fatalf("result parsing: %v", err)
	}

	return snapshot
}

func TestConnectionsSnapshot(t *testing.T) {
	snapshot := decodeSnapshot(t, `{
		"connections": [{
			"id": "c-1",
			"rule": "rule_set=google-ip => route(alt-fallback)",
			"chains": ["hk-01", "alt-fallback"],
			"upload": 12,
			"download": 34,
			"start": "2026-09-10T12:00:00Z",
			"metadata": {
				"network": "tcp",
				"sourceIP": "192.168.1.60",
				"destinationIP": "142.250.74.14",
				"destinationPort": "443",
				"host": "clients.google.example"
			}
		}],
		"uploadTotal": 100,
		"downloadTotal": 200,
		"memory": 4096
	}`)

	if len(snapshot.Connections) != 1 {
		t.Fatalf("connections: got %d, expected 1", len(snapshot.Connections))
	}

	connection := snapshot.Connections[0]

	tests := []struct {
		name string
		got  string
		want string
	}{
		{"conditions are separated from the outbound", connection.Rule, "rule_set=google-ip"},
		{"the outbound is separated from the conditions", connection.Action, "route(alt-fallback)"},
		{"name from sniff with a port", connection.Host, "clients.google.example:443"},
		{"network", connection.Network, "tcp"},
		{"source", connection.Source, "192.168.1.60"},
		{"start time as core returned it", connection.StartedAt, "2026-09-10T12:00:00Z"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %q, expected %q", tt.got, tt.want)
			}
		})
	}

	if snapshot.Memory != 4096 || snapshot.UploadTotal != 100 || snapshot.DownloadTotal != 200 {
		t.Errorf("snapshot totals lost: %+v", snapshot)
	}
}

func TestConnectionsSnapshotFinal(t *testing.T) {
	tests := []struct {
		name string
		rule string
	}{
		{"clash api substitutes a word", `"final"`},
		{"gRPC leaves the field empty", `""`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":`+tt.rule+`,
				"metadata":{"destinationIP":"1.1.1.1","destinationPort":"443"}}]}`)

			connection := snapshot.Connections[0]

			if !connection.Final {
				t.Error("the default outbound must differ from a rule without conditions")
			}
			if connection.Rule != "" || connection.Action != "" {
				t.Errorf("this outbound is not a rule: got %q and %q", connection.Rule, connection.Action)
			}
		})
	}
}

func TestConnectionsSnapshotRuleWithoutConditions(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":" => route(direct)",
		"metadata":{"destinationIP":"1.1.1.1","destinationPort":"443"}}]}`)

	connection := snapshot.Connections[0]

	if connection.Final {
		t.Error("a rule without conditions is not the default outbound")
	}
	if connection.Action != "route(direct)" {
		t.Errorf("action: got %q, expected %q", connection.Action, "route(direct)")
	}
}

func TestConnectionsSnapshotEmptyChain(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":"final","metadata":{}}]}`)

	if snapshot.Connections[0].Chain == nil {
		t.Error("no chain: an empty list goes out, not null: the panel parses it as an array")
	}
}

func TestConnectionsSnapshotWithoutSniff(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":"final","chains":["direct"],
		"metadata":{"destinationIP":"1.1.1.1","destinationPort":"853"}}]}`)

	if got := snapshot.Connections[0].Host; got != "1.1.1.1:853" {
		t.Errorf("without a name the address stays: got %q", got)
	}
}

func TestConnectionsSnapshotIPv6(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":"",
		"metadata":{"destinationIP":"2606:4700::1111","destinationPort":"443"}}]}`)

	if got := snapshot.Connections[0].Host; got != "[2606:4700::1111]:443" {
		t.Errorf("an IPv6 address must stay parseable: got %q", got)
	}
}

func TestConnectionsSnapshotEmpty(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[]}`)

	if snapshot.Connections == nil {
		t.Error("an empty list must stay a list and not turn into null")
	}
}

// The share of the channel through sing-box is counted by the daemon, and the accumulated counter is visible only
// in the connections snapshot.
func TestConnectionsSnapshotTotal(t *testing.T) {
	_, total, err := connectionsSnapshot(json.RawMessage(`{"connections":[],"uploadTotal":100,"downloadTotal":200}`))
	if err != nil {
		t.Fatalf("snapshot translation: %v", err)
	}

	if total != 300 {
		t.Errorf("byte counter: got %d, expected 300", total)
	}
}

func TestConnectionsSnapshotBroken(t *testing.T) {
	if _, _, err := connectionsSnapshot(json.RawMessage(`[`)); err == nil {
		t.Error("an unparsed snapshot must become an error")
	}
}

// The benchmark holds the NFR-2 ceiling: translating a snapshot of five thousand connections into
// the daemon contract is the price of one topic event with the panel open.
func BenchmarkConnectionsSnapshot5000(b *testing.B) {
	var sb strings.Builder

	sb.WriteString(`{"connections":[`)

	for i := range 5000 {
		if i > 0 {
			sb.WriteByte(',')
		}

		fmt.Fprintf(&sb,
			`{"id":"c-%d","rule":"rule_set=google-ip => route(proxy)","chains":["hk-01","proxy"],`+
				`"upload":%d,"download":%d,"start":"2026-09-27T00:00:00Z",`+
				`"metadata":{"network":"tcp","sourceIP":"192.168.1.%d","host":"example-%d.com","destinationPort":"443"}}`,
			i, i*10, i*100, i%250, i)
	}

	sb.WriteString(`],"uploadTotal":1,"downloadTotal":2,"memory":1024}`)

	raw := json.RawMessage(sb.String())

	b.ReportAllocs()

	for b.Loop() {
		if _, _, err := connectionsSnapshot(raw); err != nil {
			b.Fatal(err)
		}
	}
}
