package dataplane

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strconv"
	"strings"

	"metabox/internal/uci"
)

// BatchRunner runs a command with input on stdin and returns its output with the exit
// code.
type BatchRunner func(ctx context.Context, input, name string, args ...string) (stdout string, exitCode int, err error)

// listOptions are the list options of the model. In `uci show` output a list of one
// value is indistinguishable from an option, and the init script reads them with config_list_foreach,
// which does not see an option: on restore they are written only as a list.
var listOptions = []string{"source_ip", "source_mac", "lan_interface", "wan_proxy_cidr", "wan_direct_cidr"}

// Snapshot is the `metabox.dataplane` section as it lies in UCI, unparsed.
// The model change is rolled back by it: what the daemon would not accept itself is returned too,
// options added by the owner and invalid values.
type Snapshot struct {
	// Exists means the section existed; false means the rollback deletes it.
	Exists  bool                `json:"exists"`
	Type    string              `json:"type,omitempty"`
	Options map[string][]string `json:"options,omitempty"`
}

// Model parses the snapshot the same way Reader.Model parses UCI.
func (s Snapshot) Model() (Model, error) {
	if !s.Exists || s.Type != sectionType {
		return Defaults(), nil
	}

	return decode(uci.Section{Name: section, Type: s.Type, Options: s.Options})
}

// Equal compares snapshots by section content.
func (s Snapshot) Equal(other Snapshot) bool {
	if s.Exists != other.Exists {
		return false
	}

	if !s.Exists {
		return true
	}

	return s.Type == other.Type && maps.EqualFunc(s.Options, other.Options, slices.Equal)
}

// Sum is the section fingerprint for optimistic locking of a model change. The JSON
// is deterministic: map keys are sorted, the order of list values matters in
// UCI too. A missing section gives one fingerprint regardless of other fields.
func (s Snapshot) Sum() string {
	if !s.Exists {
		s = Snapshot{}
	}

	// There is no error here: the snapshot holds only strings, string slices and a map with
	// string keys.
	data, _ := json.Marshal(s)
	digest := sha256.Sum256(data)

	return hex.EncodeToString(digest[:])
}

// Normalize checks the model with the same rules as a read from UCI and returns it
// in the form it will be read after the write: empty list values are
// dropped, an empty lan_interface is replaced by the default.
func Normalize(m Model) (Model, error) {
	return decode(encode(m))
}

func encode(m Model) uci.Section {
	options := map[string][]string{
		"enabled":       {flagValue(m.Enabled)},
		"redirect_port": {strconv.Itoa(m.RedirectPort)},
		"tproxy_port":   {strconv.Itoa(m.TproxyPort)},
		"dns_port":      {strconv.Itoa(m.DNSPort)},
		"dns_hijack":    {flagValue(m.DNSHijack)},
		"self_mark":     {strconv.FormatUint(uint64(m.SelfMark), 10)},
		"tproxy_mark":   {strconv.FormatUint(uint64(m.TproxyMark), 10)},
		"route_table":   {strconv.FormatUint(uint64(m.RouteTable), 10)},
		"acl_mode":      {string(m.AccessMode)},
		"ipv6":          {flagValue(m.IPv6)},
	}

	// An empty list is written by the absence of the option, the way it will be read after the write:
	// lan_interface then gets the default.
	for name, values := range map[string][]string{
		"source_ip":       m.SourceIP,
		"source_mac":      m.SourceMAC,
		"lan_interface":   m.LANInterface,
		"wan_proxy_cidr":  m.WANProxyCIDR,
		"wan_direct_cidr": m.WANDirectCIDR,
	} {
		if values = slices.DeleteFunc(slices.Clone(values), func(v string) bool { return v == "" }); len(values) > 0 {
			options[name] = values
		}
	}

	return uci.Section{Name: section, Type: sectionType, Options: options}
}

func flagValue(v bool) string {
	if v {
		return "1"
	}

	return "0"
}

// Snapshot takes the `metabox.dataplane` section as is. No `metabox` config
// or section means a snapshot without it.
func (r *Reader) Snapshot(ctx context.Context) (Snapshot, error) {
	out, code, err := r.run(ctx, r.uci, "-q", "show", config)
	if err != nil {
		return Snapshot{}, fmt.Errorf("uci show %s: %w", config, err)
	}

	if code != 0 {
		return Snapshot{}, nil
	}

	for _, s := range uci.Parse(out, config) {
		if s.Name == section {
			return Snapshot{Exists: true, Type: s.Type, Options: s.Options}, nil
		}
	}

	return Snapshot{}, nil
}

