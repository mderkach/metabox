package singbox_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"

	"metabox/internal/procd"
	"metabox/internal/singbox"
)

const (
	binary     = "/usr/bin/sing-box"
	initScript = "/etc/init.d/sing-box"
)

type fakeRunner struct {
	result singbox.Result
	err    error
	calls  [][]string
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (singbox.Result, error) {
	f.calls = append(f.calls, append([]string{name}, args...))

	return f.result, f.err
}

func newClient(t *testing.T, runner singbox.Runner) *singbox.Client {
	t.Helper()

	client, err := singbox.New(runner, binary, initScript, "", "", nil)
	if err != nil {
		t.Fatalf("client build: %v", err)
	}

	return client
}

func TestNewRejectsRelativePaths(t *testing.T) {
	tests := []struct {
		name       string
		binary     string
		initScript string
	}{
		{"relative binary", "sing-box", initScript},
		{"relative init script", binary, "init.d/sing-box"},
		{"empty path", "", initScript},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := singbox.New(&fakeRunner{}, tt.binary, tt.initScript, "", "", nil); err == nil {
				t.Error("path accepted: under procd PATH is not the one in the shell")
			}
		})
	}
}

// A candidate is checked in the mode the service will start in: a file (-c) or
// a directory (-C). -D is the same relative path base as the service's.
func TestCheckFollowsServiceMode(t *testing.T) {
	tests := []struct {
		name    string
		config  string
		workdir string
		want    []string
	}{
		{
			"config file",
			"/tmp/candidate/config.json", "/usr/share/sing-box",
			[]string{binary, "check", "-D", "/usr/share/sing-box", "-c", "/tmp/candidate/config.json"},
		},
		{
			"whole directory",
			"", "/tmp/candidate",
			[]string{binary, "check", "-D", "/tmp/candidate", "-C", "/tmp/candidate"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := &fakeRunner{}

			if err := newClient(t, runner).Check(t.Context(), "/tmp/candidate", tt.config, tt.workdir); err != nil {
				t.Fatalf("check: %v", err)
			}

			if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], tt.want) {
				t.Errorf("called %v, expected %v", runner.calls, tt.want)
			}
		})
	}
}

func TestCheckReturnsBinaryOutputVerbatim(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{
		Stdout:   "разбор конфига",
		Stderr:   "FATAL[0000] decode config at 12: unknown outbound type",
		ExitCode: 1,
	}}

	err := newClient(t, runner).Check(t.Context(), "/tmp/candidate", "", "/tmp/candidate")

	checkErr, ok := errors.AsType[*singbox.CheckError](err)
	if !ok {
		t.Fatalf("got %v, expected *CheckError", err)
	}
	if checkErr.ExitCode != 1 {
		t.Errorf("code %d, expected 1", checkErr.ExitCode)
	}
	if checkErr.Stdout != runner.result.Stdout || checkErr.Stderr != runner.result.Stderr {
		t.Errorf("output changed: %+v", checkErr)
	}
}

func TestCheckWrapsLaunchFailure(t *testing.T) {
	launch := errors.New("executable file not found")
	runner := &fakeRunner{err: launch}

	err := newClient(t, runner).Check(t.Context(), "/tmp/candidate", "", "/tmp/candidate")

	if !errors.Is(err, launch) {
		t.Errorf("got %v, expected a wrapper over the start error", err)
	}
	if _, ok := errors.AsType[*singbox.CheckError](err); ok {
		t.Error("a start failure was passed off as the binary verdict")
	}
}

func TestBuildReadsVersionAndTags(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{
		Stdout: "sing-box version 1.14.0-extended-2.7.1\n\nEnvironment: go1.26.6 linux/arm64\nTags: with_quic, with_utls\nCGO: disabled\n",
	}}

	got, err := newClient(t, runner).Build(t.Context())
	if err != nil {
		t.Fatalf("version: %v", err)
	}

	if got.Version != "1.14.0-extended-2.7.1" {
		t.Errorf("version %q, expected 1.14.0-extended-2.7.1", got.Version)
	}
	if !slices.Equal(got.Tags, []string{"with_quic", "with_utls"}) {
		t.Errorf("tags %v, expected [with_quic with_utls]", got.Tags)
	}

	want := []string{binary, "version"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("calls %v, expected one %v", runner.calls, want)
	}
}

