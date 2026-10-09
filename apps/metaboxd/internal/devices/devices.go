// Package devices собирает устройства LAN из аренд DHCP и статических записей
// dnsmasq и хранит имена, которые им дал владелец.
//
// Аренды и статические записи не кэшируются: их меняют dnsmasq и владелец по
// SSH, поэтому каждый запрос читает их заново. Свои имена живут в служебном
// каталоге демона и читаются один раз на старте.
package devices

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"net"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	// maxNameRunes — потолок на своё имя: подпись стоит в ячейке таблицы
	// соединений вместо IP.
	maxNameRunes = 64

	// maxNames — потолок на число своих имён. Файл переписывается целиком на
	// каждое изменение, и без потолка его размер задавал бы клиент.
	maxNames = 1024
)

var (
	// ErrInvalidMAC — адрес не похож на MAC Ethernet из шести байт.
	ErrInvalidMAC = errors.New("MAC-адрес не разобран")
	// ErrInvalidName — имя длиннее допустимого или с управляющими символами.
	ErrInvalidName = errors.New("имя устройства не принято")
	// ErrTooManyNames — своих имён больше, чем демон согласен хранить.
	ErrTooManyNames = errors.New("своих имён устройств слишком много")
)

// NameSource — откуда взята подпись устройства. Набор закрытый: по нему
// панель объясняет, почему устройство подписано так.
type NameSource string

const (
	// SourceCustom — имя задал владелец в панели.
	SourceCustom NameSource = "custom"
	// SourceStatic — имя статической аренды dnsmasq.
	SourceStatic NameSource = "static"
	// SourceDHCP — имя, которое устройство назвало само при получении аренды.
	SourceDHCP NameSource = "dhcp"
	// SourceNone — имени нет: панель подписывает устройство адресом.
	SourceNone NameSource = "none"
)

// Device — устройство LAN, сведённое по MAC.
type Device struct {
	// IP — адрес из аренды, а без неё — из статической записи. Пусто, когда
	// адреса нет ни там, ни там: у устройства есть только своё имя.
	IP string `json:"ip"`
	// MAC — в нижнем регистре через двоеточие; по нему хранится своё имя.
	MAC string `json:"mac"`
	// Name — подпись по приоритету: своё имя, статическая аренда, DHCP. Пусто
	// при NameSource `none`.
	Name string `json:"name"`
	// NameSource — откуда взята подпись; при `none` панель подписывает
	// устройство адресом.
	NameSource NameSource `json:"name_source"`
	// Static — у MAC есть статическая аренда в UCI `dhcp`.
	Static bool `json:"static"`
	// Online — аренда не истекла по часам роутера. До синхронизации NTP часы
	// стоят в прошлом, и истёкшая аренда может считаться живой.
	Online bool `json:"online"`
	// LeaseExpires — конец аренды в секундах unix. Ноль — аренды нет или она
	// бессрочная; второе отличается признаком Online.
	LeaseExpires int64 `json:"lease_expires"`
}

// Runner запускает внешнюю команду и отдаёт её вывод с кодом возврата.
// Объявлен функцией по той же причине, что procd.Runner: тип результата
// владельца запуска сюда не импортировать.
type Runner func(ctx context.Context, name string, args ...string) (stdout string, exitCode int, err error)

// Store хранит свои имена между перезапусками. Служебным каталогом владеет
// config.Store, поэтому запись идёт через него. Отсутствие файла — ошибка, для
// которой errors.Is(err, fs.ErrNotExist).
type Store interface {
	ReadDevices(ctx context.Context) ([]byte, error)
	WriteDevices(ctx context.Context, data []byte) error
}

// Options — пути, которые демон получает флагами.
type Options struct {
	// Leases — файл аренд dnsmasq.
	Leases string
	// UCI — абсолютный путь к uci: под procd PATH не тот, что в шелле.
	UCI string
	// Now подменяется в тестах; nil — time.Now.
	Now func() time.Time
}

// Registry — владелец своих имён устройств: запись файла и состояние в памяти
// меняются под одним мьютексом, поэтому параллельные правки не теряют друг
// друга.
type Registry struct {
	run    Runner
	store  Store
	leases string
	uci    string
	now    func() time.Time

	mu    sync.Mutex
	names map[string]string
}

// New читает свои имена из служебного каталога. Битый файл — ошибка, а не
// пустой список: следующая правка затёрла бы им все имена.
func New(ctx context.Context, run Runner, store Store, opts Options) (*Registry, error) {
	r := &Registry{
		run:    run,
		store:  store,
		leases: opts.Leases,
		uci:    opts.UCI,
		now:    opts.Now,
		names:  map[string]string{},
	}

	if r.now == nil {
		r.now = time.Now
	}

	data, err := store.ReadDevices(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		return r, nil
	}
	if err != nil {
		return nil, err
	}

	var saved map[string]string
	if err := json.Unmarshal(data, &saved); err != nil {
		return nil, fmt.Errorf("разбор имён устройств: %w", err)
	}

	for raw, name := range saved {
		if mac, err := normalizeMAC(raw); err == nil && name != "" {
			r.names[mac] = name
		}
	}

	return r, nil
}