// Write writes the model to UCI with one `uci batch` with commit and compares
// what is read after the write with the model. The comparison is mandatory: uci batch on a
// failure of a single command prints an error and goes on with code 0.
//
// Options absent from the model stay in the section: the owner could have added them.
func (r *Reader) Write(ctx context.Context, m Model) error {
	want, err := Normalize(m)
	if err != nil {
		return err
	}

	enc := encode(want)

	var b strings.Builder

	fmt.Fprintf(&b, "set %s.%s=%s\n", config, section, sectionType)

	for _, name := range slices.Sorted(maps.Keys(enc.Options)) {
		if !slices.Contains(listOptions, name) {
			fmt.Fprintf(&b, "set %s.%s.%s=%s\n", config, section, name, quote(enc.Options[name][0]))
		}
	}

	for _, name := range listOptions {
		writeList(&b, name, enc.Options[name])
	}

	if err := r.commit(ctx, &b); err != nil {
		return err
	}

	got, err := r.Model(ctx)
	if err != nil {
		return fmt.Errorf("модель после записи: %w", err)
	}

	if !reflect.DeepEqual(got, want) {
		return errors.New("модель в UCI после записи не совпала с записанной")
	}

	return nil
}

// Restore returns the section to the snapshot: deletes it and writes anew, so
// options added after the snapshot do not stay.
func (r *Reader) Restore(ctx context.Context, snap Snapshot) error {
	var b strings.Builder

	fmt.Fprintf(&b, "delete %s.%s\n", config, section)

	if snap.Exists {
		if !safeWord(snap.Type) {
			return fmt.Errorf("тип секции %q не записать", snap.Type)
		}

		fmt.Fprintf(&b, "set %s.%s=%s\n", config, section, snap.Type)

		for _, name := range slices.Sorted(maps.Keys(snap.Options)) {
			values := snap.Options[name]
			if !safeWord(name) || len(values) == 0 || slices.ContainsFunc(values, splitsCommand) {
				return fmt.Errorf("опция %q не записать", name)
			}

			if slices.Contains(listOptions, name) || len(values) > 1 {
				writeList(&b, name, values)

				continue
			}

			fmt.Fprintf(&b, "set %s.%s.%s=%s\n", config, section, name, quote(values[0]))
		}
	}

	if err := r.commit(ctx, &b); err != nil {
		return err
	}

	got, err := r.Snapshot(ctx)
	if err != nil {
		return fmt.Errorf("секция после восстановления: %w", err)
	}

	if !got.Equal(snap) {
		return errors.New("секция в UCI после восстановления не совпала со снимком")
	}

	return nil
}

func writeList(b *strings.Builder, name string, values []string) {
	fmt.Fprintf(b, "delete %s.%s.%s\n", config, section, name)

	for _, v := range values {
		fmt.Fprintf(b, "add_list %s.%s.%s=%s\n", config, section, name, quote(v))
	}
}

func (r *Reader) commit(ctx context.Context, b *strings.Builder) error {
	if r.batch == nil {
		return errors.New("запись UCI не настроена")
	}

	fmt.Fprintf(b, "commit %s\n", config)

	_, code, err := r.batch(ctx, b.String(), r.uci, "-q", "batch")
	if err != nil {
		return fmt.Errorf("uci batch: %w", err)
	}

	if code != 0 {
		return fmt.Errorf("uci batch: код %d", code)
	}

	return nil
}

// quote wraps a value in single quotes the way uci batch parses it:
// a quote inside the value closes the quotes, is escaped and opens them
// again. A line break cannot be hidden this way, so a value with it is not written
// at all, see splitsCommand.
func quote(v string) string {
	return "'" + strings.ReplaceAll(v, "'", `'\''`) + "'"
}

// splitsCommand: the value would tear the uci batch command line.
func splitsCommand(v string) bool {
	return strings.ContainsAny(v, "\n\r\x00")
}

// safeWord is an option name or section type that uci accepts without quotes.
func safeWord(s string) bool {
	return s != "" && strings.Trim(s, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") == ""
}
