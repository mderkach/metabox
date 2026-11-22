package history

import (
	"math/bits"
	"sync"
	"time"
)

// Kind is where a connection left sing-box: through a proxy, directly or into a reject.
type Kind int

// Connection kinds; kinds is their count, not a kind.
const (
	KindProxy Kind = iota
	KindDirect
	KindBlock
	kinds
)

// Flow is one live connection with its cumulative bytes, both directions together.
type Flow struct {
	ID       string
	Kind     Kind
	Bytes    int64
	Outbound string
	Server   string
	Final    bool
}

// Split is the bytes that passed through sing-box since the daemon start, by connection kind.
type Split struct {
	Proxy  int64 `json:"proxy"`
	Direct int64 `json:"direct"`
	Block  int64 `json:"block"`
}

// TrafficOrigin indicates whether the total includes bytes inferred from the process counter.
type TrafficOrigin string

// Traffic origins distinguish observed increments from weighted estimates.
const (
	TrafficObserved TrafficOrigin = "observed"
	TrafficComputed TrafficOrigin = "computed"
)

// TrafficValue is the retained volume and the most recent interval rate in bytes per second.
type TrafficValue struct {
	Bytes  int64         `json:"bytes"`
	Rate   float64       `json:"rate"`
	Origin TrafficOrigin `json:"origin"`
}

// OutboundTraffic separates traffic matched by explicit rules from the default route.
type OutboundTraffic struct {
	Bytes  int64         `json:"bytes"`
	Rate   float64       `json:"rate"`
	Origin TrafficOrigin `json:"origin"`
	Final  *TrafficValue `json:"final,omitempty"`
}

// TrafficTotals takes the kind split and rows from the same snapshot.
type TrafficTotals struct {
	Split     Split
	Outbounds map[string]OutboundTraffic
	Servers   map[string]TrafficValue
}

type outboundKey struct {
	tag   string
	final bool
}

type flowBucket struct {
	outbound outboundKey
	server   string
	kind     Kind
}

type flowState struct {
	bucket flowBucket
	bytes  int64
	// The last increment weighs the tail of a connection that closed between polls.
	delta int64
}

type trafficCounter struct {
	total         int64
	intervalBytes int64
	sample        uint64
	computed      bool
}

// Volume accumulates traffic from the live connection snapshots. Bytes that are
// only visible in the process total are spread by the increments of live
// connections and the last increments of closed ones.
type Volume struct {
	mu sync.Mutex

	sample    uint64
	sampleAt  time.Time
	elapsed   time.Duration
	total     int64
	flows     map[string]flowState
	split     [kinds]int64
	pending   int64
	outbounds map[outboundKey]trafficCounter
	servers   map[string]trafficCounter
}

// Observe takes a snapshot without refreshing the set of retained tags.
func (v *Volume) Observe(total int64, flows []Flow) {
	v.ObserveTraffic(total, flows, nil)
}

// ObserveTraffic takes the next snapshot. The first snapshot and a decreased
// process total are baselines. A non-nil retained set removes rows for tags absent
// from both config and runtime without losing their past contribution to the split.
func (v *Volume) ObserveTraffic(total int64, flows []Flow, retained map[string]struct{}) {
	v.mu.Lock()
	defer v.mu.Unlock()

	now := time.Now()
	baseline := v.sample == 0 || total < v.total
	v.elapsed = now.Sub(v.sampleAt)
	v.sampleAt = now
	v.sample++

	current := make(map[string]flowState, len(flows))
	weights := make(map[flowBucket]int64)

	var byKind [kinds]int64
	var increment int64

	for _, flow := range flows {
		bucket := flowBucket{outbound: outboundKey{tag: flow.Outbound, final: flow.Final}, server: flow.Server, kind: flow.Kind}
		state := flowState{bucket: bucket, bytes: flow.Bytes}
		if !baseline {
			state.delta = max(0, flow.Bytes-v.flows[flow.ID].bytes)
			if state.delta > 0 {
				v.record(bucket, state.delta, state.delta, false)
				weights[bucket] += state.delta
				byKind[bucket.kind] += state.delta
				increment += state.delta
			}
		}

		current[flow.ID] = state
	}

	if !baseline {
		for id, previous := range v.flows {
			if _, live := current[id]; !live && previous.delta > 0 {
				weights[previous.bucket] += previous.delta
				byKind[previous.bucket.kind] += previous.delta
			}
		}

		v.spread(max(0, total-v.total-increment), weights, byKind)
	}

	v.total = total
	v.flows = current

	if retained != nil {
		for key := range v.outbounds {
			if _, keep := retained[key.tag]; !keep {
				delete(v.outbounds, key)
			}
		}
		for tag := range v.servers {
			if _, keep := retained[tag]; !keep {
				delete(v.servers, tag)
			}
		}
	}
}

func (v *Volume) record(bucket flowBucket, bytes, intervalBytes int64, computed bool) {
	v.split[bucket.kind] += bytes
	if bucket.outbound.tag != "" {
		if v.outbounds == nil {
			v.outbounds = make(map[outboundKey]trafficCounter)
		}

		v.outbounds[bucket.outbound] = v.outbounds[bucket.outbound].add(v.sample, bytes, intervalBytes, computed)
	}

	if bucket.server != "" {
		if v.servers == nil {
			v.servers = make(map[string]trafficCounter)
		}

		v.servers[bucket.server] = v.servers[bucket.server].add(v.sample, bytes, intervalBytes, computed)
	}
}

