package device

import "sync"

// Meter accumulates the increment of a foreign counter.
//
// The device and Clash API counters are cumulative but start from different
// events: one from the link coming up, the other from the process start. They can be
// compared only by increments over one window, so the increments are accumulated by the daemon and
// not by the consumer.
type Meter struct {
	mu    sync.Mutex
	seen  bool
	last  int64
	total int64
}

// Add adds an increment counted outside. This is how what the source
// returns not as a counter but as a portion per interval is accumulated.
func (m *Meter) Add(delta int64) {
	if delta <= 0 {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.total += delta
}

// Observe takes the current value of the source counter. A value smaller than
// the previous one means the source restarted: counting then starts
// anew, and what is accumulated stays.
func (m *Meter) Observe(value int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.seen && value >= m.last {
		m.total += value - m.last
	}

	m.seen = true
	m.last = value
}

// Rebase forgets the previous value, keeping what is accumulated: this way the counter of a new
// source does not arrive in the total as one jump.
func (m *Meter) Rebase() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.seen = false
	m.last = 0
}

// Total returns the accumulated increment.
func (m *Meter) Total() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.total
}

// Share is how much passed through the channel and through sing-box during the observation.
// The share is computed by dividing one by the other and is meaningful only together with
// Seconds: the window starts when the daemon first took readings.
type Share struct {
	Link    int64 `json:"link"`
	Proxy   int64 `json:"proxy"`
	Seconds int   `json:"seconds"`
}
