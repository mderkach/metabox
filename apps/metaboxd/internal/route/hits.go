package route

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// RuleHits are the hits of one rule of the running process.
type RuleHits struct {
	Index int    `json:"index"`
	Hits  uint64 `json:"hits"`
	// Counted is whether the rule is visible in the connection list at all. The Clash API writes for
	// a connection only the rule on which the iteration stopped, and only for
	// connections that went to an outbound: `sniff` and `resolve` do not stop
	// the iteration, an intercepted DNS and a rejected connection do not get into the list.
	// For such rules zero would mean not "did not fire" but "not visible".
	Counted bool `json:"counted"`
}

// Hits is the response of the rule hit counter handler.
//
// The count is observed, not exact: a connection that opened and closed
// between two snapshots will no longer be shown by core and will not get into the count.
type Hits struct {
	// Seconds is how long the count has been running. It lives in the daemon memory and starts with its
	// start: the router has no real-time clock, so a duration is returned,
	// not a start moment.
	Seconds int64 `json:"seconds"`
	// Rules is an entry for each rule of the running process, in its order.
	// The panel compares the length with route.rules of the applied document, as with
	// the route explanation.
	Rules []RuleHits `json:"rules"`
	// Final counts connections that matched no rule and went to
	// route.final.
	Final uint64 `json:"final"`
}

// Counter counts how many connections fell on each rule, by snapshots
// `/connections`.
//
// Works for the whole daemon lifetime, whether the panel is open or not: the second exception
// to the rule "no background polling without a consumer", after traffic accounting:
// a connection not noticed in time is not restored retroactively.
// The price at idle is one connections snapshot per interval and the rule list, when
// a rule is met that is not in the remembered list. The runtime stream reads this same snapshot
// through Snapshots: the daemon has no second `/connections` poll.
//
// The count is kept by the rule conditions and action, not by number: after an
// apply that reordered the rules the count stays with its own rule.
type Counter struct {
	source Source
	log    *slog.Logger
	opts   CounterOptions

	seen  map[string]struct{}
	rules []Rule

	mu      sync.Mutex
	started time.Time
	hits    map[string]uint64
	final   uint64

	stop context.CancelFunc
	done chan struct{}
}

// SizeRecorder accepts the number of live connections of a snapshot. The counter takes the snapshot
// once a second anyway, so the connection count history is kept by it too, not by
// a second poll.
type SizeRecorder interface {
	Record(count int)
}

// CounterOptions sets the polling period and the consumers of the taken snapshot.
type CounterOptions struct {
	// Interval is the period of the `/connections` snapshot.
	Interval time.Duration
	// Retry is the pause after a failed snapshot, the same meaning as RetryInterval
	// of the runtime stream: with sing-box down the constant daemon polls wait
	// the same. Zero means Interval.
	Retry time.Duration
	// Sizes accepts the number of live connections of each snapshot; nil means not needed.
	Sizes SizeRecorder
	// Snapshots accepts the raw snapshot of each successful poll, so the runtime
	// stream gets connections without its own trip to the Clash API.
	// nil means not needed.
	Snapshots func(json.RawMessage)
}

// NewCounter assembles the counter. It starts no polling: Start brings it up.
func NewCounter(source Source, log *slog.Logger, opts CounterOptions) *Counter {
	return &Counter{
		source: source,
		log:    log,
		opts:   opts,
		seen:   map[string]struct{}{},
		hits:   map[string]uint64{},
	}
}

// Start brings the polling up for the whole daemon runtime.
func (c *Counter) Start() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.stop != nil {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	c.stop, c.done = cancel, make(chan struct{})
	c.started = time.Now()

	go func(done chan struct{}) {
		defer close(done)
		c.run(ctx)
	}(c.done)
}

// Close stops the polling and waits for it.
func (c *Counter) Close() {
	c.mu.Lock()
	stop, done := c.stop, c.done
	c.stop, c.done = nil, nil
	c.mu.Unlock()

	if stop == nil {
		return
	}

	stop()
	<-done
}

