package route

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"metabox/internal/history"
)

func newTestCounter(source Source) *Counter {
	return NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second})
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func hitsOf(t *testing.T, counter *Counter) []uint64 {
	t.Helper()

	hits, err := counter.Hits(t.Context())
	if err != nil {
		t.Fatalf("count: %v", err)
	}

	out := make([]uint64, 0, len(hits.Rules))
	for _, rule := range hits.Rules {
		out = append(out, rule.Hits)
	}

	return out
}

func TestCounterCountsEachConnectionOnce(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": rulesBody,
		"/connections": `{"connections":[
			{"id":"a","rule":"rule_set=google-ip => route(proxy)"},
			{"id":"b","rule":"inbound=dns-in => hijack-dns"},
			{"id":"c","rule":"final"}
		]}`,
	}}
	counter := newTestCounter(source)

	for range 3 {
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
	}

	source.bodies["/connections"] = `{"connections":[
		{"id":"a","rule":"rule_set=google-ip => route(proxy)"},
		{"id":"d","rule":"rule_set=google-ip => route(proxy)"}
	]}`
	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if got, want := hitsOf(t, counter), []uint64{0, 1, 0, 2, 0}; !slices.Equal(got, want) {
		t.Errorf("count %v, expected %v", got, want)
	}

	hits, err := counter.Hits(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if hits.Final != 1 {
		t.Errorf("in final %d, expected 1", hits.Final)
	}
}

