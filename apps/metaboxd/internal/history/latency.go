package history

import (
	"cmp"
	"maps"
	"math"
	"slices"
	"sync"
	"time"
)

// MaxLatencyServers bounds the number of histories retained by the daemon.
const MaxLatencyServers = 4096

const (
	latencyRecent     = 10
	latencyHours      = 24
	latencyHourPoints = 64
	latencySlowChecks = 3
	latencyCeilingMS  = 1500
)

// LatencyLevel describes the current reading against the server's usual latency.
type LatencyLevel string

// Latency levels distinguish an unavailable reading from a failed attempt.
const (
	LatencyNoMeasurement LatencyLevel = "no_measurement"
	LatencyNoAnswer      LatencyLevel = "no_answer"
	LatencyWithinNorm    LatencyLevel = "within_norm"
	LatencyAboveNorm     LatencyLevel = "above_norm"
	LatencyAboveCeiling  LatencyLevel = "above_ceiling"
)

// LatencySample is the latest successful reading supplied by the core.
type LatencySample struct {
	At      time.Time
	DelayMS int
	// Pending keeps the tag listed while a manual check can publish the same result.
	Pending bool
}

// LatencyResult represents a successful measurement or an attempt with no answer.
type LatencyResult struct {
	At      time.Time `json:"at"`
	DelayMS *int      `json:"delay_ms,omitempty"`
}

// LatencyMedian is the median of the retained successful readings of a completed UTC hour.
type LatencyMedian struct {
	Hour    time.Time `json:"hour"`
	DelayMS int       `json:"delay_ms"`
}

// ServerLatency separates the current process reading from the daemon's history.
type ServerLatency struct {
	Tag     string          `json:"tag"`
	Current *LatencyResult  `json:"current,omitempty"`
	Recent  []LatencyResult `json:"recent"`
	Hourly  []LatencyMedian `json:"hourly"`
	UsualMS *int            `json:"usual_ms,omitempty"`
	Level   LatencyLevel    `json:"level"`
	Origin  string          `json:"origin"`
}

// Latency keeps bounded histories for the lifetime of the daemon.
type Latency struct {
	mu       sync.Mutex
	epoch    string
	known    bool
	lastPoll time.Time
	servers  map[string]*serverLatency
}

type latencyPoint struct {
	at      int64
	delayMS int
}

type serverLatency struct {
	listed bool
	recent []latencyPoint
	hours  []latencyPoint

	openHour   time.Time
	openValues []uint16
	openNext   int
	openMedian int

	lastCore time.Time
	coreLive bool
	manualAt time.Time
	last     latencyPoint
	levels   [latencySlowChecks]int
	checks   int
}

// NewLatency builds an empty history.
func NewLatency() *Latency {
	return &Latency{servers: make(map[string]*serverLatency)}
}

// SetEpoch updates the current process identity. Uncertainty hides current readings
// without letting an unverified poll discard the previously collected history.
func (l *Latency) SetEpoch(epoch string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.known = epoch != ""
	if !l.known || l.epoch == epoch {
		return
	}

	l.epoch = epoch
	l.lastPoll = time.Time{}
	for _, row := range l.servers {
		row.resetCurrent()
	}
}

// Observe records one complete controller snapshot, taken at the supplied time.
// A listed tag with no history entry has a nil sample. A nil map is incomplete.
func (l *Latency) Observe(epoch string, at time.Time, listed map[string]*LatencySample) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.accepts(epoch) || at.IsZero() || !at.After(l.lastPoll) || listed == nil {
		return
	}

	l.lastPoll = at
	l.updateMembership(at, listed)

	for tag, sample := range listed {
		if row := l.servers[tag]; row != nil {
			row.observe(at, sample)
		}
	}
}

// RecordManual records the result of a user-requested check if its original process
// can still be verified. Daemon callers distinguish an upstream no-answer from a
// request or transport failure before recording the result here.
func (l *Latency) RecordManual(epoch, tag string, at time.Time, delayMS int, success bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.accepts(epoch) || tag == "" || at.IsZero() || (success && !validDelay(delayMS)) {
		return
	}

	row := l.servers[tag]
	if row == nil {
		if len(l.servers) == MaxLatencyServers {
			delete(l.servers, l.oldestEntry())
		}
		row = &serverLatency{listed: true}
		l.servers[tag] = row
	}
	if !at.After(row.manualAt) {
		return
	}

	row.markListed()
	row.manualAt = at
	row.coreLive = success
	if !success {
		delayMS = -1
	}
	row.record(at, delayMS)
}

