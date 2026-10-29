// Package history accumulates the runtime history on the daemon side.
//
// The panel keeps only the last minute in tab memory, and after a page reload
// the chart starts over. The history is needed for the whole daemon runtime,
// and there is nowhere to store it except the daemon itself: the `/traffic` stream gives the speed per
// second and does not rewind.
//
// The window is not sliding: a filled ring does not drop old points but
// doubles the step by merging neighbours. The chart always covers the whole daemon
// runtime while memory stays within bounds; the price is that the longer the daemon
// runs, the coarser the old sections.
//
// The buffer lives in memory: writing to the router flash for a chart is not worth its
// wear, and a daemon restart zeroes the history.
package history

import "sync"

// ring is a ring of points with step coarsening.
type ring[T any] struct {
	points []T
	first  int
	filled int
}

// push puts a point. When the point fills the ring, neighbouring points are merged
// in pairs and half the space is freed; in that case it returns true, and the caller
// doubles both the step and the readings per point, so the next point covers the
// same span as the merged ones.
func (r *ring[T]) push(point T, merge func(older, newer T) T) bool {
	if len(r.points) == 0 {
		return false
	}

	r.points[(r.first+r.filled)%len(r.points)] = point
	r.filled++

	if r.filled < len(r.points) {
		return false
	}

	r.compact(merge)

	return true
}

// compact merges neighbouring points in pairs, leaving half. After it the data
// lies from the start of the buffer.
func (r *ring[T]) compact(merge func(older, newer T) T) {
	merged := make([]T, 0, r.filled/2)

	for index := 0; index+1 < r.filled; index += 2 {
		older := r.points[(r.first+index)%len(r.points)]
		newer := r.points[(r.first+index+1)%len(r.points)]
		merged = append(merged, merge(older, newer))
	}

	copy(r.points, merged)
	r.first = 0
	r.filled = len(merged)
}

func (r *ring[T]) all() []T {
	points := make([]T, 0, r.filled)
	for index := range r.filled {
		points = append(points, r.points[(r.first+index)%len(r.points)])
	}

	return points
}

// Point is the average speed per step, bytes per second.
type Point struct {
	Down int64 `json:"down"`
	Up   int64 `json:"up"`
}

// DevicePoint is the board and process readings per step.
//
// Load and temperature are taken as the step peak, memory as the average. The history is needed
// to notice overheating and a leak over days of work, and on step coarsening the average
// would dissolve a short overheating among neighbouring calm minutes.
type DevicePoint struct {
	// Load is the average load per minute as the kernel gives it; the step peak.
	Load float64 `json:"load"`
	// Celsius is the hottest board zone, the step peak; zero means there are no zones.
	Celsius float64 `json:"celsius"`
	// Memory is the occupied board memory in bytes.
	Memory int64 `json:"memory"`
	// Singbox is the resident memory of the sing-box process in bytes; zero means the process
	// was not found. A leak is visible by it: the board memory as a whole blurs it.
	Singbox int64 `json:"singbox"`
	// Daemon is the resident memory of the daemon itself in bytes.
	Daemon int64 `json:"daemon"`
}

// Traffic is the traffic history.
//
// The step is counted in readings, not hours: the router has no clock before NTP
// synchronization, it jumps, and the point time cannot be restored by it.
type Traffic struct {
	mu sync.Mutex

	perPoint    int
	stepSeconds int
	ring        ring[Point]

	sumDown int64
	sumUp   int64
	counted int

	// recent is the last samples as is, one per second. The panel minute chart
	// takes them on open: otherwise it would start from an empty place and
	// show only what arrived while the tab was open.
	recent []Point
}

// RecentPoints is how many last samples are kept without averaging: a minute.
const RecentPoints = 60

// New assembles the traffic history: `perPoint` readings per point, `stepSeconds`
// seconds between points, `points` points before the first step coarsening.
func New(perPoint, stepSeconds, points int) *Traffic {
	return &Traffic{perPoint: perPoint, stepSeconds: stepSeconds, ring: ring[Point]{points: make([]Point, points)}}
}

