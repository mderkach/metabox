package clashapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"metabox/internal/clashapi"
)

type latencySource struct {
	body json.RawMessage
	err  error
	path string
}

func (s *latencySource) Snapshot(_ context.Context, path string) (json.RawMessage, error) {
	s.path = path

	return s.body, s.err
}

func TestReadLatencyProjectsServersAndPreservesZero(t *testing.T) {
	const checkedAt = "2026-11-22T10:00:00.000000005+03:00"
	timestamp, err := time.Parse(time.RFC3339Nano, checkedAt)
	if err != nil {
		t.Fatal(err)
	}

	source := &latencySource{body: json.RawMessage(`{"proxies":{
		"GLOBAL":{"type":"Fallback","all":["group"],"history":[]},
		"external":{"type":"Unknown","all":["west"],"history":[]},
		"stop":{"type":"Reject","history":[]},
		"deny":{"type":"Block","history":[]},
		"direct":{"type":"Direct","history":[]},
		"dns":{"type":"DNS","history":[]},
		"provider/edge":{"type":"VLESS","name":"provider/edge","history":[{"time":"` + checkedAt + `","delay":0}]},
		"group":{"type":"URLTest","all":["provider/edge"],"history":[{"time":"` + checkedAt + `","delay":0}]},
		"east":{"type":"Shadowsocks","history":[]},
		"west":{"type":"WireGuard","history":[{"time":"` + checkedAt + `","delay":158}]}
	}}`)}
	got, err := clashapi.ReadLatency(t.Context(), source)
	if err != nil {
		t.Fatal(err)
	}

	if source.path != "/proxies" {
		t.Errorf("snapshot path = %q, want /proxies", source.path)
	}

	want := []clashapi.LatencyReading{
		{Tag: "east"},
		{Tag: "provider/edge", At: timestamp, Millis: 0},
		{Tag: "west", At: timestamp, Millis: 158},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("readings = %+v, want %+v", got, want)
	}
}

func TestReadLatencyRejectsIncompleteSnapshots(t *testing.T) {
	testCases := []struct {
		name string
		body string
	}{
		{"missing proxies", `{}`},
		{"null proxies", `{"proxies":null}`},
		{"wrong proxies type", `{"proxies":[]}`},
		{"null proxy", `{"proxies":{"east":null}}`},
		{"missing proxy type", `{"proxies":{"east":{"history":[]}}}`},
		{"missing history", `{"proxies":{"east":{"type":"VLESS"}}}`},
		{"null history", `{"proxies":{"east":{"type":"VLESS","history":null}}}`},
		{"missing delay", `{"proxies":{"east":{"type":"VLESS","history":[{"time":"2026-11-22T10:00:00Z"}]}}}`},
		{"null delay", `{"proxies":{"east":{"type":"VLESS","history":[{"time":"2026-11-22T10:00:00Z","delay":null}]}}}`},
		{"negative delay", `{"proxies":{"east":{"type":"VLESS","history":[{"time":"2026-11-22T10:00:00Z","delay":-1}]}}}`},
		{"delay overflows the fork field", `{"proxies":{"east":{"type":"VLESS","history":[{"time":"2026-11-22T10:00:00Z","delay":65536}]}}}`},
		{"invalid timestamp", `{"proxies":{"east":{"type":"VLESS","history":[{"time":"bad","delay":1}]}}}`},
		{"missing timestamp", `{"proxies":{"east":{"type":"VLESS","history":[{"delay":1}]}}}`},
		{"null sample", `{"proxies":{"east":{"type":"VLESS","history":[null]}}}`},
		{"more than one sample", `{"proxies":{"east":{"type":"VLESS","history":[{"time":"2026-11-22T10:00:00Z","delay":1},{"time":"2026-11-22T10:01:00Z","delay":2}]}}}`},
		{"one invalid server among valid servers", `{"proxies":{"east":{"type":"VLESS","history":[]},"west":{"type":"VLESS"}}}`},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := clashapi.ReadLatency(t.Context(), &latencySource{body: json.RawMessage(tc.body)})
			if err == nil || got != nil {
				t.Errorf("incomplete snapshot gave (%+v, %v), want no readings and an error", got, err)
			}
		})
	}
}

func TestReadLatencyDistinguishesEmptySnapshotFromUnavailable(t *testing.T) {
	got, err := clashapi.ReadLatency(t.Context(), &latencySource{body: json.RawMessage(`{"proxies":{}}`)})
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("empty snapshot gave (%+v, %v), want an empty slice", got, err)
	}

	unavailable := errors.New("unavailable")
	got, err = clashapi.ReadLatency(t.Context(), &latencySource{err: unavailable})
	if got != nil || !errors.Is(err, unavailable) {
		t.Errorf("unavailable snapshot gave (%+v, %v), want the original cause", got, err)
	}
}

func TestIsLatencyServerChecksExactEscapedTag(t *testing.T) {
	const tag = "subscription/edge #1?%"
	source := &latencySource{body: json.RawMessage(`{"name":"` + tag + `","type":"VLESS","history":[]}`)}
	server, err := clashapi.IsLatencyServer(t.Context(), source, tag)
	if err != nil || !server {
		t.Errorf("check listed server = (%v, %v), want (true, nil)", server, err)
	}
	if want := "/proxies/subscription%2Fedge%20%231%3F%25"; source.path != want {
		t.Errorf("snapshot path = %q, want %q", source.path, want)
	}
}

func TestIsLatencyServerExcludesGroupsAndRejectsWrongResponse(t *testing.T) {
	cases := []struct {
		name string
		body string
		fail bool
	}{
		{"group type", `{"name":"outbound","type":"Selector","all":[]}`, false},
		{"group shape", `{"name":"outbound","type":"Unknown","all":["server"]}`, false},
		{"direct outbound", `{"name":"outbound","type":"Direct"}`, false},
		{"different tag", `{"name":"server","type":"VLESS"}`, true},
		{"unknown type", `{"name":"outbound"}`, true},
		{"malformed response", `[]`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server, err := clashapi.IsLatencyServer(t.Context(), &latencySource{body: json.RawMessage(tc.body)}, "outbound")
			if server || (err != nil) != tc.fail {
				t.Errorf("check outbound = (%v, %v), want not a server and error=%v", server, err, tc.fail)
			}
		})
	}
}
