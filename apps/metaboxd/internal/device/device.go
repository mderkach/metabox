// Package device reads the readings of the device and of the processes on it.
//
// The source is procfs and sysfs: the router has no agent of its own, and the panel needs
// load, temperature and memory in the same place as traffic. The file system roots
// are set by Options fields, otherwise a test would go through the live system.
//
// A failure of one source does not cancel the others: not every board has thermal zones,
// and the sing-box process may not be running. Read returns what
// was read and an error listing what failed.
package device

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"metabox/internal/history"
)

const (
	defaultProc = "/proc"
	defaultSys  = "/sys"

	// The kernel gives memory in kilobytes and temperature in thousandths of a degree.
	bytesInKB    = 1024
	milliDegrees = 1000
)

// Load is the average load. It cannot be converted to percent: it is the run queue
// length, and on four cores a value of 4.0 means full occupancy.
type Load struct {
	One     float64 `json:"one"`
	Five    float64 `json:"five"`
	Fifteen float64 `json:"fifteen"`
	// Cores is how many cores the system sees: without it the value cannot be read.
	Cores int `json:"cores"`
}

// Memory is the device memory in bytes.
type Memory struct {
	Total int64 `json:"total"`
	// Available is what the system is ready to give without swap, not `MemFree`:
	// free memory on a router is always small, the cache takes the rest.
	Available int64 `json:"available"`
}

// Zone is one kernel thermal zone.
type Zone struct {
	// Name is the `type` of the zone: a board may have several, and they differ by it.
	Name string `json:"name"`
	// Milli is thousandths of a degree Celsius, exactly as the kernel gives it.
	Milli int `json:"milli"`
}

// Process is the readings of a foreign process.
type Process struct {
	PID int `json:"pid"`
	// RSS is the resident memory of the process in bytes. For sing-box it is larger than
	// `memory` from the Clash API: that one gives only the Go runtime memory, while here it is
	// the whole process together with the resident code of the binary.
	RSS int64 `json:"rss"`
}

// Daemon is the readings of metaboxd itself.
type Daemon struct {
	RSS        int64 `json:"rss"`
	Heap       int64 `json:"heap"`
	Goroutines int   `json:"goroutines"`
}

// Stat is the device readings at the time of the poll.
type Stat struct {
	Load   Load   `json:"load"`
	Memory Memory `json:"memory"`
	// Thermal is empty when the board has no thermal zones.
	Thermal []Zone `json:"thermal"`
	// Uplink is empty when there is no default route.
	Uplink *Link `json:"uplink,omitempty"`
	// Share is the volumes of the channel and of sing-box during the daemon observation.
	Share Share `json:"share"`
	// Singbox is empty when the process is not found: there may be no routing on the device
	// at all.
	Singbox *Process `json:"singbox,omitempty"`
	Daemon  Daemon   `json:"daemon"`
	// Uptime is seconds since the device booted.
	Uptime int `json:"uptime"`
}

// PortResolver returns the Clash API port. Read on every process lookup: the port
// changes together with the config.
type PortResolver func(ctx context.Context) (int, error)

// Recorder accepts the taken readings. The interface is declared here, at the
// consumer: the reader does not care who stores the history and how.
type Recorder interface {
	Record(sample history.DevicePoint)
}

// Options sets the file system roots and the way to find the Clash API port.
type Options struct {
	Proc string
	Sys  string
	Port PortResolver
	// History accumulates the readings. nil means nobody keeps a history.
	History Recorder
	// Now is replaced in tests: the observation window is counted from the first taking
	// of readings, and a test must not wait for it in real seconds.
	Now func() time.Time
}

// Reader reads the readings and remembers the found sing-box process.
type Reader struct {
	proc    string
	sys     string
	port    PortResolver
	history Recorder
	now     func() time.Time

	// link and proxy accumulate counter increments: the reader counts the channel itself,
	// the sing-box volume comes from outside, since only the connection stream knows it.
	link  Meter
	proxy Meter
	// since is the start of the observation window; a zero time means readings
	// have not been taken yet.
	since time.Time
	// linkName is the interface the channel is accumulated by: an interface change
	// restarts the count, otherwise a foreign counter would arrive in one jump.
	linkName string

	// mu protects the found process: readings are taken by a stream, and the service state
	// is also requested by the handler.
	mu sync.Mutex
	// pid is the last found process. The lookup walks the descriptors of all
	// processes, and repeating it every few seconds on a device
	// that idles for months is pointless.
	pid int
}