func (l *Latency) accepts(epoch string) bool {
	return l.known && l.epoch == epoch
}

func (l *Latency) updateMembership(at time.Time, listed map[string]*LatencySample) {
	cutoff := at.Add(-latencyHours * time.Hour).UnixNano()
	var retired []string
	for tag, row := range l.servers {
		if _, present := listed[tag]; present {
			row.markListed()

			continue
		}
		if row.manualAt.After(at) {
			continue
		}
		row.resetCurrent()
		row.listed = false
		if row.activity() < cutoff {
			delete(l.servers, tag)
		} else {
			retired = append(retired, tag)
		}
	}

	if len(l.servers) >= MaxLatencyServers && len(retired) == 0 {
		return
	}

	slices.SortFunc(retired, func(a, b string) int {
		return cmp.Or(cmp.Compare(l.servers[a].activity(), l.servers[b].activity()), cmp.Compare(a, b))
	})
	for _, tag := range slices.Sorted(maps.Keys(listed)) {
		if l.servers[tag] != nil || tag == "" {
			continue
		}
		if len(l.servers) == MaxLatencyServers {
			if len(retired) == 0 {
				return
			}

			delete(l.servers, retired[0])
			retired = retired[1:]
		}
		l.servers[tag] = &serverLatency{listed: true}
	}
}

func (l *Latency) oldestEntry() string {
	var oldestTag string
	var oldest *serverLatency

	for tag, row := range l.servers {
		if oldest == nil || row.evictionPriority(tag, oldestTag, oldest) < 0 {
			oldestTag, oldest = tag, row
		}
	}

	return oldestTag
}

func (r *serverLatency) evictionPriority(tag, otherTag string, other *serverLatency) int {
	if r.listed != other.listed {
		if r.listed {
			return 1
		}

		return -1
	}

	return cmp.Or(cmp.Compare(r.activity(), other.activity()), cmp.Compare(tag, otherTag))
}

func (r *serverLatency) activity() int64 {
	if len(r.recent) == 0 {
		return math.MinInt64
	}

	return r.recent[len(r.recent)-1].at
}

func (r *serverLatency) markListed() {
	if !r.listed {
		// A tag reused after removal may refer to a different server.
		*r = serverLatency{listed: true}
	}
}

func (r *serverLatency) resetCurrent() {
	r.lastCore = time.Time{}
	r.coreLive = false
	r.manualAt = time.Time{}
	r.last = latencyPoint{}
	r.checks = 0
}

func (r *serverLatency) observe(at time.Time, sample *LatencySample) {
	if sample != nil && sample.Pending {
		return
	}
	if at.Before(r.manualAt) {
		return
	}

	if sample == nil {
		if r.coreLive {
			r.coreLive = false
			r.record(at, -1)
		}

		return
	}

	if sample.At.After(at) || !sample.At.After(r.lastCore) || !validDelay(sample.DelayMS) {
		return
	}

	r.lastCore = sample.At
	// A manual result has already recorded the core cache write that preceded it.
	if !sample.At.After(r.manualAt) {
		return
	}

	r.coreLive = true
	if !sample.At.Before(at.Add(-latencyHours * time.Hour)) {
		r.record(sample.At, sample.DelayMS)
	}
}

func validDelay(delayMS int) bool { return delayMS >= 0 && delayMS <= math.MaxUint16 }

func (r *serverLatency) record(at time.Time, delayMS int) {
	point := latencyPoint{at: at.UnixNano(), delayMS: delayMS}
	if r.recent == nil {
		r.recent = make([]latencyPoint, 0, latencyRecent)
	}
	if len(r.recent) < latencyRecent {
		r.recent = append(r.recent, point)
	} else {
		copy(r.recent, r.recent[1:])
		r.recent[len(r.recent)-1] = point
	}

	if r.checks == latencySlowChecks {
		copy(r.levels[:], r.levels[1:])
		r.checks--
	}
	r.levels[r.checks] = delayMS
	r.checks++
	r.last = point

	if delayMS >= 0 && delayMS <= math.MaxUint16 {
		r.recordHour(at, uint16(delayMS))
	}
}

