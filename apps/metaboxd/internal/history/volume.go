package history

import "sync"

// Kind is where a connection left sing-box: through a proxy, directly or into a reject.
type Kind int

// Connection kinds; kinds is their count, not a kind.
const (
	KindProxy Kind = iota
	KindDirect
	KindBlock
	kinds
)

// Flow is one live connection of a snapshot with its cumulative bytes, both directions together.
type Flow struct {
	ID    string
	Kind  Kind
	Bytes int64
}

// Split is the bytes that passed through sing-box since the daemon start, by connection kind.
type Split struct {
	Proxy  int64 `json:"proxy"`
	Direct int64 `json:"direct"`
	Block  int64 `json:"block"`
}

type flowState struct {
	kind  Kind
	bytes int64
	// delta is the increment over the last interval: the weight of a connection
	// that closed before the next snapshot.
	delta int64
}

// Volume accumulates the traffic split by connection kind from `/connections` snapshots.
//
// The snapshot lists only live connections. The bytes a connection sent after the
// last snapshot before it closed, and the whole connection that opened and closed
// between two snapshots, are only in the process total. That remainder, the total
// increment minus the increments of the live connections, is spread over the kinds
// by what moved in the same interval: live connections by their increment, the
// closed ones by their last increment. An interval with no weight keeps the
// remainder for the next one, so the parts always add up to the process total.
type Volume struct {
	mu sync.Mutex

	seen    bool
	total   int64
	flows   map[string]flowState
	split   [kinds]int64
	pending int64
}

// Observe takes the next snapshot: the process byte total and its live connections.
// The first snapshot and the one after a process restart, seen by a total that went
// down, are only a baseline.
func (v *Volume) Observe(total int64, flows []Flow) {
	v.mu.Lock()
	defer v.mu.Unlock()

	current := make(map[string]flowState, len(flows))
	baseline := !v.seen || total < v.total

	var observed, weights [kinds]int64
	var increment int64

	for _, flow := range flows {
		state := flowState{kind: flow.Kind, bytes: flow.Bytes}

		if previous, ok := v.flows[flow.ID]; ok {
			state.delta = max(0, flow.Bytes-previous.bytes)
		} else if !baseline {
			state.delta = flow.Bytes
		}

		current[flow.ID] = state
		observed[flow.Kind] += state.delta
		weights[flow.Kind] += state.delta
		increment += state.delta
	}

	if !baseline {
		for id, previous := range v.flows {
			if _, live := current[id]; !live {
				weights[previous.kind] += previous.delta
			}
		}

		for kind := range kinds {
			v.split[kind] += observed[kind]
		}

		v.spread(max(0, total-v.total-increment), weights)
	}

	v.seen = true
	v.total = total
	v.flows = current
}

// spread hands the bytes not seen on live connections to the kinds by weight; the
// rounding tail goes to the heaviest kind.
func (v *Volume) spread(remainder int64, weights [kinds]int64) {
	remainder += v.pending
	v.pending = 0

	var sum int64

	heaviest := KindProxy

	for kind := range kinds {
		sum += weights[kind]
		if weights[kind] > weights[heaviest] {
			heaviest = kind
		}
	}

	if sum == 0 {
		v.pending = remainder

		return
	}

	left := remainder

	for kind := range kinds {
		// float64: the product of two byte counts overflows int64 on a long uptime.
		part := int64(float64(remainder) * float64(weights[kind]) / float64(sum))
		v.split[kind] += part
		left -= part
	}

	v.split[heaviest] += left
}

// Split returns the accumulated bytes by kind.
func (v *Volume) Split() Split {
	v.mu.Lock()
	defer v.mu.Unlock()

	return Split{Proxy: v.split[KindProxy], Direct: v.split[KindDirect], Block: v.split[KindBlock]}
}