// New assembles the reader. Empty roots take device values.
func New(opts Options) *Reader {
	reader := &Reader{proc: opts.Proc, sys: opts.Sys, port: opts.Port, history: opts.History, now: opts.Now}

	if reader.proc == "" {
		reader.proc = defaultProc
	}

	if reader.sys == "" {
		reader.sys = defaultSys
	}

	if reader.now == nil {
		reader.now = time.Now
	}

	return reader
}

// AddProxy adds the bytes that passed through sing-box over an interval. Called by
// the accounting: the process itself gives the speed per second, not an accumulated counter.
func (r *Reader) AddProxy(bytes int64) {
	r.proxy.Add(bytes)
}

// SampleDevice takes readings into the history and the channel counters.
//
// Called by the accounting, not by the panel: the chart and the share must accumulate with a closed
// tab too. The channel counter is monotonic, so an extra read adds a zero
// increment, and the observation window starts at the first call, which for the daemon is its
// own start.
func (r *Reader) SampleDevice(ctx context.Context) {
	stat, _ := r.Read(ctx)

	if r.history == nil {
		return
	}

	hottest := 0.0
	for _, zone := range stat.Thermal {
		hottest = max(hottest, float64(zone.Milli)/milliDegrees)
	}

	sample := history.DevicePoint{
		Load:    stat.Load.One,
		Celsius: hottest,
		Memory:  stat.Memory.Total - stat.Memory.Available,
		Daemon:  stat.Daemon.RSS,
	}
	if stat.Singbox != nil {
		sample.Singbox = stat.Singbox.RSS
	}

	r.history.Record(sample)
}

// Read takes the readings. The error lists what could not be read;
// the other fields are filled in.
func (r *Reader) Read(ctx context.Context) (Stat, error) {
	var failures []error

	stat := Stat{Daemon: daemonStat(r.proc)}

	load, err := r.load()
	if err != nil {
		failures = append(failures, err)
	} else {
		stat.Load = load
	}

	memory, err := r.memory()
	if err != nil {
		failures = append(failures, err)
	} else {
		stat.Memory = memory
	}

	uptime, err := r.uptime()
	if err != nil {
		failures = append(failures, err)
	} else {
		stat.Uptime = uptime
	}

	thermal, err := r.thermal()
	if err != nil {
		failures = append(failures, err)
	}

	stat.Thermal = thermal

	uplink, err := r.uplink()
	if err != nil {
		failures = append(failures, err)
	}

	stat.Uplink = uplink
	stat.Share = r.share(uplink)

	process, err := r.singbox(ctx)
	if err != nil {
		failures = append(failures, err)
	}

	stat.Singbox = process

	return stat, errors.Join(failures...)
}

// observeUplink adds the channel increment. An interface change restarts the count:
// the counter of the new one would arrive in the total as one jump.
func (r *Reader) observeUplink(link *Link) {
	if link == nil {
		return
	}

	r.mu.Lock()
	if r.since.IsZero() {
		r.since = r.now()
	}

	if link.Name != r.linkName {
		r.link.Rebase()
		r.linkName = link.Name
	}
	r.mu.Unlock()

	r.link.Observe(link.RX + link.TX)
}

// share returns the accumulated amount and the observation window. Accumulated by the daemon, not by the panel: the share
// is counted over its whole working time and is not zeroed by a page reload
// or a tab close.
func (r *Reader) share(uplink *Link) Share {
	r.observeUplink(uplink)

	r.mu.Lock()
	since := r.since
	r.mu.Unlock()

	seconds := 0
	if !since.IsZero() {
		seconds = int(r.now().Sub(since).Seconds())
	}

	return Share{Link: r.link.Total(), Proxy: r.proxy.Total(), Seconds: seconds}
}

func (r *Reader) load() (Load, error) {
	// `/proc/loadavg`: «0.49 0.33 0.18 1/181 8942».
	const averages = 3

	fields, err := readFields(filepath.Join(r.proc, "loadavg"))
	if err != nil {
		return Load{}, err
	}

	if len(fields) < averages {
		return Load{}, fmt.Errorf("parse loadavg: %d fields", len(fields))
	}

	values := make([]float64, averages)

	for index := range values {
		value, err := strconv.ParseFloat(fields[index], 64)
		if err != nil {
			return Load{}, fmt.Errorf("parse loadavg: %w", err)
		}

		values[index] = value
	}

	// Cores are taken from the runtime: the daemon runs on the same device, and parsing
	// `cpuinfo` with its platform differences for this is pointless.
	return Load{One: values[0], Five: values[1], Fifteen: values[2], Cores: runtime.NumCPU()}, nil
}

