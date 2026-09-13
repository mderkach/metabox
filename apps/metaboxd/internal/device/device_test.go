package device_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"metabox/internal/device"
)

const (
	clashPort = 9090
	// Порт в таблице ядра шестнадцатеричный: 9090 — это 0x2382.
	clashPortHex = "2382"
	socketInode  = "48120"
)

// tree собирает фейковые procfs и sysfs. Все тесты идут по ним, а не по живой
// системе: иначе прогон зависел бы от машины, на которой он идёт.
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

// process кладёт в дерево процесс с открытым сокетом.
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

	// Цель ссылки не существует — ядро отдаёт ровно такую же.
	if err := os.Symlink("socket:["+inode+"]", filepath.Join(dir, "fd", "7")); err != nil {
		t.Fatal(err)
	}
}

// listener добавляет слушающий сокет в таблицу ядра.
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
		t.Fatalf("показания не прочитаны: %v", err)
	}

	if stat.Load.One != 0.49 || stat.Load.Cores == 0 {
		t.Errorf("загрузка: получили %+v", stat.Load)
	}

	if stat.Memory.Total != 8137308*1024 || stat.Memory.Available != 7776156*1024 {
		t.Errorf("память: получили %+v", stat.Memory)
	}

	if stat.Uptime != 68239 {
		t.Errorf("аптайм: получили %d, ожидали 68239", stat.Uptime)
	}

	if len(stat.Thermal) != 1 || stat.Thermal[0].Name != "cpu-thermal" || stat.Thermal[0].Milli != 42_578 {
		t.Errorf("термозоны: получили %+v", stat.Thermal)
	}

	if stat.Uplink == nil || stat.Uplink.Name != "pppoe-wan" || stat.Uplink.RX != 9394995569 {
		t.Errorf("интерфейс наружу: получили %+v", stat.Uplink)
	}

	if stat.Singbox == nil || stat.Singbox.PID != 5872 || stat.Singbox.RSS != 83900*1024 {
		t.Errorf("процесс sing-box: получили %+v", stat.Singbox)
	}

	if stat.Daemon.RSS != 12000*1024 || stat.Daemon.Goroutines == 0 {
		t.Errorf("показания демона: получили %+v", stat.Daemon)
	}
}

// Отсутствие термозон и процесса — штатное состояние устройства, а не отказ
// чтения: остальные показания обязаны дойти до панели.
func TestReadWithoutOptionalSources(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)

	if err := os.RemoveAll(filepath.Join(fs.sys, "class", "thermal")); err != nil {
		t.Fatal(err)
	}

	stat, err := fs.reader(clashPort).Read(t.Context())
	if err == nil {
		t.Error("отсутствие процесса не попало в ошибку")
	}

	if stat.Memory.Total == 0 || stat.Uplink == nil {
		t.Errorf("остальные показания потеряны: %+v", stat)
	}

	if stat.Singbox != nil || stat.Thermal != nil {
		t.Errorf("недостающие источники выдуманы: %+v", stat)
	}
}

// В режиме TUN маршрут по умолчанию принадлежит самому sing-box: считать его
// каналом устройства нельзя — он оказался бы и делимым, и делителем.
func TestUplinkSkipsTunnel(t *testing.T) {
	fs := newTree(t)
	fs.write(t, filepath.Join(fs.proc, "net", "route"),
		"Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\n"+
			"singtun0\t00000000\t00000000\t0003\t0\t0\t0\t00000000\n"+
			"pppoe-wan\t00000000\t8D1AAC6D\t0003\t0\t0\t20\t00000000\n")
	fs.write(t, filepath.Join(fs.sys, "class", "net", "singtun0", "tun_flags"), "0x1002\n")

	stat, _ := fs.reader(clashPort).Read(t.Context())

	if stat.Uplink == nil || stat.Uplink.Name != "pppoe-wan" {
		t.Errorf("интерфейс наружу: получили %+v", stat.Uplink)
	}
}

// Процесс ищется по слушателю порта, а не по имени службы: маршрутизацией на
// устройстве может владеть чужой пакет.
func TestSingboxFoundByListener(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 111, "sing-box", "99999", 10000)
	fs.process(t, 222, "sing-box", socketInode, 83900)

	reader := fs.reader(clashPort)

	stat, _ := reader.Read(t.Context())
	if stat.Singbox == nil || stat.Singbox.PID != 222 {
		t.Fatalf("процесс sing-box: получили %+v, ожидали 222", stat.Singbox)
	}

	if !reader.Alive(t.Context()) {
		t.Error("живой процесс не распознан")
	}
}

// Освободившийся pid система выдаёт заново: запомненный процесс проверяется
// перед тем, как отдать его показания.
func TestSingboxPIDReused(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 222, "sing-box", socketInode, 83900)

	reader := fs.reader(clashPort)

	if stat, _ := reader.Read(t.Context()); stat.Singbox == nil {
		t.Fatal("процесс не найден с первого раза")
	}

	fs.write(t, filepath.Join(fs.proc, "222", "comm"), "dnsmasq\n")

	if reader.Alive(t.Context()) {
		t.Error("чужой процесс под тем же pid принят за sing-box")
	}
}

// clock отдаёт время шагами: окно наблюдения не должно ждать реальных секунд.
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

// Счётчики канала и sing-box стартуют от разных событий, поэтому демон копит
// их приращения сам — панель делит одно на другое уже за общее окно.
func TestShareAccumulates(t *testing.T) {
	fs := newTree(t)
	fs.listener(t, clashPortHex, socketInode)
	fs.process(t, 5872, "sing-box", socketInode, 83900)

	tick := &clock{now: time.Unix(1_000_000, 0)}
	reader := fs.readerAt(clashPort, func() time.Time { return tick.now })

	stat, _ := reader.Read(t.Context())
	if stat.Share.Link != 0 || stat.Share.Proxy != 0 {
		t.Fatalf("первый снимок копить нечего: %+v", stat.Share)
	}

	fs.write(t, filepath.Join(fs.proc, "net", "dev"),
		"Inter-|   Receive                          |  Transmit\n"+
			" face |bytes    packets errs drop fifo frame compressed multicast|bytes packets\n"+
			"pppoe-wan: 9394999569 7036038 0 0 0 0 0 0 1413852120 6544688 0 0 0 0 0 0\n")
	reader.AddProxy(2500)
	tick.tick(4 * time.Second)

	stat, _ = reader.Read(t.Context())

	// Канал: +4000 принято и +2000 отдано; sing-box отдал 2500 за интервал.
	if stat.Share.Link != 6000 || stat.Share.Proxy != 2500 {
		t.Errorf("приращения: получили %+v", stat.Share)
	}

	if stat.Share.Seconds != 4 {
		t.Errorf("окно наблюдения: получили %d с, ожидали 4", stat.Share.Seconds)
	}
}

// Учёт идёт независимо от снятия показаний: панель может не быть открыта ни
// разу, а объёмы за это время всё равно накопятся.
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
		t.Errorf("накопленное без единого снимка: получили %+v", stat.Share)
	}
}
