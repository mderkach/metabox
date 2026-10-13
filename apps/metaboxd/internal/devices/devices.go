// Package devices assembles LAN devices from DHCP leases and dnsmasq static entries
// and stores the names the owner gave them.
//
// Leases and static entries are not cached: they are changed by dnsmasq and the owner over
// SSH, so each request reads them anew. Own names live in the service
// directory of the daemon and are read once at start.
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
	// maxNameRunes is the ceiling on an own name: the label stands in a cell of the connections
	// table instead of the IP.
	maxNameRunes = 64

	// maxNames is the ceiling on the number of own names. The file is rewritten whole on
	// every change, and without a ceiling its size would be set by the client.
	maxNames = 1024
)

var (
	// ErrInvalidMAC means the address does not look like a six-byte Ethernet MAC.
	ErrInvalidMAC = errors.New("MAC-адрес не разобран")
	// ErrInvalidName means the name is longer than allowed or has control characters.
	ErrInvalidName = errors.New("имя устройства не принято")
	// ErrTooManyNames means there are more own names than the daemon agrees to store.
	ErrTooManyNames = errors.New("своих имён устройств слишком много")
)

// NameSource is where the device label comes from. The set is closed: the panel
// explains by it why the device is labelled this way.
type NameSource string

const (
	// SourceCustom means the owner set the name in the panel.
	SourceCustom NameSource = "custom"
	// SourceStatic means the name of a dnsmasq static lease.
	SourceStatic NameSource = "static"
	// SourceDHCP means the name the device gave itself when getting a lease.
	SourceDHCP NameSource = "dhcp"
	// SourceNone means no name, the panel labels the device with its address.
	SourceNone NameSource = "none"
)

// Device is a LAN device reduced by MAC.
type Device struct {
	// IP is the address from the lease, and without it from the static entry. Empty when
	// there is no address in either: the device has only its own name.
	IP string `json:"ip"`
	// MAC is lowercase with colons; the own name is stored by it.
	MAC string `json:"mac"`
	// Name is the label by priority: own name, static lease, DHCP. Empty
	// with NameSource `none`.
	Name string `json:"name"`
	// NameSource is where the label comes from; with `none` the panel labels
	// the device with its address.
	NameSource NameSource `json:"name_source"`
	// Static means the MAC has a static lease in UCI `dhcp`.
	Static bool `json:"static"`
	// Online means the lease has not expired by the router clock. Before NTP synchronization the clock
	// stands in the past, and an expired lease may count as alive.
	Online bool `json:"online"`
	// LeaseExpires is the lease end in unix seconds. Zero means no lease or it is
	// permanent; the second differs by the Online flag.
	LeaseExpires int64 `json:"lease_expires"`
}

// Runner runs an external command and returns its output with the exit code.
// Declared as a function for the same reason as procd.Runner: the result type of
// the launch owner must not be imported here.
type Runner func(ctx context.Context, name string, args ...string) (stdout string, exitCode int, err error)

// Store keeps own names between restarts. The service directory is owned by
// config.Store, so the write goes through it. A missing file is an error for
// which errors.Is(err, fs.ErrNotExist).
type Store interface {
	ReadDevices(ctx context.Context) ([]byte, error)
	WriteDevices(ctx context.Context, data []byte) error
}

// Options are the paths the daemon receives by flags.
type Options struct {
	// Leases is the dnsmasq leases file.
	Leases string
	// UCI is the absolute path to uci: under procd PATH is not the one in the shell.
	UCI string
	// Now is replaced in tests; nil means time.Now.
	Now func() time.Time
}

// Registry is the owner of the own device names: the file write and the in-memory state
// change under one mutex, so concurrent edits do not lose each
// other.
type Registry struct {
	run    Runner
	store  Store
	leases string
	uci    string
	now    func() time.Time

	mu    sync.Mutex
	names map[string]string
}

// New reads the own names from the service directory. A broken file is an error, not
// an empty list: the next edit would overwrite all names with it.
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

// List reduces leases, static entries and own names by MAC. A device with
// an own name gets into the list without a lease too, offline and without an address: a rule
// on it in the panel must not disappear while the device is off the network.
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

// compareDevices orders by address, devices without an address go last.
// The order is stable between requests: Go maps do not keep one.
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

// Rename sets the own device name; an empty name removes it, and the label
// returns to the static lease or DHCP. The name is written to disk before it
// gets into memory: a write failure leaves no name that would vanish with
// a restart.
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

// normalizeMAC accepts only an Ethernet MAC: net.ParseMAC lets through both
// 8- and 20-byte addresses, which dnsmasq leases never have.
func normalizeMAC(raw string) (string, error) {
	hw, err := net.ParseMAC(raw)
	if err != nil || len(hw) != 6 {
		return "", fmt.Errorf("%w: %q", ErrInvalidMAC, raw)
	}

	return hw.String(), nil
}
