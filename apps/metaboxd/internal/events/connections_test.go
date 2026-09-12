package events

import (
	"encoding/json"
	"testing"
)

func decodeSnapshot(t *testing.T, body string) ConnectionsSnapshot {
	t.Helper()

	raw, err := connectionsSnapshot(json.RawMessage(body))
	if err != nil {
		t.Fatalf("перевод снапшота: %v", err)
	}

	var snapshot ConnectionsSnapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		t.Fatalf("разбор результата: %v", err)
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
		t.Fatalf("соединений: получили %d, ожидали 1", len(snapshot.Connections))
	}

	connection := snapshot.Connections[0]

	tests := []struct {
		name string
		got  string
		want string
	}{
		{"условия отделены от исхода", connection.Rule, "rule_set=google-ip"},
		{"исход отделён от условий", connection.Action, "route(alt-fallback)"},
		{"имя из sniff с портом", connection.Host, "clients.google.example:443"},
		{"сеть", connection.Network, "tcp"},
		{"источник", connection.Source, "192.168.1.60"},
		{"время старта как отдал core", connection.StartedAt, "2026-09-10T12:00:00Z"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("получили %q, ожидали %q", tt.got, tt.want)
			}
		})
	}

	if snapshot.Memory != 4096 || snapshot.UploadTotal != 100 || snapshot.DownloadTotal != 200 {
		t.Errorf("итоги снапшота потерялись: %+v", snapshot)
	}
}

func TestConnectionsSnapshotFinal(t *testing.T) {
	tests := []struct {
		name string
		rule string
	}{
		{"clash api подставляет слово", `"final"`},
		{"gRPC оставляет поле пустым", `""`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":`+tt.rule+`,
				"metadata":{"destinationIP":"1.1.1.1","destinationPort":"443"}}]}`)

			connection := snapshot.Connections[0]

			if !connection.Final {
				t.Error("исход по умолчанию обязан отличаться от правила без условий")
			}
			if connection.Rule != "" || connection.Action != "" {
				t.Errorf("правилом этот исход не является: получили %q и %q", connection.Rule, connection.Action)
			}
		})
	}
}

func TestConnectionsSnapshotRuleWithoutConditions(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":" => route(direct)",
		"metadata":{"destinationIP":"1.1.1.1","destinationPort":"443"}}]}`)

	connection := snapshot.Connections[0]

	if connection.Final {
		t.Error("правило без условий — не исход по умолчанию")
	}
	if connection.Action != "route(direct)" {
		t.Errorf("действие: получили %q, ожидали %q", connection.Action, "route(direct)")
	}
}

func TestConnectionsSnapshotEmptyChain(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":"final","metadata":{}}]}`)

	if snapshot.Connections[0].Chain == nil {
		t.Error("цепочки нет — уходит пустой список, а не null: панель разбирает его как массив")
	}
}

func TestConnectionsSnapshotWithoutSniff(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":"final","chains":["direct"],
		"metadata":{"destinationIP":"1.1.1.1","destinationPort":"853"}}]}`)

	if got := snapshot.Connections[0].Host; got != "1.1.1.1:853" {
		t.Errorf("без имени остаётся адрес: получили %q", got)
	}
}

func TestConnectionsSnapshotIPv6(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[{"id":"c-1","rule":"",
		"metadata":{"destinationIP":"2606:4700::1111","destinationPort":"443"}}]}`)

	if got := snapshot.Connections[0].Host; got != "[2606:4700::1111]:443" {
		t.Errorf("адрес IPv6 обязан остаться разбираемым: получили %q", got)
	}
}

func TestConnectionsSnapshotEmpty(t *testing.T) {
	snapshot := decodeSnapshot(t, `{"connections":[]}`)

	if snapshot.Connections == nil {
		t.Error("пустой список обязан остаться списком, а не превратиться в null")
	}
}

func TestConnectionsSnapshotBroken(t *testing.T) {
	if _, err := connectionsSnapshot(json.RawMessage(`[`)); err == nil {
		t.Error("неразобранный снапшот обязан стать ошибкой")
	}
}
