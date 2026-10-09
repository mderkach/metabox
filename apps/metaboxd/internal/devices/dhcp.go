package devices

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/netip"
	"os"
	"strconv"
	"strings"
)

// maxLeasesBytes — потолок чтения файла аренд. Строка аренды — около ста
// байт, мегабайт перекрывает пул любой домашней сети.
const maxLeasesBytes = 1 << 20

type lease struct {
	expires int64
	mac     string
	ip      string
	name    string
}

type host struct {
	name string
	ip   string
	macs []string
}

// readLeases разбирает файл аренд dnsmasq: `<срок> <mac> <ip> <имя|*>
// <client-id|*>`. Отсутствие файла — штатный случай: DHCP на роутере
// выключен. Строки другого вида (DUID аренд IPv6) пропускаются.
func readLeases(path string) ([]lease, error) {
	f, err := os.Open(path) //nolint:gosec // G304: путь приходит флагом, а не из запроса
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("аренды DHCP: %w", err)
	}
	defer func() { _ = f.Close() }()

	byMAC := map[string]lease{}
	order := []string{}

	scanner := bufio.NewScanner(io.LimitReader(f, maxLeasesBytes))
	for scanner.Scan() {
		l, ok := parseLease(scanner.Text())
		if !ok {
			continue
		}

		// Двух аренд на один MAC dnsmasq не держит, но файл пишется не
		// атомарно; из двух берётся более поздняя.
		prev, seen := byMAC[l.mac]
		if !seen {
			order = append(order, l.mac)
		}
		if !seen || later(l.expires, prev.expires) {
			byMAC[l.mac] = l
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("аренды DHCP: %w", err)
	}

	out := make([]lease, 0, len(order))
	for _, mac := range order {
		out = append(out, byMAC[mac])
	}

	return out, nil
}

// later сравнивает сроки аренд; ноль у dnsmasq — бессрочная аренда.
func later(a, b int64) bool {
	return b != 0 && (a == 0 || a > b)
}

func parseLease(line string) (lease, bool) {
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return lease{}, false
	}

	expires, err := strconv.ParseInt(fields[0], 10, 64)
	if err != nil || expires < 0 {
		return lease{}, false
	}

	mac, err := normalizeMAC(fields[1])
	if err != nil {
		return lease{}, false
	}

	ip, err := netip.ParseAddr(fields[2])
	if err != nil {
		return lease{}, false
	}

	name := fields[3]
	if name == "*" {
		name = ""
	}

	return lease{expires: expires, mac: mac, ip: ip.String(), name: name}, true
}

// staticHosts читает секции `host` из UCI `dhcp`. Ненулевой код uci — пакета
// `dhcp` нет, и статических записей тоже нет; отказ запуска — ошибка.
func (r *Registry) staticHosts(ctx context.Context) ([]host, error) {
	out, code, err := r.run(ctx, r.uci, "-q", "show", "dhcp")
	if err != nil {
		return nil, fmt.Errorf("uci show dhcp: %w", err)
	}

	if code != 0 {
		return nil, nil
	}

	return parseHosts(out), nil
}

// parseHosts разбирает вывод `uci show dhcp`. Секции идут в порядке файла,
// анонимные — как `@host[N]`, именованные — по имени; список MAC uci печатает
// несколькими значениями в кавычках, а опцию — одним значением через пробел,
// и оба вида сводятся к одному списку.
func parseHosts(out string) []host {
	var order []string

	kinds := map[string]string{}
	options := map[string]map[string][]string{}

	for line := range strings.Lines(out) {
		key, value, ok := strings.Cut(strings.TrimRight(line, "\r\n"), "=")
		if !ok {
			continue
		}

		path, ok := strings.CutPrefix(key, "dhcp.")
		if !ok {
			continue
		}

		section, option, isOption := strings.Cut(path, ".")
		if !isOption {
			kinds[section] = value
			order = append(order, section)
			options[section] = map[string][]string{}

			continue
		}

		if opts, ok := options[section]; ok {
			opts[option] = unquote(value)
		}
	}

	var hosts []host

	for _, section := range order {
		if kinds[section] != "host" {
			continue
		}

		opts := options[section]
		h := host{name: first(opts["name"])}

		if ip, err := netip.ParseAddr(first(opts["ip"])); err == nil {
			h.ip = ip.String()
		}

		for _, value := range opts["mac"] {
			for raw := range strings.FieldsSeq(value) {
				if mac, err := normalizeMAC(raw); err == nil {
					h.macs = append(h.macs, mac)
				}
			}
		}

		if len(h.macs) > 0 {
			hosts = append(hosts, h)
		}
	}

	return hosts
}

func first(values []string) string {
	if len(values) == 0 {
		return ""
	}

	return values[0]
}

// unquote разбирает значение в записи uci: слова в одинарных кавычках через
// пробел. Кавычку внутри значения uci печатает так же, как шелл: закрывает
// кавычки, ставит экранированную кавычку и открывает их снова.
func unquote(s string) []string {
	var (
		out     []string
		word    strings.Builder
		inQuote bool
		started bool
	)

	for i := 0; i < len(s); i++ {
		c := s[i]

		switch {
		case inQuote && c == '\'':
			inQuote = false
		case inQuote:
			word.WriteByte(c)
		case c == '\'':
			inQuote, started = true, true
		case c == '\\' && i+1 < len(s):
			i++
			word.WriteByte(s[i])
			started = true
		case c == ' ' || c == '\t':
			if started {
				out = append(out, word.String())
				word.Reset()
				started = false
			}
		default:
			word.WriteByte(c)
			started = true
		}
	}

	if started {
		out = append(out, word.String())
	}

	return out
}
