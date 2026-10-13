package dataplane_test

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"metabox/internal/dataplane"
)

// fakeUCI holds the `metabox.dataplane` section and executes over it those uci batch
// commands the daemon writes, and show prints it the same way uci does.
type fakeUCI struct {
	exists  bool
	typ     string
	options map[string][]string
	scripts []string
	// ignore: commands with this substring uci "did not execute": batch on a command
	// failure goes on with code 0.
	ignore string
}

func (u *fakeUCI) run(_ context.Context, _ string, args ...string) (string, int, error) {
	if !slices.Equal(args, []string{"-q", "show", "metabox"}) {
		return "", 1, nil
	}

	var b strings.Builder

	b.WriteString("metabox.main=metabox\n")

	if u.exists {
		b.WriteString("metabox.dataplane=" + u.typ + "\n")

		for _, name := range slices.Sorted(maps.Keys(u.options)) {
			quoted := make([]string, 0, len(u.options[name]))
			for _, v := range u.options[name] {
				quoted = append(quoted, "'"+strings.ReplaceAll(v, "'", `'\''`)+"'")
			}

			b.WriteString("metabox.dataplane." + name + "=" + strings.Join(quoted, " ") + "\n")
		}
	}

	return b.String(), 0, nil
}

func (u *fakeUCI) batch(_ context.Context, input, _ string, args ...string) (string, int, error) {
	if !slices.Equal(args, []string{"-q", "batch"}) {
		return "", 1, nil
	}

	u.scripts = append(u.scripts, input)

	for line := range strings.Lines(input) {
		line = strings.TrimSpace(line)
		if u.ignore != "" && strings.Contains(line, u.ignore) {
			continue
		}

		cmd, rest, _ := strings.Cut(line, " ")
		path, value, _ := strings.Cut(rest, "=")
		value = strings.ReplaceAll(strings.TrimSuffix(strings.TrimPrefix(value, "'"), "'"), `'\''`, "'")
		option, isOption := strings.CutPrefix(path, "metabox.dataplane.")

		switch {
		case cmd == "set" && !isOption:
			if !u.exists {
				u.exists, u.options = true, map[string][]string{}
			}

			u.typ = value
		case cmd == "set":
			u.options[option] = []string{value}
		case cmd == "add_list":
			u.options[option] = append(u.options[option], value)
		case cmd == "delete" && !isOption:
			u.exists, u.typ, u.options = false, "", nil
		case cmd == "delete":
			delete(u.options, option)
		}
	}

	return "", 0, nil
}

func newWriter(u *fakeUCI) *dataplane.Reader {
	return dataplane.New(u.run, dataplane.Options{UCI: testUCI, Batch: u.batch})
}

func TestWriteRoundTrip(t *testing.T) {
	u := &fakeUCI{exists: true, typ: "dataplane", options: map[string][]string{
		"source_ip": {"10.0.0.1"},
		"comment":   {"владелец"},
	}}

	m := dataplane.Defaults()
	m.AccessMode = dataplane.AccessAll
	m.SourceIP = []string{"192.168.1.10", "192.168.1.0/30"}
	m.SourceMAC = []string{"aa:bb:cc:dd:ee:ff"}
	m.DNSPort = 5444

	if err := newWriter(u).Write(t.Context(), m); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := newWriter(u).Model(t.Context())
	if err != nil {
		t.Fatalf("reading after the write: %v", err)
	}

	if !reflect.DeepEqual(got, m) {
		t.Errorf("after the write\ngot      %+v\nexpected %+v", got, m)
	}

	if !slices.Equal(u.options["comment"], []string{"владелец"}) {
		t.Error("writing the model removed an option added by the owner")
	}

	if script := u.scripts[0]; !strings.HasSuffix(script, "commit metabox\n") {
		t.Errorf("script does not end with commit:\n%s", script)
	}
}

// uci batch did not execute a command but returned code 0: only the check
// after the write catches the mismatch.
func TestWriteDetectsSilentFailure(t *testing.T) {
	u := &fakeUCI{exists: true, typ: "dataplane", options: map[string][]string{}, ignore: "dns_port"}

	m := dataplane.Defaults()
	m.DNSPort = 5444

	if err := newWriter(u).Write(t.Context(), m); err == nil {
		t.Error("a batch command that did not run went unnoticed")
	}
}