func (c trafficCounter) add(sample uint64, bytes, intervalBytes int64, computed bool) trafficCounter {
	if c.sample != sample {
		c.sample = sample
		c.intervalBytes = 0
	}

	c.total += bytes
	c.intervalBytes += intervalBytes
	c.computed = c.computed || computed

	return c
}

// spread allocates the remainder to kinds first, then distributes each kind's
// share to its own buckets so rounding cannot make row totals diverge.
func (v *Volume) spread(remainder int64, weights map[flowBucket]int64, byKind [kinds]int64) {
	if remainder == 0 && v.pending == 0 {
		return
	}

	var sum int64

	heaviest := KindProxy
	for kind, weight := range byKind {
		sum += weight
		if weight > byKind[heaviest] {
			heaviest = Kind(kind)
		}
	}

	if sum == 0 {
		v.pending += remainder

		return
	}

	if v.pending > 0 {
		v.spreadWeighted(v.pending, weights, byKind, sum, heaviest, false)
		v.pending = 0
	}

	if remainder > 0 {
		v.spreadWeighted(remainder, weights, byKind, sum, heaviest, true)
	}
}

func (v *Volume) spreadWeighted(
	remainder int64, weights map[flowBucket]int64, byKind [kinds]int64, sum int64, heaviest Kind, current bool,
) {
	record := func(bucket flowBucket, bytes int64) {
		intervalBytes := int64(0)
		if current {
			intervalBytes = bytes
		}
		v.record(bucket, bytes, intervalBytes, true)
	}

	var byKindShare [kinds]int64

	left := remainder
	for kind, weight := range byKind {
		part := weightedShare(remainder, weight, sum)
		byKindShare[kind] = part
		left -= part
	}
	byKindShare[heaviest] += left

	tails := byKindShare

	var leaders [kinds]flowBucket
	var maxWeight [kinds]int64
	for bucket, weight := range weights {
		kind := bucket.kind
		part := weightedShare(byKindShare[kind], weight, byKind[kind])
		if part > 0 {
			record(bucket, part)
			tails[kind] -= part
		}

		if weight > maxWeight[kind] || weight == maxWeight[kind] && bucket.before(leaders[kind]) {
			maxWeight[kind] = weight
			leaders[kind] = bucket
		}
	}

	for kind, tail := range tails {
		if tail > 0 {
			record(leaders[kind], tail)
		}
	}
}

func weightedShare(bytes, weight, sum int64) int64 {
	if bytes <= 0 || weight <= 0 || sum <= 0 {
		return 0
	}
	if weight >= sum {
		return bytes
	}

	hi, lo := bits.Mul64(uint64(bytes), uint64(weight))
	part, _ := bits.Div64(hi, lo, uint64(sum))

	// The fraction is less than one, so the quotient fits in the input's int64 range.
	return int64(part) // #nosec G115
}

func (b flowBucket) before(other flowBucket) bool {
	if b.outbound.tag != other.outbound.tag {
		return b.outbound.tag < other.outbound.tag
	}
	if b.server != other.server {
		return b.server < other.server
	}

	return !b.outbound.final && other.outbound.final
}

// Split returns the accumulated bytes by kind.
func (v *Volume) Split() Split {
	v.mu.Lock()
	defer v.mu.Unlock()

	return v.kindSplit()
}

func (v *Volume) kindSplit() Split {
	return Split{Proxy: v.split[KindProxy], Direct: v.split[KindDirect], Block: v.split[KindBlock]}
}

// HasTraffic reports whether a retained outbound or server has a traffic row for tag.
func (v *Volume) HasTraffic(tag string) bool {
	v.mu.Lock()
	defer v.mu.Unlock()

	return v.outbounds[outboundKey{tag: tag}].total > 0 ||
		v.outbounds[outboundKey{tag: tag, final: true}].total > 0 ||
		v.servers[tag].total > 0
}

// Traffic returns a copy of the cumulative rows and the kind split.
func (v *Volume) Traffic() TrafficTotals {
	v.mu.Lock()
	defer v.mu.Unlock()

	out := TrafficTotals{
		Split:     v.kindSplit(),
		Outbounds: make(map[string]OutboundTraffic, len(v.outbounds)),
		Servers:   make(map[string]TrafficValue, len(v.servers)),
	}
	for key, counter := range v.outbounds {
		value := v.value(counter)
		row, ok := out.Outbounds[key.tag]
		if !ok {
			row.Origin = TrafficObserved
		}

		if key.final {
			row.Final = &value
		} else {
			row.Bytes = value.Bytes
			row.Rate = value.Rate
			row.Origin = value.Origin
		}

		out.Outbounds[key.tag] = row
	}

	for tag, counter := range v.servers {
		out.Servers[tag] = v.value(counter)
	}

	return out
}

func (v *Volume) value(counter trafficCounter) TrafficValue {
	value := TrafficValue{Bytes: counter.total, Origin: TrafficObserved}
	if counter.computed {
		value.Origin = TrafficComputed
	}
	if counter.sample == v.sample && v.elapsed > 0 {
		value.Rate = float64(counter.intervalBytes) / v.elapsed.Seconds()
	}

	return value
}
