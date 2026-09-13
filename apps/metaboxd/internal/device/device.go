// Package device читает показания устройства и процессов на нём.
//
// Источник — procfs и sysfs: своего агента на роутере нет, а панели нужны
// загрузка, температура и память там же, где трафик. Корни файловых систем
// задаются полями Options, иначе тест шёл бы по живой системе.
//
// Отказ одного источника не отменяет остальные: термозоны есть не на каждой
// плате, а процесс sing-box может быть не запущен. Read отдаёт то, что
// прочиталось, и ошибку с перечнем того, что не далось.
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
)

const (
	defaultProc = "/proc"
	defaultSys  = "/sys"

	// Ядро отдаёт память в килобайтах.
	bytesInKB = 1024
)

// Load — средняя загрузка. Приводить её к процентам нельзя: это длина очереди
// на выполнение, и на четырёх ядрах значение 4.0 означает полную занятость.
type Load struct {
	One     float64 `json:"one"`
	Five    float64 `json:"five"`
	Fifteen float64 `json:"fifteen"`
	// Cores — сколько ядер видит система: без него значение не читается.
	Cores int `json:"cores"`
}

// Memory — память устройства в байтах.
type Memory struct {
	Total int64 `json:"total"`
	// Available — то, что система готова отдать без свопа, а не `MemFree`:
	// свободного на роутере мало всегда, кэш занимает остальное.
	Available int64 `json:"available"`
}

// Zone — одна термозона ядра.
type Zone struct {
	// Name — `type` зоны: на плате их бывает несколько, и различаются они им.
	Name string `json:"name"`
	// Milli — тысячные доли градуса Цельсия, ровно как отдаёт ядро.
	Milli int `json:"milli"`
}

// Process — показания чужого процесса.
type Process struct {
	PID int `json:"pid"`
	// RSS — резидентная память процесса в байтах. У sing-box она больше, чем
	// `memory` из Clash API: тот отдаёт только память рантайма Go, а здесь
	// весь процесс вместе с резидентным кодом бинаря.
	RSS int64 `json:"rss"`
}

// Daemon — показания самого metaboxd.
type Daemon struct {
	RSS        int64 `json:"rss"`
	Heap       int64 `json:"heap"`
	Goroutines int   `json:"goroutines"`
}

// Stat — показания устройства на момент опроса.
type Stat struct {
	Load   Load   `json:"load"`
	Memory Memory `json:"memory"`
	// Thermal пуст, когда термозон у платы нет.
	Thermal []Zone `json:"thermal"`
	// Uplink пуст, когда маршрута по умолчанию нет.
	Uplink *Link `json:"uplink,omitempty"`
	// Share — объёмы канала и sing-box за время наблюдения демона.
	Share Share `json:"share"`
	// Singbox пуст, когда процесс не найден: маршрутизации на устройстве
	// может не быть вовсе.
	Singbox *Process `json:"singbox,omitempty"`
	Daemon  Daemon   `json:"daemon"`
	// Uptime — секунды с загрузки устройства.
	Uptime int `json:"uptime"`
}

// PortResolver отдаёт порт Clash API. Читается на каждый поиск процесса: порт
// меняется вместе с конфигом.
type PortResolver func(ctx context.Context) (int, error)

// Options задаёт корни файловых систем и способ найти порт Clash API.
type Options struct {
	Proc string
	Sys  string
	Port PortResolver
	// Now подменяется в тестах: окно наблюдения считается от первого снятия
	// показаний, и ждать его реальными секундами тест не должен.
	Now func() time.Time
}

// Reader читает показания и помнит найденный процесс sing-box.
type Reader struct {
	proc string
	sys  string
	port PortResolver
	now  func() time.Time

	// link и proxy копят приращения счётчиков: канал считает сам читатель,
	// объём sing-box приходит снаружи — его знает только поток соединений.
	link  Meter
	proxy Meter
	// since — начало окна наблюдения; нулевое время означает, что показаний
	// ещё не снимали.
	since time.Time
	// linkName — интерфейс, по которому копится канал: смена интерфейса
	// начинает счёт заново, иначе чужой счётчик приехал бы одним скачком.
	linkName string

	// mu закрывает найденный процесс: показания снимает поток, а состояние
	// службы спрашивает ещё и хендлер ручки.
	mu sync.Mutex
	// pid — последний найденный процесс. Поиск обходит дескрипторы всех
	// процессов, и повторять его каждые несколько секунд на устройстве,
	// которое месяцами простаивает, незачем (NFR-4).
	pid int
}