// The binary output from the device, 2026-09-23: the environment line carries its flags
// through a dash, and the tags are a decade and a half.
func TestBuildReadsDeviceOutput(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{Stdout: "sing-box version 1.14.0-extended-2.7.1\n\n" +
		"Environment: go1.26.6-X:nodwarf5 linux/arm64\n" +
		"Tags: with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale," +
		"with_masque,with_mtproxy,with_trusttunnel,with_call,with_sudoku,with_manager,with_admin_panel," +
		"with_profiler,badlinkname,tfogo_checklinkname0\n" +
		"Revision: 217f77643f19e915ea38ba2a9ac7e28e22a0cec5\nCGO: disabled\n"}}

	got, err := newClient(t, runner).Build(t.Context())
	if err != nil {
		t.Fatalf("version: %v", err)
	}

	if len(got.Tags) != 18 || !slices.Contains(got.Tags, "with_quic") || slices.Contains(got.Tags, "with_ccm") {
		t.Errorf("tags %v: expected 18, with with_quic and without with_ccm", got.Tags)
	}
}

// sing-box does not print the `Tags:` line for a build without tags, and this knowledge is
// "no tags", not "tags unknown".
func TestBuildWithoutTags(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{Stdout: "sing-box version 1.14.0\n\nEnvironment: go1.26.6 linux/arm64\n"}}

	got, err := newClient(t, runner).Build(t.Context())
	if err != nil {
		t.Fatalf("version: %v", err)
	}

	if got.Tags == nil || len(got.Tags) != 0 {
		t.Errorf("tags %#v, expected an empty list", got.Tags)
	}
}

// The panel must work with a broken sing-box too, so a failure
// is returned as an error and not as an empty version, which the caller would take for
// a read one.
func TestBuildFails(t *testing.T) {
	tests := []struct {
		name   string
		result singbox.Result
	}{
		{"non-zero code", singbox.Result{Stderr: "not found", ExitCode: 1}},
		{"output not parsed", singbox.Result{Stdout: "какой-то мусор\n"}},
		{"empty output", singbox.Result{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := newClient(t, &fakeRunner{result: tt.result}).Build(t.Context()); err == nil {
				t.Error("version accepted")
			}
		})
	}
}

func TestRestartUsesInitScript(t *testing.T) {
	runner := &fakeRunner{}

	if err := newClient(t, runner).Restart(t.Context()); err != nil {
		t.Fatalf("restart: %v", err)
	}

	want := []string{initScript, "restart"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("called %v, expected %v: procd owns the service", runner.calls, want)
	}
}

func TestRestartFails(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{ExitCode: 1, Stderr: "no such service\nподробности"}}

	if err := newClient(t, runner).Restart(t.Context()); err == nil {
		t.Error("a non-zero restart code taken for success")
	}
}

func TestRunning(t *testing.T) {
	tests := []struct {
		name     string
		exitCode int
		want     bool
	}{
		{"service up", 0, true},
		{"service down", 1, false},
		{"init script returned another code", 3, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := &fakeRunner{result: singbox.Result{ExitCode: tt.exitCode}}

			got, err := newClient(t, runner).Running(t.Context())
			if err != nil {
				t.Fatalf("service state: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %v, expected %v: a down service is not a failure", got, tt.want)
			}
		})
	}
}

type fakeSupervisor struct {
	state     procd.State
	err       error
	names     []string
	instances []string
}

func (f *fakeSupervisor) Service(_ context.Context, name, instance string) (procd.State, error) {
	f.names = append(f.names, name)
	f.instances = append(f.instances, instance)

	return f.state, f.err
}

// The service command is asked from procd by the init script name; without a process
// manager it is unknown, and this is not a failure.
func TestLaunch(t *testing.T) {
	t.Run("command from procd", func(t *testing.T) {
		want := procd.Launch{Workdir: "/etc/sing-box", Configs: []string{"/etc/sing-box/config.json"}}
		supervisor := &fakeSupervisor{state: procd.State{Known: true, Launch: want}}

		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", "", supervisor)
		if err != nil {
			t.Fatalf("client build: %v", err)
		}

		got, err := client.Launch(t.Context())
		if err != nil {
			t.Fatalf("service command: %v", err)
		}
		if got.Workdir != want.Workdir || !slices.Equal(got.Configs, want.Configs) {
			t.Errorf("got %+v, expected %+v", got, want)
		}
		if !slices.Equal(supervisor.names, []string{"sing-box"}) {
			t.Errorf("procd asked about %v, expected the sing-box service", supervisor.names)
		}
	})

	t.Run("procd failure is returned to the caller", func(t *testing.T) {
		supervisor := &fakeSupervisor{err: errors.New("ubus не отвечает")}

		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", "", supervisor)
		if err != nil {
			t.Fatalf("client build: %v", err)
		}

		if _, err := client.Launch(t.Context()); err == nil {
			t.Error("procd failure swallowed")
		}
	})

	t.Run("without procd the command is unknown", func(t *testing.T) {
		got, err := newClient(t, &fakeRunner{}).Launch(t.Context())
		if err != nil || got.Workdir != "" || got.Configs != nil || got.ConfigDirs != nil {
			t.Errorf("got %+v, %v; expected an empty command without an error", got, err)
		}
	})
}