// List сводит аренды, статические записи и свои имена по MAC. Устройство со
// своим именем попадает в список и без аренды — офлайн и без адреса: правило
// по нему в панели не должно пропадать, пока устройство не в сети.
func (r *Registry) List(ctx context.Context) ([]Device, error) {
	leases, err := readLeases(r.leases)
	if err != nil {
		return nil, err
	}

	hosts, err := r.staticHosts(ctx)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	names := maps.Clone(r.names)
	r.mu.Unlock()

	now := r.now().Unix()
	byMAC := map[string]*Device{}
	dhcpNames := map[string]string{}
	staticNames := map[string]string{}

	device := func(mac string) *Device {
		d, ok := byMAC[mac]
		if !ok {
			d = &Device{MAC: mac}
			byMAC[mac] = d
		}

		return d
	}

	for _, l := range leases {
		d := device(l.mac)
		d.IP = l.ip
		d.LeaseExpires = l.expires
		d.Online = l.expires == 0 || l.expires > now
		dhcpNames[l.mac] = l.name
	}

	for _, h := range hosts {
		for _, mac := range h.macs {
			d := device(mac)
			d.Static = true

			if d.IP == "" {
				d.IP = h.ip
			}

			if staticNames[mac] == "" {
				staticNames[mac] = h.name
			}
		}
	}

	for mac := range names {
		device(mac)
	}

	out := make([]Device, 0, len(byMAC))

	for mac, d := range byMAC {
		switch {
		case names[mac] != "":
			d.Name, d.NameSource = names[mac], SourceCustom
		case staticNames[mac] != "":
			d.Name, d.NameSource = staticNames[mac], SourceStatic
		case dhcpNames[mac] != "":
			d.Name, d.NameSource = dhcpNames[mac], SourceDHCP
		default:
			d.NameSource = SourceNone
		}

		out = append(out, *d)
	}

	slices.SortFunc(out, compareDevices)

	return out, nil
}

// compareDevices упорядочивает по адресу, устройства без адреса — в конце.
// Порядок стабилен между запросами: map в Go его не держит.
func compareDevices(a, b Device) int {
	ipA, errA := netip.ParseAddr(a.IP)
	ipB, errB := netip.ParseAddr(b.IP)

	switch {
	case errA == nil && errB == nil:
		if c := ipA.Compare(ipB); c != 0 {
			return c
		}
	case errA == nil:
		return -1
	case errB == nil:
		return 1
	}

	return cmp.Compare(a.MAC, b.MAC)
}

// Rename задаёт своё имя устройства; пустое имя убирает его, и подпись
// возвращается к статической аренде или DHCP. Имя пишется на диск до того, как
// попадёт в память: отказ записи не оставляет имени, которое пропадёт с
// рестартом.
func (r *Registry) Rename(ctx context.Context, rawMAC, name string) error {
	mac, err := normalizeMAC(rawMAC)
	if err != nil {
		return err
	}

	name = strings.TrimSpace(name)
	if err := validName(name); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	next := maps.Clone(r.names)
	if name == "" {
		delete(next, mac)
	} else {
		next[mac] = name
	}

	if len(next) > maxNames {
		return fmt.Errorf("%w: потолок %d", ErrTooManyNames, maxNames)
	}

	data, err := json.Marshal(next)
	if err != nil {
		return fmt.Errorf("имена устройств в JSON: %w", err)
	}

	if err := r.store.WriteDevices(ctx, data); err != nil {
		return err
	}

	r.names = next

	return nil
}

func validName(name string) error {
	if utf8.RuneCountInString(name) > maxNameRunes {
		return fmt.Errorf("%w: длиннее %d символов", ErrInvalidName, maxNameRunes)
	}

	if strings.ContainsFunc(name, unicode.IsControl) {
		return fmt.Errorf("%w: управляющие символы", ErrInvalidName)
	}

	return nil
}

// normalizeMAC принимает только MAC Ethernet: net.ParseMAC пропускает и
// 8-, и 20-байтные адреса, которых в арендах dnsmasq не бывает.
func normalizeMAC(raw string) (string, error) {
	hw, err := net.ParseMAC(raw)
	if err != nil || len(hw) != 6 {
		return "", fmt.Errorf("%w: %q", ErrInvalidMAC, raw)
	}

	return hw.String(), nil
}
