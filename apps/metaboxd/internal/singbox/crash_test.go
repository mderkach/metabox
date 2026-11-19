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
			runner := commandRunner{
				initScript: {ExitCode: tt.running},
				logread:    {Stdout: line},
			}
			supervisor := &fakeSupervisor{state: procd.State{Known: tt.known}}

			client, err := singbox.New(runner, binary, initScript, logread, supervisor)
			if err != nil {
				t.Fatalf("client build: %v", err)
			}

			got, err := client.Crash(t.Context())
			if err != nil {
				t.Fatalf("crash: %v", err)
			}
			if got != tt.want {
				t.Errorf("crash %q, want %q", got, tt.want)
			}
		})
	}
}
