package device_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"metabox/internal/device"
	"metabox/internal/history"
)

const (
	clashPort = 9090
	// The port in the kernel table is hexadecimal: 9090 is 0x2382.
	clashPortHex = "2382"
	socketInode  = "48120"
)

// tree builds a fake procfs and sysfs. All tests go through them, not through the live
// system: otherwise a run would depend on the machine it runs on.
type tree struct {
	proc string
	sys  string
}

func newTree(t *testing.T) tree {
	t.Helper()

	root := t.TempDir()
	fs := tree{proc: filepath.Join(root, "proc"), sys: filepath.Join(root, "sys")}

	fs.write(t, filepath.Join(fs.proc, "loadavg"), "0.49 0.33 0.18 1/181 8942\n")
	fs.write(t, filepath.Join(fs.proc, "meminfo"), "MemTotal:        8137308 kB\nMemAvailable:    7776156 kB\nSwapTotal:             0 kB\n")
	fs.write(t, filepath.Join(fs.proc, "uptime"), "68239.25 268072.10\n")
	fs.write(t, filepath.Join(fs.proc, "self", "status"), "Name:\tmetaboxd\nVmRSS:\t   12000 kB\n")
	fs.write(t, filepath.Join(fs.proc, "net", "route"),
		"Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\n"+
			"pppoe-wan\t00000000\t8D1AAC6D\t0003\t0\t0\t0\t00000000\n"+
			"br-lan\t0001A8C0\t00000000\t0001\t0\t0\t0\t00FFFFFF\n")
	fs.write(t, filepath.Join(fs.proc, "net", "dev"),
		"Inter-|   Receive                          |  Transmit\n"+
			" face |bytes    packets errs drop fifo frame compressed multicast|bytes packets\n"+
			"    lo: 100 1 0 0 0 0 0 0 100 1 0 0 0 0 0 0\n"+
			"pppoe-wan: 9394995569 7036038 0 0 0 0 0 0 1413850120 6544688 0 0 0 0 0 0\n")
	fs.write(t, filepath.Join(fs.sys, "class", "thermal", "thermal_zone0", "type"), "cpu-thermal\n")
	fs.write(t, filepath.Join(fs.sys, "class", "thermal", "thermal_zone0", "temp"), "42578\n")

	return fs
}

func (fs tree) write(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// process puts a process with an open socket into the tree.
func (fs tree) process(t *testing.T, pid int, comm, inode string, rssKB int) {
	t.Helper()

	dir := filepath.Join(fs.proc, fmt.Sprint(pid))

	fs.write(t, filepath.Join(dir, "comm"), comm+"\n")
	fs.write(t, filepath.Join(dir, "status"), fmt.Sprintf("Name:\t%s\nVmRSS:\t%d kB\n", comm, rssKB))

	if inode == "" {
		return
	}

	if err := os.MkdirAll(filepath.Join(dir, "fd"), 0o755); err != nil {
		t.Fatal(err)
	}

	// The link target does not exist: the kernel gives exactly the same.
	if err := os.Symlink("socket:["+inode+"]", filepath.Join(dir, "fd", "7")); err != nil {
		t.Fatal(err)
	}
}

// listener adds a listening socket to the kernel table.
func (fs tree) listener(t *testing.T, portHex, inode string) {
	t.Helper()

	fs.write(t, filepath.Join(fs.proc, "net", "tcp"),
		"  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n"+
			"   0: 00000000:"+portHex+" 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 "+inode+" 1 0000 100 0\n")
}

func (fs tree) reader(port int) *device.Reader {
	return device.New(device.Options{
		Proc: fs.proc,
		Sys:  fs.sys,
		Port: func(context.Context) (int, error) { return port, nil },
	})
}

func TestReadDevice(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 5872, "sing-box", socketInode, 83900)

	stat, err := fs.reader(clashPort).Read(t.Context())
	if err != nil {
		t.Fatalf("readings not read: %v", err)
	}

	if stat.Load.One != 0.49 || stat.Load.Cores == 0 {
		t.Errorf("load: got %+v", stat.Load)
	}

	if stat.Memory.Total != 8137308*1024 || stat.Memory.Available != 7776156*1024 {
		t.Errorf("memory: got %+v", stat.Memory)
	}

	if stat.Uptime != 68239 {
		t.Errorf("uptime: got %d, expected 68239", stat.Uptime)
	}

	if len(stat.Thermal) != 1 || stat.Thermal[0].Name != "cpu-thermal" || stat.Thermal[0].Milli != 42_578 {
		t.Errorf("thermal zones: got %+v", stat.Thermal)
	}

	if stat.Uplink == nil || stat.Uplink.Name != "pppoe-wan" || stat.Uplink.RX != 9394995569 {
		t.Errorf("outward interface: got %+v", stat.Uplink)
	}

	if stat.Singbox == nil || stat.Singbox.PID != 5872 || stat.Singbox.RSS != 83900*1024 {
		t.Errorf("sing-box process: got %+v", stat.Singbox)
	}

	if stat.Daemon.RSS != 12000*1024 || stat.Daemon.Goroutines == 0 {
		t.Errorf("daemon readings: got %+v", stat.Daemon)
	}
}

