package device

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Счётчики интерфейса в `/proc/net/dev` идут после двоеточия: первым принятые
// байты, девятым — отправленные.
const (
	receivedField    = 0
	transmittedField = 8
)

// Строка `/proc/net/route`: «Iface Destination Gateway Flags RefCnt Use Metric Mask».
const (
	routeIfaceField  = 0
	routeTargetField = 1
	routeMetricField = 6
	routeMaskField   = 7

	// Маршрут по умолчанию — нулевые адрес назначения и маска.
	routeDefault = "00000000"
)

// Link — счётчики интерфейса с момента его подъёма, в байтах.
type Link struct {
	Name string `json:"name"`
	RX   int64  `json:"rx"`
	TX   int64  `json:"tx"`
}

// uplink отдаёт счётчики интерфейса, которым устройство ходит наружу.
//
// Нужен он для сравнения: сколько канала прошло через sing-box, видно только
// рядом с тем, сколько прошло всего. Сравнивать можно лишь приращения за одно
// окно — счётчик интерфейса считается с подъёма линка, а счётчик Clash API с
// запуска процесса.
func (r *Reader) uplink() (*Link, error) {
	name, err := r.defaultRoute()
	if err != nil {
		return nil, err
	}

	return r.counters(name)
}

// defaultRoute выбирает интерфейс маршрута по умолчанию с наименьшей метрикой.
// Туннели пропускаются: в режиме TUN маршрут по умолчанию принадлежит самому
// sing-box, и его трафик оказался бы и делимым, и делителем.
func (r *Reader) defaultRoute() (string, error) {
	path := filepath.Join(r.proc, "net", "route")

	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("чтение %s: %w", path, err)
	}

	best := ""
	bestMetric := 0
	fallback := ""

	for line := range strings.Lines(string(data)) {
		fields := strings.Fields(line)
		if len(fields) <= routeMaskField {
			continue
		}

		if fields[routeTargetField] != routeDefault || fields[routeMaskField] != routeDefault {
			continue
		}

		name := fields[routeIfaceField]
		if fallback == "" {
			fallback = name
		}

		if r.isTunnel(name) {
			continue
		}

		metric, err := strconv.Atoi(fields[routeMetricField])
		if err != nil {
			continue
		}

		if best == "" || metric < bestMetric {
			best, bestMetric = name, metric
		}
	}

	if best != "" {
		return best, nil
	}

	// Все маршруты по умолчанию туннельные: лучше показать этот интерфейс,
	// чем ничего, — доля тогда просто выйдет около сотни процентов.
	if fallback != "" {
		return fallback, nil
	}

	return "", errors.New("маршрута по умолчанию нет")
}

// isTunnel отличает TUN/TAP по файлу, который ядро заводит только им.
func (r *Reader) isTunnel(name string) bool {
	_, err := os.Stat(filepath.Join(r.sys, "class", "net", name, "tun_flags"))

	return err == nil
}

func (r *Reader) counters(name string) (*Link, error) {
	path := filepath.Join(r.proc, "net", "dev")

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("чтение %s: %w", path, err)
	}

	for line := range strings.Lines(string(data)) {
		iface, rest, found := strings.Cut(line, ":")
		if !found || strings.TrimSpace(iface) != name {
			continue
		}

		fields := strings.Fields(rest)
		if len(fields) <= transmittedField {
			return nil, fmt.Errorf("разбор %s: у %s полей %d", path, name, len(fields))
		}

		rx, err := strconv.ParseInt(fields[receivedField], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("разбор счётчика %s: %w", name, err)
		}

		tx, err := strconv.ParseInt(fields[transmittedField], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("разбор счётчика %s: %w", name, err)
		}

		return &Link{Name: name, RX: rx, TX: tx}, nil
	}

	return nil, fmt.Errorf("интерфейса %s нет в %s", name, path)
}