// Record accepts a stream sample: the speed per second.
func (t *Traffic) Record(up, down int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.recent = append(t.recent, Point{Down: down, Up: up})
	if len(t.recent) > RecentPoints {
		t.recent = t.recent[len(t.recent)-RecentPoints:]
	}

	t.sumUp += up
	t.sumDown += down
	t.counted++

	if t.counted < t.perPoint {
		return
	}

	point := Point{Down: t.sumDown / int64(t.counted), Up: t.sumUp / int64(t.counted)}
	t.sumDown, t.sumUp, t.counted = 0, 0, 0

	if t.ring.push(point, mergePoints) {
		t.stepSeconds *= 2
		t.perPoint *= 2
	}
}

func mergePoints(older, newer Point) Point {
	return Point{Down: (older.Down + newer.Down) / 2, Up: (older.Up + newer.Up) / 2}
}

// Points returns the history from the old point to the new one.
func (t *Traffic) Points() []Point {
	t.mu.Lock()
	defer t.mu.Unlock()

	return t.ring.all()
}

// Recent returns the last samples without averaging, from old to new.
func (t *Traffic) Recent() []Point {
	t.mu.Lock()
	defer t.mu.Unlock()

	return append([]Point(nil), t.recent...)
}

// Step returns the current step between points in seconds: it grows with
// the daemon uptime.
func (t *Traffic) Step() int {
	t.mu.Lock()
	defer t.mu.Unlock()

	return t.stepSeconds
}

// Device is the board readings history. Its ring coarsens on its own schedule:
// the readings go on while the traffic stream is down, so its step is its own.
type Device struct {
	mu sync.Mutex

	perPoint    int
	stepSeconds int
	ring        ring[DevicePoint]

	step    DevicePoint
	counted int64
}

// NewDevice assembles the board history: `perPoint` readings per point, `stepSeconds`
// seconds between points, `points` points before the first step coarsening.
func NewDevice(perPoint, stepSeconds, points int) *Device {
	return &Device{
		perPoint:    perPoint,
		stepSeconds: stepSeconds,
		ring:        ring[DevicePoint]{points: make([]DevicePoint, points)},
	}
}

// Record accepts a readings take.
func (d *Device) Record(sample DevicePoint) {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.step.Load = max(d.step.Load, sample.Load)
	d.step.Celsius = max(d.step.Celsius, sample.Celsius)
	d.step.Memory += sample.Memory
	d.step.Singbox += sample.Singbox
	d.step.Daemon += sample.Daemon
	d.counted++

	if d.counted < int64(d.perPoint) {
		return
	}

	point := DevicePoint{
		Load:    d.step.Load,
		Celsius: d.step.Celsius,
		Memory:  d.step.Memory / d.counted,
		Singbox: d.step.Singbox / d.counted,
		Daemon:  d.step.Daemon / d.counted,
	}
	d.step, d.counted = DevicePoint{}, 0

	if d.ring.push(point, mergeDevicePoints) {
		d.stepSeconds *= 2
		d.perPoint *= 2
	}
}

func mergeDevicePoints(older, newer DevicePoint) DevicePoint {
	return DevicePoint{
		Load:    max(older.Load, newer.Load),
		Celsius: max(older.Celsius, newer.Celsius),
		Memory:  (older.Memory + newer.Memory) / 2,
		Singbox: (older.Singbox + newer.Singbox) / 2,
		Daemon:  (older.Daemon + newer.Daemon) / 2,
	}
}

// Points returns the readings from old to new.
func (d *Device) Points() []DevicePoint {
	d.mu.Lock()
	defer d.mu.Unlock()

	return d.ring.all()
}

// Step returns the current step between the readings points in seconds.
func (d *Device) Step() int {
	d.mu.Lock()
	defer d.mu.Unlock()

	return d.stepSeconds
}

// Connections is the number of live connections over the last minute, one snapshot
// per second. The panel connection chart takes it on open: without it the chart
// would start from an empty place and know only what happened with the tab open.
type Connections struct {
	mu     sync.Mutex
	recent []int
}

// Record puts the number of connections from the next snapshot.
func (c *Connections) Record(count int) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.recent = append(c.recent, count)
	if len(c.recent) > RecentPoints {
		c.recent = c.recent[len(c.recent)-RecentPoints:]
	}
}

// Recent returns the numbers from the old snapshot to the new one.
func (c *Connections) Recent() []int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]int{}, c.recent...)
}
