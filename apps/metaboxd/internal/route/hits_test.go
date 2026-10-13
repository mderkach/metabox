package route

import (
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

// The benchmark holds the NFR-2 ceiling: five thousand live connections, the price of one
// counter poll in the steady state, with all connections already counted.
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