// The absence of thermal zones and of the process is a regular device state, not a read
// failure: the other readings must reach the panel.
func TestReadWithoutOptionalSources(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)

	if err := os.RemoveAll(filepath.Join(fs.sys, "class", "thermal")); err != nil {
		t.Fatal(err)
	}

	stat, err := fs.reader(clashPort).Read(t.Context())
	if err == nil {
		t.Error("the absence of the process did not get into the error")
	}

	if stat.Memory.Total == 0 || stat.Uplink == nil {
		t.Errorf("other readings lost: %+v", stat)
	}

	if stat.Singbox != nil || len(stat.Thermal) != 0 {
		t.Errorf("missing sources invented: %+v", stat)
	}

	// nil goes into JSON as `null`, and the panel loses the whole readings topic on it.
	if stat.Thermal == nil {
		t.Error("empty thermal zones returned as nil, the panel would lose the whole topic")
	}
}

// In TUN mode the default route belongs to sing-box itself: counting it as the device
// channel is wrong, it would be both the dividend and the divisor.
func TestUplinkSkipsTunnel(t *testing.T) {
	fs := newTree(t)
	fs.write(t, filepath.Join(fs.proc, "net", "route"),
		"Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\n"+
			"singtun0\t00000000\t00000000\t0003\t0\t0\t0\t00000000\n"+
			"pppoe-wan\t00000000\t8D1AAC6D\t0003\t0\t0\t20\t00000000\n")
	fs.write(t, filepath.Join(fs.sys, "class", "net", "singtun0", "tun_flags"), "0x1002\n")

	stat, _ := fs.reader(clashPort).Read(t.Context())

	if stat.Uplink == nil || stat.Uplink.Name != "pppoe-wan" {
		t.Errorf("outward interface: got %+v", stat.Uplink)
	}
}

// The process is looked up by the port listener, not by the service name: routing on the
// device may be owned by a service other than metabox-singbox.
func TestSingboxFoundByListener(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 111, "sing-box", "99999", 10000)
	fs.process(t, 222, "sing-box", socketInode, 83900)

	reader := fs.reader(clashPort)

	stat, _ := reader.Read(t.Context())
	if stat.Singbox == nil || stat.Singbox.PID != 222 {
		t.Fatalf("sing-box process: got %+v, expected 222", stat.Singbox)
	}

	if !reader.Alive(t.Context()) {
		t.Error("live process not recognized")
	}
}