func (r *Reader) memory() (Memory, error) {
	values, err := readKeyedKB(filepath.Join(r.proc, "meminfo"), "MemTotal", "MemAvailable")
	if err != nil {
		return Memory{}, err
	}

	return Memory{Total: values["MemTotal"], Available: values["MemAvailable"]}, nil
}

func (r *Reader) uptime() (int, error) {
	fields, err := readFields(filepath.Join(r.proc, "uptime"))
	if err != nil {
		return 0, err
	}

	if len(fields) == 0 {
		return 0, errors.New("parse uptime: empty")
	}

	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, fmt.Errorf("parse uptime: %w", err)
	}

	return int(seconds), nil
}

// thermal reads the board thermal zones. The list is never nil: nil goes into JSON
// as `null`, the panel schema expects an array and on an unrecognized field loses the whole readings
// topic, together with memory and uptime.
func (r *Reader) thermal() ([]Zone, error) {
	root := filepath.Join(r.sys, "class", "thermal")

	zones := []Zone{}

	entries, err := os.ReadDir(root)
	if err != nil {
		// Boards without thermal zones are a regular case, not a failure.
		if errors.Is(err, os.ErrNotExist) {
			return zones, nil
		}

		return zones, fmt.Errorf("read %s: %w", root, err)
	}

	var failures []error

	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "thermal_zone") {
			continue
		}

		zone, err := readZone(filepath.Join(root, entry.Name()))
		if err != nil {
			failures = append(failures, err)

			continue
		}

		zones = append(zones, zone)
	}

	return zones, errors.Join(failures...)
}

func readZone(dir string) (Zone, error) {
	name, err := readTrimmed(filepath.Join(dir, "type"))
	if err != nil {
		return Zone{}, err
	}

	raw, err := readTrimmed(filepath.Join(dir, "temp"))
	if err != nil {
		return Zone{}, err
	}

	milli, err := strconv.Atoi(raw)
	if err != nil {
		return Zone{}, fmt.Errorf("parse temperature %s: %w", dir, err)
	}

	return Zone{Name: name, Milli: milli}, nil
}

// daemonStat reads the daemon's own readings. RSS is taken from procfs, not from
// MemStats: there the memory the Go runtime returned to the system is still counted
// as occupied, and it would have nothing to be compared with sing-box memory by.
func daemonStat(proc string) Daemon {
	var stats runtime.MemStats

	runtime.ReadMemStats(&stats)

	daemon := Daemon{
		// HeapInuse, not HeapAlloc: occupied spans show how much the runtime
		// holds for the heap, not how many live objects are in it.
		Heap:       int64(stats.HeapInuse),
		Goroutines: runtime.NumGoroutine(),
	}

	if rss, err := processRSS(proc, "self"); err == nil {
		daemon.RSS = rss
	}

	return daemon
}

func processRSS(proc, pid string) (int64, error) {
	values, err := readKeyedKB(filepath.Join(proc, pid, "status"), "VmRSS")
	if err != nil {
		return 0, err
	}

	return values["VmRSS"], nil
}

func readFields(path string) ([]string, error) {
	line, err := readTrimmed(path)
	if err != nil {
		return nil, err
	}

	return strings.Fields(line), nil
}

func readTrimmed(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}

	return strings.TrimSpace(string(data)), nil
}

// readKeyedKB parses rows like "MemTotal: 8137308 kB" and converts them to
// bytes. Keys absent from the file stay zeros: the composition of `meminfo` and
// `status` differs from kernel to kernel.
func readKeyedKB(path string, keys ...string) (map[string]int64, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	wanted := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		wanted[key] = struct{}{}
	}

	values := make(map[string]int64, len(keys))

	for line := range strings.Lines(string(data)) {
		key, rest, found := strings.Cut(line, ":")
		if !found {
			continue
		}

		if _, ok := wanted[key]; !ok {
			continue
		}

		fields := strings.Fields(rest)
		if len(fields) == 0 {
			continue
		}

		kb, err := strconv.ParseInt(fields[0], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("parse %s in %s: %w", key, path, err)
		}

		values[key] = kb * bytesInKB
	}

	return values, nil
}