func (c *Counter) run(ctx context.Context) {
	for {
		err := c.observe(ctx)
		if err != nil && ctx.Err() == nil {
			c.log.Debug("snapshot for rule hit counting not taken", "err", err)
		}

		pause := c.opts.Interval
		if err != nil && c.opts.Retry > 0 {
			pause = c.opts.Retry
		}

		timer := time.NewTimer(pause)

		select {
		case <-ctx.Done():
			timer.Stop()

			return
		case <-timer.C:
		}
	}
}

// observe counts the connections that were not in the previous snapshot.
func (c *Counter) observe(ctx context.Context) error {
	body, err := c.source.Snapshot(ctx, "/connections")
	if err != nil {
		return fmt.Errorf("connections: %w", err)
	}

	var snapshot clashConnections
	if err := json.Unmarshal(body, &snapshot); err != nil {
		return fmt.Errorf("parse connections snapshot: %w", err)
	}

	if c.opts.Sizes != nil {
		c.opts.Sizes.Record(len(snapshot.Connections))
	}

	if c.opts.Snapshots != nil {
		c.opts.Snapshots(body)
	}

	// seen and rules are touched only by the polling goroutine, under the mutex lies only
	// what Hits reads.
	rules := c.rules
	current := make(map[string]struct{}, len(snapshot.Connections))
	var fresh []clashConnection

	for _, connection := range snapshot.Connections {
		current[connection.ID] = struct{}{}
		if _, ok := c.seen[connection.ID]; !ok {
			fresh = append(fresh, connection)
		}
	}

	matches := make([]Match, len(fresh))
	refreshed := false

	for i, connection := range fresh {
		matches[i] = matchRule(connection.Rule, rules)

		// A rule that is not in the remembered list means the process
		// restarted on another config. The list is reread once per
		// snapshot: a connection not found in the fresh one either stays unknown.
		if matches[i].Kind == KindUnknown && !refreshed {
			refreshed = true

			if next, err := readRules(ctx, c.source); err == nil {
				rules = next
				matches[i] = matchRule(connection.Rule, rules)
			}
		}
	}

	c.rules = rules
	c.seen = current

	c.mu.Lock()
	defer c.mu.Unlock()

	for _, match := range matches {
		switch match.Kind {
		case KindFinal:
			c.final++
		case KindRule:
			c.hits[hitKey(match.Conditions, match.Action)]++
		case KindUnknown:
		}
	}

	return nil
}

// Hits returns the count by the rules of the running process. The rule list is read
// anew: the rule number is determined by what is loaded now.
func (c *Counter) Hits(ctx context.Context) (Hits, error) {
	rules, err := readRules(ctx, c.source)
	if err != nil {
		return Hits{}, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	counted := map[string]bool{}
	out := Hits{
		Seconds: int64(time.Since(c.started) / time.Second),
		Rules:   make([]RuleHits, 0, len(rules)),
		Final:   c.final,
	}

	for _, rule := range rules {
		key := hitKey(rule.Conditions, rule.Action)
		hits := uint64(0)

		// A rule with the same conditions and action lower in the list
		// never fires: the router stops at the first one.
		if !counted[key] {
			counted[key] = true
			hits = c.hits[key]
		}

		out.Rules = append(out.Rules, RuleHits{Index: rule.Index, Hits: hits, Counted: countable(rule.Action)})
	}

	return out, nil
}

// countable reports whether a connection with this action can end up in the connection
// list with this rule: only a route to an outbound, `route(...)` or
// `bypass(...)` with an outbound.
func countable(action string) bool {
	name, arguments, _ := strings.Cut(action, "(")

	switch name {
	case "route":
		return true
	case "bypass":
		return strings.TrimSuffix(arguments, ")") != ""
	default:
		return false
	}
}

func hitKey(conditions, action string) string {
	return conditions + "\x00" + action
}