// The system hands out a freed pid again: the remembered process is checked
// before its readings are returned.
func TestSingboxPIDReused(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 222, "sing-box", socketInode, 83900)

	reader := fs.reader(clashPort)

	if stat, _ := reader.Read(t.Context()); stat.Singbox == nil {
		t.Fatal("process not found on the first try")
	}

	fs.write(t, filepath.Join(fs.proc, "222", "comm"), "dnsmasq\n")

	if reader.Alive(t.Context()) {
		t.Error("a foreign process under the same pid taken for sing-box")
	}
}

// clock gives time in steps: the observation window must not wait for real seconds.
type clock struct {
	now time.Time
}

func (c *clock) tick(step time.Duration) { c.now = c.now.Add(step) }

func (fs tree) readerAt(port int, now func() time.Time) *device.Reader {
	return device.New(device.Options{
		Proc: fs.proc,
		Sys:  fs.sys,
		Port: func(context.Context) (int, error) { return port, nil },
		Now:  now,
	})
}

// The channel and sing-box counters start from different events, so the daemon accumulates
// their increments itself, and the panel divides one by the other over the common window.
func TestShareAccumulates(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 5872, "sing-box", socketInode, 83900)

	tick := &clock{now: time.Unix(1_000_000, 0)}
	reader := fs.readerAt(clashPort, func() time.Time { return tick.now })

	stat, _ := reader.Read(t.Context())
	if stat.Share.Link != 0 || stat.Share.Proxy != 0 {
		t.Fatalf("nothing to accumulate on the first snapshot: %+v", stat.Share)
	}

	fs.write(t, filepath.Join(fs.proc, "net", "dev"),
		"Inter-|   Receive                          |  Transmit\n"+
			" face |bytes    packets errs drop fifo frame compressed multicast|bytes packets\n"+
			"pppoe-wan: 9394999569 7036038 0 0 0 0 0 0 1413852120 6544688 0 0 0 0 0 0\n")
	reader.AddProxy(2500)
	tick.tick(4 * time.Second)

	stat, _ = reader.Read(t.Context())

	// Channel: +4000 received and +2000 sent; sing-box gave 2500 per interval.
	if stat.Share.Link != 6000 || stat.Share.Proxy != 2500 {
		t.Errorf("increments: got %+v", stat.Share)
	}

	if stat.Share.Seconds != 4 {
		t.Errorf("observation window: got %d s, expected 4", stat.Share.Seconds)
	}
}

// Accounting goes independently of taking readings: the panel may never be
// opened, and the volumes will accumulate in that time anyway.
func TestShareCountsWithoutReads(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)

	reader := fs.reader(clashPort)

	reader.SampleDevice(t.Context())
	reader.AddProxy(1200)
	reader.AddProxy(800)

	fs.write(t, filepath.Join(fs.proc, "net", "dev"),
		"Inter-|   Receive                          |  Transmit\n"+
			" face |bytes    packets errs drop fifo frame compressed multicast|bytes packets\n"+
			"pppoe-wan: 9394996569 7036038 0 0 0 0 0 0 1413850620 6544688 0 0 0 0 0 0\n")
	reader.SampleDevice(t.Context())

	stat, _ := reader.Read(t.Context())

	if stat.Share.Proxy != 2000 || stat.Share.Link != 1500 {
		t.Errorf("accumulated without a single snapshot: got %+v", stat.Share)
	}
}

// A leak is looked for in the sing-box process memory over days of work, not in the board memory:
// the history must accumulate it together with the other readings.
func TestSampleDeviceRecordsProcessMemory(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 5872, "sing-box", socketInode, 83900)

	recorded := history.NewDevice(1, 10, 4)
	reader := device.New(device.Options{
		Proc:    fs.proc,
		Sys:     fs.sys,
		Port:    func(context.Context) (int, error) { return clashPort, nil },
		History: recorded,
	})

	reader.SampleDevice(t.Context())

	points := recorded.Points()
	if len(points) != 1 || points[0].Singbox != 83900*1024 || points[0].Daemon != 12000*1024 {
		t.Errorf("process history: got %+v", points)
	}
}