// The pid is taken from procd under the init script name: by its change the apply learns
// that after a restart a new process is answering.
func TestPIDReadsSupervisor(t *testing.T) {
	supervisor := &fakeSupervisor{state: procd.State{Known: true, Running: true, PID: 4242}}

	client, err := singbox.New(&fakeRunner{}, binary, initScript, "", "", supervisor)
	if err != nil {
		t.Fatalf("client build: %v", err)
	}

	pid, err := client.PID(t.Context())
	if err != nil {
		t.Fatalf("service pid: %v", err)
	}
	if pid != 4242 {
		t.Errorf("pid %d, expected 4242", pid)
	}
	if !slices.Equal(supervisor.names, []string{"sing-box"}) {
		t.Errorf("procd asked about %v, expected the init script service", supervisor.names)
	}
}

func TestPIDFails(t *testing.T) {
	t.Run("without a process manager", func(t *testing.T) {
		if _, err := newClient(t, &fakeRunner{}).PID(t.Context()); !errors.Is(err, singbox.ErrNoSupervisor) {
			t.Errorf("got %v, expected ErrNoSupervisor", err)
		}
	})

	t.Run("procd did not answer", func(t *testing.T) {
		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", "", &fakeSupervisor{err: errors.New("ubus молчит")})
		if err != nil {
			t.Fatalf("client build: %v", err)
		}

		if _, err := client.PID(t.Context()); err == nil {
			t.Error("procd failure not reported")
		}
	})

	// procd returns an unfamiliar service with an empty state without an error; a zero pid
	// here is not "not up" but "nobody to ask", otherwise the apply would wait for
	// a new process until the cycle timeout and roll back.
	t.Run("procd does not know the service", func(t *testing.T) {
		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", "", &fakeSupervisor{state: procd.State{}})
		if err != nil {
			t.Fatalf("client build: %v", err)
		}

		if _, err := client.PID(t.Context()); !errors.Is(err, singbox.ErrUnknownService) {
			t.Errorf("got %v, expected ErrUnknownService", err)
		}
	})
}

// The sing-box instance is set by name: both the init script and procd are asked about it, and
// not about the whole service, where a foreign script may live nearby.
func TestStateAsksNamedInstance(t *testing.T) {
	runner := &fakeRunner{}
	supervisor := &fakeSupervisor{state: procd.State{Known: true, Running: true, PID: 4242}}

	client, err := singbox.New(runner, binary, "/etc/init.d/homeproxy", "proxy", "", supervisor)
	if err != nil {
		t.Fatalf("client build: %v", err)
	}

	if _, err := client.State(t.Context()); err != nil {
		t.Fatalf("service state: %v", err)
	}

	want := []string{"/etc/init.d/homeproxy", "running", "proxy"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("init script called as %q, expected %q", runner.calls, want)
	}

	if !slices.Equal(supervisor.instances, []string{"proxy"}) {
		t.Errorf("procd asked about instances %q, expected proxy", supervisor.instances)
	}
}

// Without a name for a service with several instances the daemon does not know which process
// is its own, and the state is not guessed by the init script.
func TestStateFailsOnAmbiguousInstance(t *testing.T) {
	runner := &fakeRunner{}
	supervisor := &fakeSupervisor{err: fmt.Errorf("служба homeproxy: %w", procd.ErrAmbiguousInstance)}

	client, err := singbox.New(runner, binary, "/etc/init.d/homeproxy", "", "", supervisor)
	if err != nil {
		t.Fatalf("client build: %v", err)
	}

	if _, err := client.State(t.Context()); !errors.Is(err, procd.ErrAmbiguousInstance) {
		t.Errorf("got %v, expected ErrAmbiguousInstance", err)
	}

	want := []string{"/etc/init.d/homeproxy", "running"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("init script called as %q, expected %q", runner.calls, want)
	}
}