// After an apply that reordered the rules the count stays with its own
// rule and not with the number.
func TestCounterFollowsRuleAfterReorder(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[{"id":"a","rule":"inbound=dns-in => hijack-dns"}]}`,
	}}
	counter := newTestCounter(source)

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	source.bodies["/rules"] = `{"rules":[
		{"type":"default","payload":"rule_set=google-ip","proxy":"route(proxy)"},
		{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"}
	]}`

	if got, want := hitsOf(t, counter), []uint64{0, 1}; !slices.Equal(got, want) {
		t.Errorf("count %v, expected %v", got, want)
	}
}

// A rule absent from the remembered list means a new process config:
// the list is reread, and the connection is counted for its rule.
func TestCounterRereadsRulesForUnknownRule(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       `{"rules":[{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"}]}`,
		"/connections": `{"connections":[{"id":"a","rule":"inbound=dns-in => hijack-dns"}]}`,
	}}
	counter := newTestCounter(source)

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	source.bodies["/rules"] = `{"rules":[
		{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
		{"type":"default","payload":"domain_suffix=example.org","proxy":"route(direct)"}
	]}`
	source.bodies["/connections"] = `{"connections":[{"id":"b","rule":"domain_suffix=example.org => route(direct)"}]}`

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if got, want := hitsOf(t, counter), []uint64{1, 1}; !slices.Equal(got, want) {
		t.Errorf("count %v, expected %v", got, want)
	}
}

// A duplicate of a rule lower in the list never fires: the router
// stops at the first match.
func TestCounterGivesDuplicateNoHits(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": `{"rules":[
			{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
			{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"}
		]}`,
		"/connections": `{"connections":[{"id":"a","rule":"inbound=dns-in => hijack-dns"}]}`,
	}}
	counter := newTestCounter(source)

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if got, want := hitsOf(t, counter), []uint64{1, 0}; !slices.Equal(got, want) {
		t.Errorf("count %v, expected %v", got, want)
	}
}

func TestCounterReportsCountingWindow(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{bodies: map[string]string{
			"/rules":       rulesBody,
			"/connections": `{"connections":[]}`,
		}}
		counter := newTestCounter(source)
		counter.Start()
		defer counter.Close()

		time.Sleep(90 * time.Second)
		synctest.Wait()

		hits, err := counter.Hits(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if hits.Seconds != 90 {
			t.Errorf("count runs %d s, expected 90", hits.Seconds)
		}
	})
}

// The Clash API does not show connections for rules that do not end the iteration
// or do not send traffic to an outbound: zero for them would mean "not visible", not "did not
// fire".
func TestCounterMarksUnobservableRules(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": `{"rules":[
			{"type":"default","payload":"","proxy":"sniff"},
			{"type":"default","payload":"inbound=dns-in","proxy":"hijack-dns"},
			{"type":"default","payload":"rule_set=ads","proxy":"reject"},
			{"type":"default","payload":"rule_set=google-ip","proxy":"route(proxy)"},
			{"type":"default","payload":"ip_is_private=true","proxy":"bypass(direct)"}
		]}`,
		"/connections": `{"connections":[]}`,
	}}

	hits, err := newTestCounter(source).Hits(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	got := make([]bool, 0, len(hits.Rules))
	for _, rule := range hits.Rules {
		got = append(got, rule.Counted)
	}

	if want := []bool{false, false, false, true, true}; !slices.Equal(got, want) {
		t.Errorf("rule visibility %v, expected %v", got, want)
	}
}

type sizes []int

func (s *sizes) Record(count int) { *s = append(*s, count) }

func TestCounterRecordsSnapshotSize(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": `{"connections":[{"id":"a","rule":"final"},{"id":"b","rule":"final"}]}`,
	}}
	recorded := &sizes{}
	counter := NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second, Sizes: recorded})

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(*recorded, []int{2}) {
		t.Errorf("number of snapshot connections %v, expected [2]", *recorded)
	}
}

// The runtime stream reads connections from the counter snapshot: the raw body goes to
// Snapshots on every successful poll and does not go on a failed one.
func TestCounterFeedsSnapshotSink(t *testing.T) {
	const body = `{"connections":[{"id":"a","rule":"final"}]}`

	source := &fakeSource{bodies: map[string]string{"/rules": rulesBody, "/connections": body}}

	var got []string

	counter := NewCounter(source, discardLogger(), CounterOptions{
		Interval:  time.Second,
		Snapshots: func(raw json.RawMessage) { got = append(got, string(raw)) },
	})

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	source.setErr(errors.New("sing-box лежит"))

	if err := counter.observe(t.Context()); err == nil {
		t.Fatal("polling a down source passed")
	}

	if len(got) != 1 || got[0] != body {
		t.Errorf("%d snapshots (%v) went into the stream, expected one initial", len(got), got)
	}
}

// With sing-box down the counter waits the retry pause and does not knock every
// interval: the constant daemon polls behave the same.
func TestCounterWaitsRetryAfterFailure(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{}
		counter := NewCounter(source, discardLogger(), CounterOptions{
			Interval: time.Second,
			Retry:    3 * time.Second,
		})

		counter.Start()
		defer counter.Close()

		// Polls at 0, 3, 6 and 9 seconds: the next one at 9.5 is not there yet.
		time.Sleep(9*time.Second + 500*time.Millisecond)
		synctest.Wait()

		if got := source.callCount(); got != 4 {
			t.Errorf("polls %d, expected 4", got)
		}
	})
}

// The benchmark measures the load ceiling and fails no threshold: five thousand live connections,
// the price of one counter poll in the steady state, with all connections already counted.
func BenchmarkCounterObserve5000(b *testing.B) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/connections": connectionsBody(5000),
	}}
	counter := NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second})

	if err := counter.observe(b.Context()); err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()

	for b.Loop() {
		if err := counter.observe(b.Context()); err != nil {
			b.Fatal(err)
		}
	}
}

func connectionsBody(count int) string {
	var sb strings.Builder

	sb.WriteString(`{"connections":[`)

	for i := range count {
		if i > 0 {
			sb.WriteByte(',')
		}

		fmt.Fprintf(&sb, `{"id":"c-%d","rule":"rule_set=google-ip => route(proxy)"}`, i)
	}

	sb.WriteString(`]}`)

	return sb.String()
}

type fakeVolumes struct {
	totals []int64
	flows  [][]history.Flow
}

func (f *fakeVolumes) ObserveTraffic(total int64, flows []history.Flow, _ map[string]struct{}) {
	f.totals = append(f.totals, total)
	f.flows = append(f.flows, flows)
}

func (f *fakeVolumes) HasTraffic(string) bool { return false }

// The kind comes from the type of the final outbound, the first chain node: a tag
// named like a proxy can be a direct exit, and the reverse.
func TestCounterSplitsVolumeByOutboundType(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules": rulesBody,
		"/proxies": `{"proxies":{
			"wan-ru":{"type":"Direct"},
			"proxy":{"type":"Selector"},
			"nested":{"type":"URLTest"},
			"nl":{"type":"VLESS"},
			"drop":{"type":"Reject"}
		}}`,
		"/connections": `{"uploadTotal":700,"downloadTotal":900,"connections":[
			{"id":"a","rule":"rule_set=google-ip => route(proxy)","chains":["nl","nested","proxy"],"upload":100,"download":200},
			{"id":"b","rule":"final","chains":["wan-ru"],"upload":10,"download":20},
			{"id":"c","rule":"final","chains":["drop"]},
			{"id":"d","rule":"final","chains":["from-subscription"],"upload":1,"download":2}
		]}`,
	}}
	volumes := &fakeVolumes{}
	counter := NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second, Volumes: volumes})

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	if len(volumes.totals) != 1 || volumes.totals[0] != 1600 {
		t.Fatalf("totals: got %v, want [1600]", volumes.totals)
	}

	want := []history.Flow{
		{ID: "a", Kind: history.KindProxy, Bytes: 300, Outbound: "proxy", Server: "nl"},
		{ID: "b", Kind: history.KindDirect, Bytes: 30, Outbound: "wan-ru", Final: true},
		{ID: "c", Kind: history.KindBlock, Outbound: "drop", Final: true},
		{ID: "d", Kind: history.KindProxy, Bytes: 3, Outbound: "from-subscription", Server: "from-subscription", Final: true},
	}
	if !slices.Equal(volumes.flows[0], want) {
		t.Errorf("flows: got %+v, want %+v", volumes.flows[0], want)
	}
}

// The outbound list is reread when a tag is missing, once per snapshot, and not on
// every snapshot of known tags.
func TestCounterRereadsOutboundsOnUnknownTag(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":   rulesBody,
		"/proxies": `{"proxies":{"nl":{"type":"VLESS"}}}`,
		"/connections": `{"connections":[
			{"id":"a","rule":"final","chains":["nl"]}
		]}`,
	}}
	counter := NewCounter(source, discardLogger(), CounterOptions{Interval: time.Second, Volumes: &fakeVolumes{}})

	for range 3 {
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
	}

	source.bodies["/connections"] = `{"connections":[
		{"id":"b","rule":"final","chains":["gone"]},
		{"id":"c","rule":"final","chains":["also-gone"]}
	]}`
	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	reads := 0
	for _, call := range source.calls {
		if call == "/proxies" {
			reads++
		}
	}

	if reads != 2 {
		t.Errorf("outbound list reads: got %d, want 2", reads)
	}
}

func TestCounterPrunesTrafficOnlyAfterConfigAndRuntimeConfirmRemoval(t *testing.T) {
	source := &fakeSource{bodies: map[string]string{
		"/rules":       rulesBody,
		"/proxies":     `{"proxies":{"direct":{"type":"Direct"},"from-config":{"type":"VLESS"},"from-runtime":{"type":"VLESS"},"removed":{"type":"VLESS"}}}`,
		"/connections": `{"connections":[]}`,
	}}
	volume := &history.Volume{}
	revision := "v1"
	tags := map[string]struct{}{"direct": {}, "from-config": {}, "removed": {}}
	counter := NewCounter(source, discardLogger(), CounterOptions{
		Interval: time.Second,
		Volumes:  volume,
		TrafficConfig: func(context.Context) (string, map[string]struct{}, error) {
			return revision, tags, nil
		},
	})

	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}
	source.bodies["/connections"] = `{"downloadTotal":50,"connections":[
		{"id":"a","rule":"final","chains":["from-config"],"download":10},
		{"id":"b","rule":"final","chains":["from-runtime"],"download":10},
		{"id":"c","rule":"final","chains":["removed"],"download":10},
		{"id":"d","rule":"final","chains":["direct"],"download":20}
	]}`
	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}

	revision = "v2"
	tags = map[string]struct{}{"direct": {}, "from-config": {}}
	source.bodies["/connections"] = `{"downloadTotal":50,"connections":[]}`
	source.bodies["/proxies"] = `{}`
	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, kept := volume.Traffic().Outbounds["removed"]; !kept {
		t.Fatal("a response without a runtime list pruned traffic")
	}

	source.bodies["/proxies"] = `{"proxies":{"direct":{"type":"Direct"},"from-runtime":{"type":"VLESS"}}}`
	if err := counter.observe(t.Context()); err != nil {
		t.Fatal(err)
	}
	traffic := volume.Traffic()
	if _, exists := traffic.Outbounds["removed"]; exists {
		t.Errorf("removed outbound remains in %+v", traffic.Outbounds)
	}
	if _, exists := traffic.Servers["removed"]; exists {
		t.Errorf("removed server remains in %+v", traffic.Servers)
	}
	if len(traffic.Outbounds) != 3 || len(traffic.Servers) != 2 || traffic.Split != (history.Split{Proxy: 30, Direct: 20}) {
		t.Errorf("rows or kind split after removal: got %+v, want rows kept for both config and runtime tags", traffic)
	}
}

func TestCounterRetriesRetainedTrafficUntilTheRemovedTagLeavesRuntime(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{bodies: map[string]string{
			"/rules":       rulesBody,
			"/proxies":     `{"proxies":{"old":{"type":"VLESS"}}}`,
			"/connections": `{"connections":[]}`,
		}}
		var volume history.Volume
		revision := "v1"
		tags := map[string]struct{}{"old": {}}
		counter := NewCounter(source, discardLogger(), CounterOptions{
			Volumes: &volume,
			TrafficConfig: func(context.Context) (string, map[string]struct{}, error) {
				return revision, tags, nil
			},
		})

		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		source.bodies["/connections"] = `{"downloadTotal":10,"connections":[{"id":"a","rule":"final","chains":["old"],"download":10}]}`
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		// The applied file is newer than the core that supplied this snapshot.
		revision = "v2"
		tags = map[string]struct{}{}
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		if _, exists := volume.Traffic().Outbounds["old"]; !exists {
			t.Fatal("tag still present in runtime was pruned")
		}

		source.bodies["/connections"] = `{"downloadTotal":10,"connections":[]}`
		source.bodies["/proxies"] = `{}`
		time.Sleep(time.Second)
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		if _, exists := volume.Traffic().Outbounds["old"]; !exists {
			t.Fatal("runtime list was polled again before the delayed refresh")
		}

		time.Sleep(4 * time.Second)
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		if !volume.HasTraffic("old") {
			t.Fatal("failed delayed refresh pruned traffic")
		}

		source.bodies["/proxies"] = `{"proxies":{"old":{"type":"VLESS"},"subscription":{"type":"VLESS"}}}`
		time.Sleep(5 * time.Second)
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		if !volume.HasTraffic("old") {
			t.Fatal("successful retry pruned a tag still present in the old runtime")
		}

		source.bodies["/proxies"] = `{"proxies":{"subscription":{"type":"VLESS"}}}`
		time.Sleep(5 * time.Second)
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		if traffic := volume.Traffic(); len(traffic.Outbounds) != 0 || traffic.Split.Proxy != 10 {
			t.Errorf("volumes after delayed refresh: got %+v, want no rows and retained kind split", traffic)
		}

		time.Sleep(5 * time.Second)
		if err := counter.observe(t.Context()); err != nil {
			t.Fatal(err)
		}
		reads := 0
		for _, call := range source.calls {
			if call == "/proxies" {
				reads++
			}
		}
		if reads != 5 {
			t.Errorf("runtime list reads: got %d, want 5", reads)
		}
	})
}