// New собирает читателя. Пустые корни берут устройственные значения.
func New(opts Options) *Reader {
	reader := &Reader{proc: opts.Proc, sys: opts.Sys, port: opts.Port, now: opts.Now}

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

// AddProxy прибавляет байты, прошедшие через sing-box за интервал. Зовёт его
// учёт: сам процесс отдаёт скорость за секунду, а не накопленный счётчик.
func (r *Reader) AddProxy(bytes int64) {
	r.proxy.Add(bytes)
}

// SampleUplink снимает счётчики интерфейса наружу.
//
// Зовётся и учётом, и снятием показаний: счётчик монотонный, и лишнее чтение
// прибавляет нулевое приращение. Окно наблюдения начинается с первого вызова —
// у демона это его собственный запуск.
func (r *Reader) SampleUplink() {
	link, err := r.uplink()
	if err != nil {
		return
	}

	r.observeUplink(link)
}

// Read снимает показания. Ошибка перечисляет то, что прочитать не удалось;
// остальные поля при этом заполнены.
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

// observeUplink прибавляет приращение канала. Смена интерфейса начинает счёт
// заново: счётчик нового приехал бы в итог одним скачком.
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

// share отдаёт накопленное и окно наблюдения. Копит демон, а не панель: доля
// считается за всё время его работы и не обнуляется ни перезагрузкой страницы,
// ни закрытием вкладки.
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
		return Load{}, fmt.Errorf("разбор loadavg: полей %d", len(fields))
	}

	values := make([]float64, averages)

	for index := range values {
		value, err := strconv.ParseFloat(fields[index], 64)
		if err != nil {
			return Load{}, fmt.Errorf("разбор loadavg: %w", err)
		}

		values[index] = value
	}

	// Ядра берём у рантайма: демон работает на том же устройстве, и разбирать
	// ради этого `cpuinfo` с его платформенными различиями незачем.
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
		return 0, errors.New("разбор uptime: пусто")
	}

	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, fmt.Errorf("разбор uptime: %w", err)
	}

	return int(seconds), nil
}

func (r *Reader) thermal() ([]Zone, error) {
	root := filepath.Join(r.sys, "class", "thermal")

	entries, err := os.ReadDir(root)
	if err != nil {
		// Платы без термозон — штатный случай, а не отказ.
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, fmt.Errorf("чтение %s: %w", root, err)
	}

	var (
		zones    []Zone
		failures []error
	)

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
		return Zone{}, fmt.Errorf("разбор температуры %s: %w", dir, err)
	}

	return Zone{Name: name, Milli: milli}, nil
}

// daemonStat читает показания самого демона. RSS берётся из procfs, а не из
// MemStats: там память, которую рантайм Go вернул системе, всё ещё числится
// занятой, и сравнивать её с памятью sing-box было бы нечем.
func daemonStat(proc string) Daemon {
	var stats runtime.MemStats

	runtime.ReadMemStats(&stats)

	daemon := Daemon{
		// HeapInuse, а не HeapAlloc: занятые спаны показывают, сколько рантайм
		// держит под кучу, а не сколько в ней живых объектов.
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
		return "", fmt.Errorf("чтение %s: %w", path, err)
	}

	return strings.TrimSpace(string(data)), nil
}

// readKeyedKB разбирает строки вида «MemTotal: 8137308 kB» и переводит их в
// байты. Ключи, которых в файле нет, остаются нулями: состав `meminfo` и
// `status` отличается от ядра к ядру.
func readKeyedKB(path string, keys ...string) (map[string]int64, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("чтение %s: %w", path, err)
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
			return nil, fmt.Errorf("разбор %s в %s: %w", key, path, err)
		}

		values[key] = kb * bytesInKB
	}

	return values, nil
}