func (r *serverLatency) recordHour(at time.Time, delay uint16) {
	hour := at.UTC().Truncate(time.Hour)
	if hour.Before(r.openHour) {
		return
	}
	if hour.After(r.openHour) {
		cutoff := hour.Add(-latencyHours * time.Hour)
		r.hours = slices.DeleteFunc(r.hours, func(point latencyPoint) bool {
			return point.at < cutoff.UnixNano()
		})
		if len(r.openValues) > 0 && !r.openHour.Before(cutoff) {
			if r.hours == nil {
				r.hours = make([]latencyPoint, 0, latencyHours)
			}
			r.hours = append(r.hours, latencyPoint{at: r.openHour.UnixNano(), delayMS: r.medianOpenHour()})
		}
		r.openHour = hour
		r.openValues = r.openValues[:0]
		r.openNext = 0
	}

	if r.openValues == nil {
		r.openValues = make([]uint16, 0, latencyHourPoints)
	}
	if len(r.openValues) < latencyHourPoints {
		r.openValues = append(r.openValues, delay)
	} else {
		r.openValues[r.openNext] = delay
		r.openNext = (r.openNext + 1) % latencyHourPoints
	}
	r.openMedian = -1
}

func (r *serverLatency) medianOpenHour() int {
	if r.openMedian < 0 {
		var sorted [latencyHourPoints]uint16
		copy(sorted[:], r.openValues)
		sample := sorted[:len(r.openValues)]
		slices.Sort(sample)
		r.openMedian = (int(sample[(len(sample)-1)/2]) + int(sample[len(sample)/2])) / 2
	}

	return r.openMedian
}

// Snapshot returns a detached, tag-sorted view. The current hour does not
// contribute to the median of medians before it is complete.
func (l *Latency) Snapshot(at time.Time) []ServerLatency {
	l.mu.Lock()
	defer l.mu.Unlock()

	rows := make([]ServerLatency, 0, len(l.servers))
	for _, tag := range slices.Sorted(maps.Keys(l.servers)) {
		row := l.servers[tag]
		snapshot := row.snapshot(tag, at, l.known)
		if row.listed || len(snapshot.Recent) > 0 || len(snapshot.Hourly) > 0 {
			rows = append(rows, snapshot)
		}
	}

	return rows
}

func (r *serverLatency) snapshot(tag string, at time.Time, known bool) ServerLatency {
	row := ServerLatency{
		Tag: tag, Level: LatencyNoMeasurement, Origin: "computed",
		Recent: []LatencyResult{},
	}
	now := at.UnixNano()
	cutoff := at.Add(-latencyHours * time.Hour).UnixNano()
	for _, point := range r.recent {
		if point.at >= cutoff && point.at <= now {
			row.Recent = append(row.Recent, point.result())
		}
	}
	row.Hourly, row.UsualMS = r.completedHours(at)

	if known && r.listed && !r.manualAt.IsZero() && r.last.at <= now {
		result := r.last.result()
		row.Current = &result
		row.Level = latencyLevel(r.levels[:r.checks], row.UsualMS)
	}

	return row
}

func (r *serverLatency) completedHours(at time.Time) ([]LatencyMedian, *int) {
	hour := at.UTC().Truncate(time.Hour)
	cutoff := hour.Add(-latencyHours * time.Hour).UnixNano()
	includeOpen := len(r.openValues) > 0 && r.openHour.UnixNano() >= cutoff && r.openHour.Before(hour)
	count := len(r.hours)
	if includeOpen {
		count++
	}
	completed := make([]LatencyMedian, 0, count)
	var medians [latencyHours]int
	for _, point := range r.hours {
		if point.at >= cutoff && point.at < hour.UnixNano() {
			medians[len(completed)] = point.delayMS
			completed = append(completed, LatencyMedian{Hour: time.Unix(0, point.at).UTC(), DelayMS: point.delayMS})
		}
	}
	if includeOpen {
		median := r.medianOpenHour()
		medians[len(completed)] = median
		completed = append(completed, LatencyMedian{Hour: r.openHour, DelayMS: median})
	}
	if len(completed) == 0 {
		return completed, nil
	}

	values := medians[:len(completed)]
	slices.Sort(values)
	usual := (values[(len(values)-1)/2] + values[len(values)/2]) / 2

	return completed, &usual
}

func (p latencyPoint) result() LatencyResult {
	result := LatencyResult{At: time.Unix(0, p.at).UTC()}
	if p.delayMS >= 0 {
		result.DelayMS = &p.delayMS
	}

	return result
}

func latencyLevel(results []int, usual *int) LatencyLevel {
	if len(results) == 0 {
		return LatencyNoMeasurement
	}

	current := results[len(results)-1]
	switch {
	case current < 0:
		return LatencyNoAnswer
	case current >= latencyCeilingMS:
		return LatencyAboveCeiling
	case usual != nil && len(results) == latencySlowChecks:
		for _, result := range results {
			if result <= *usual {
				return LatencyWithinNorm
			}
		}

		return LatencyAboveNorm
	default:
		return LatencyWithinNorm
	}
}
