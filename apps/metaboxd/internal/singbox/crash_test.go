package singbox_test

import (
	"context"
	"testing"

	"metabox/internal/procd"
	"metabox/internal/singbox"
)

// commandRunner answers each command by its name: the init script and the logger differ.
type commandRunner map[string]singbox.Result

func (r commandRunner) Run(_ context.Context, name string, _ ...string) (singbox.Result, error) {
	return r[name], nil
}

const logread = "/sbin/logread"

func newCrashClient(t *testing.T, running int, known bool, log string) *singbox.Client {
	t.Helper()

	runner := commandRunner{
		initScript: {ExitCode: running},
		logread:    {Stdout: log},
	}
	supervisor := &fakeSupervisor{state: procd.State{Known: known}}

	client, err := singbox.New(runner, binary, initScript, logread, supervisor)
	if err != nil {
		t.Fatalf("client build: %v", err)
	}

	return client
}

func TestCrash(t *testing.T) {
	const line = "Thu Nov 19 10:00:00 2026 daemon.err sing-box[4242]: FATAL[0000] start service: boom"

	tests := []struct {
		name    string
		running int
		known   bool
		want    string
	}{
		{"crashed service gives its reason", 1, true, "FATAL[0000] start service: boom"},
		{"running service has no crash", 0, true, ""},
		{"stopped service has no crash", 1, false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := newCrashClient(t, tt.running, tt.known, line).Crash(t.Context(), "")
			if err != nil {
				t.Fatalf("crash: %v", err)
			}
			if got != tt.want {
				t.Errorf("crash %q, want %q", got, tt.want)
			}
		})
	}
}

// procd keeps a halted service known with no instance, and the log still holds the crash
// of an earlier start: only what sing-box wrote after the mark is a crash of this start.
func TestCrashCountsOnlyLinesAfterTheMark(t *testing.T) {
	const (
		old    = "Thu Nov 19 10:00:00 2026 daemon.err sing-box[4242]: FATAL[0000] start service: old"
		closed = "Thu Nov 19 10:05:00 2026 daemon.err sing-box[5000]: ERROR inbound closed"
		fresh  = "Thu Nov 19 10:05:01 2026 daemon.err sing-box[5100]: FATAL[0000] start service: fresh"
	)

	tests := []struct {
		name string
		log  string
		mark string
		want string
	}{
		{"nothing after the mark", old, old, ""},
		{"an ERROR of a stopping process is no crash", old + "\n" + closed, old, ""},
		{"a FATAL after the mark", old + "\n" + closed + "\n" + fresh, old, "FATAL[0000] start service: fresh"},
		{"a mark the ring dropped", closed + "\n" + fresh, old, "FATAL[0000] start service: fresh"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := newCrashClient(t, 1, true, tt.log).Crash(t.Context(), tt.mark)
			if err != nil {
				t.Fatalf("crash: %v", err)
			}
			if got != tt.want {
				t.Errorf("crash %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCrashMark(t *testing.T) {
	const last = "Thu Nov 19 10:00:01 2026 daemon.err sing-box[4242]: FATAL[0000] start service: boom"

	log := "Thu Nov 19 10:00:00 2026 daemon.err sing-box[4242]: INFO started\n" + last + "\n"

	if got := newCrashClient(t, 0, true, log).CrashMark(t.Context()); got != last {
		t.Errorf("mark %q, want the last line", got)
	}
	if got := newCrashClient(t, 0, true, "").CrashMark(t.Context()); got != "" {
		t.Errorf("mark %q of an empty log, want none", got)
	}
}