func TestWriteRejectsInvalidModel(t *testing.T) {
	tests := []struct {
		name  string
		edit  func(*dataplane.Model)
		field string
	}{
		{"interface with a special character", func(m *dataplane.Model) { m.LANInterface = []string{"br-lan'\ncommit"} }, "lan_interface"},
		{"mode outside the set", func(m *dataplane.Model) { m.AccessMode = "" }, "acl_mode"},
		{"port out of range", func(m *dataplane.Model) { m.DNSPort = 0 }, "dns_port"},
		{"non-Ethernet MAC", func(m *dataplane.Model) { m.SourceMAC = []string{"aa:bb"} }, "source_mac"},
		{"eight-byte MAC", func(m *dataplane.Model) { m.SourceMAC = []string{"aa:bb:cc:dd:ee:ff:00:11"} }, "source_mac"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := &fakeUCI{}
			m := dataplane.Defaults()
			tt.edit(&m)

			err := newWriter(u).Write(t.Context(), m)

			invalid, ok := errors.AsType[*dataplane.InvalidError](err)
			if !ok {
				t.Fatalf("got %v, expected InvalidError", err)
			}

			if !slices.ContainsFunc(invalid.Fields, func(f dataplane.FieldError) bool { return f.Field == tt.field }) {
				t.Errorf("failure fields %+v, expected %s", invalid.Fields, tt.field)
			}

			if len(u.scripts) != 0 {
				t.Error("invalid model went into uci")
			}
		})
	}
}

// The service init script accepts a MAC only with colons: in UCI and outward the MAC
// goes in the form aa:bb:cc:dd:ee:ff, however it was written.
func TestWriteCanonicalizesMAC(t *testing.T) {
	u := &fakeUCI{}

	m := dataplane.Defaults()
	m.SourceMAC = []string{"AA-BB-CC-DD-EE-01", "aabb.ccdd.ee02"}
	want := []string{"aa:bb:cc:dd:ee:01", "aa:bb:cc:dd:ee:02"}

	normalized, err := dataplane.Normalize(m)
	if err != nil {
		t.Fatalf("normalization: %v", err)
	}

	if !slices.Equal(normalized.SourceMAC, want) {
		t.Errorf("normalized source_mac %q, expected %q", normalized.SourceMAC, want)
	}

	if err := newWriter(u).Write(t.Context(), m); err != nil {
		t.Fatalf("write: %v", err)
	}

	if !slices.Equal(u.options["source_mac"], want) {
		t.Errorf("source_mac in UCI %q, expected %q", u.options["source_mac"], want)
	}

	got, err := newWriter(u).Model(t.Context())
	if err != nil {
		t.Fatalf("reading after the write: %v", err)
	}

	if !slices.Equal(got.SourceMAC, want) {
		t.Errorf("read source_mac %q, expected %q", got.SourceMAC, want)
	}
}

func TestNormalizeFillsDefaults(t *testing.T) {
	m := dataplane.Defaults()
	m.Enabled = false
	m.LANInterface = nil
	m.SourceIP = []string{"", "192.168.1.10"}

	got, err := dataplane.Normalize(m)
	if err != nil {
		t.Fatalf("normalization: %v", err)
	}

	if !slices.Equal(got.LANInterface, []string{"br-lan"}) || !slices.Equal(got.SourceIP, []string{"192.168.1.10"}) {
		t.Errorf("normalized model %+v", got)
	}
}

func TestRestoreReturnsSnapshot(t *testing.T) {
	tests := []struct {
		name string
		snap dataplane.Snapshot
	}{
		{"section with foreign and invalid values", dataplane.Snapshot{Exists: true, Type: "dataplane", Options: map[string][]string{
			"enabled":   {"1"},
			"acl_mode":  {"some"},
			"source_ip": {"192.168.1.10"},
			"comment":   {"it's mine"},
		}}},
		{"there was no section", dataplane.Snapshot{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := &fakeUCI{exists: true, typ: "dataplane", options: map[string][]string{"dns_port": {"5444"}}}
			r := newWriter(u)

			if err := r.Restore(t.Context(), tt.snap); err != nil {
				t.Fatalf("restore: %v", err)
			}

			got, err := r.Snapshot(t.Context())
			if err != nil {
				t.Fatal(err)
			}

			if !got.Equal(tt.snap) {
				t.Errorf("after restore %+v, expected %+v", got, tt.snap)
			}

			if tt.snap.Exists && !strings.Contains(u.scripts[0], "add_list metabox.dataplane.source_ip='192.168.1.10'") {
				t.Errorf("a single-value list was restored not as a list:\n%s", u.scripts[0])
			}
		})
	}
}

func TestWriteWithoutBatch(t *testing.T) {
	u := &fakeUCI{}
	r := dataplane.New(u.run, dataplane.Options{UCI: testUCI})

	if err := r.Write(t.Context(), dataplane.Defaults()); err == nil {
		t.Error("write without uci batch passed")
	}
}
