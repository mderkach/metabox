package procd

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"testing"
	"time"
)

const listOutput = `{
  "other-proxy": {"instances": {"proxy": {"running": true, "pid": 5810}}},
  "sing-box": {"instances": {"instance1": {"running": false, "pid": 0}}},
  "dnsmasq": {"instances": {"cfg01": {"running": true, "pid": 1234}}}
}`

func runnerWith(stdout string, code int, err error) Runner {
	return func(context.Context, string, ...string) (string, int, error) {
		return stdout, code, err
	}
}

func TestServiceReadsState(t *testing.T) {
	tests := []struct {
		name        string
		service     string
		wantKnown   bool
		wantRunning bool
		wantPID     int
	}{
		{"service up", "other-proxy", true, true, 5810},
		{"service known but not running", "sing-box", true, false, 0},
		{"service unknown to procd", "unknown-service", false, false, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := New(runnerWith(listOutput, 0, nil), "/bin/ubus")

			got, err := client.Service(t.Context(), tt.service, "")
			if err != nil {
				t.Fatalf("service poll: %v", err)
			}

			if got.Known != tt.wantKnown {
				t.Errorf("known: got %v, expected %v", got.Known, tt.wantKnown)
			}

			if got.Running != tt.wantRunning {
				t.Errorf("running: got %v, expected %v", got.Running, tt.wantRunning)
			}

			if got.PID != tt.wantPID {
				t.Errorf("pid: got %d, expected %d", got.PID, tt.wantPID)
			}
		})
	}
}

// A service may run a cleanup script next to sing-box: the state and pid
// are taken only from the instance with the given name.
func TestServiceSelectsInstance(t *testing.T) {
	const twoInstances = `{"other-proxy": {"instances": {
		"proxy": {"running": %s, "pid": %d, "command": ["/usr/bin/sing-box", "run", "-c", "/var/run/other-proxy/proxy.json"]},
		"cleanup": {"running": true, "pid": 7001, "command": ["/usr/libexec/other-proxy/cleanup.sh"]}
	}}}`

	tests := []struct {
		name        string
		list        string
		service     string
		instance    string
		wantKnown   bool
		wantRunning bool
		wantPID     int
		wantConfigs []string
	}{
		{
			"sing-box instance crashed, the neighbour is alive",
			fmt.Sprintf(twoInstances, "false", 0), "other-proxy", "proxy",
			true, false, 0, []string{"/var/run/other-proxy/proxy.json"},
		},
		{
			"sing-box instance up",
			fmt.Sprintf(twoInstances, "true", 5810), "other-proxy", "proxy",
			true, true, 5810, []string{"/var/run/other-proxy/proxy.json"},
		},
		{
			"no instance with such a name",
			fmt.Sprintf(twoInstances, "true", 5810), "other-proxy", "sing-box",
			false, false, 0, nil,
		},
		{
			"name not set, single instance",
			`{"sing-box": {"instances": {"instance1": {"running": true, "pid": 4242, "command": ["/usr/bin/sing-box", "run", "-c", "/etc/sing-box/config.json"]}}}}`, "sing-box", "",
			true, true, 4242, []string{"/etc/sing-box/config.json"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := New(runnerWith(tt.list, 0, nil), "/bin/ubus")
			client.procDir = t.TempDir()

			got, err := client.Service(t.Context(), tt.service, tt.instance)
			if err != nil {
				t.Fatalf("service poll: %v", err)
			}

			if got.Known != tt.wantKnown || got.Running != tt.wantRunning || got.PID != tt.wantPID {
				t.Errorf("known %v, running %v, pid %d; expected %v, %v, %d",
					got.Known, got.Running, got.PID, tt.wantKnown, tt.wantRunning, tt.wantPID)
			}

			if !slices.Equal(got.Configs, tt.wantConfigs) {
				t.Errorf("configs %q, expected %q", got.Configs, tt.wantConfigs)
			}
		})
	}
}

// Without an instance name a service with several instances has nothing to choose from:
// the first live one could turn out to be a neighbouring script.
func TestServiceRejectsAmbiguousInstance(t *testing.T) {
	list := `{"other-proxy": {"instances": {
		"proxy": {"running": false, "pid": 0},
		"cleanup": {"running": true, "pid": 7001}
	}}}`

	client := New(runnerWith(list, 0, nil), "/bin/ubus")

	got, err := client.Service(t.Context(), "other-proxy", "")
	if !errors.Is(err, ErrAmbiguousInstance) {
		t.Fatalf("got %v, expected ErrAmbiguousInstance", err)
	}

	if got.PID != 0 || got.Running {
		t.Errorf("on failure the state %+v was returned", got)
	}
}

func TestServiceReportsFailures(t *testing.T) {
	tests := []struct {
		name   string
		runner Runner
	}{
		{"ubus не запустился", runnerWith("", 0, errors.New("нет такой команды"))},
		{"ubus returned an error", runnerWith("", 1, nil)},
		{"response does not parse", runnerWith("не json", 0, nil)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := New(tt.runner, "/bin/ubus")

			if _, err := client.Service(t.Context(), "other-proxy", ""); err == nil {
				t.Error("failure not reported")
			}
		})
	}
}

// The age is counted from system boot: the router has no real-time clock,
// and absolute time jumps on NTP synchronization.
func TestUptimeFromProc(t *testing.T) {
	const (
		pid         = 4242
		bootSeconds = 10_000.0
		startTicks  = 400_000
		userHZ      = 100
	)

	dir := t.TempDir()
	writeProcFile(t, dir, "uptime", strconv.FormatFloat(bootSeconds, 'f', 2, 64)+" 9000.00\n")
	// The process name in brackets contains a space: fields are counted from the bracket.
	writeProcFile(t, filepath.Join(dir, strconv.Itoa(pid)), "stat", procStat(startTicks))

	client := New(runnerWith(procList(pid), 0, nil), "/bin/ubus")
	client.procDir = dir

	got, err := client.Service(t.Context(), "other-proxy", "")
	if err != nil {
		t.Fatalf("service poll: %v", err)
	}

	want := time.Duration(bootSeconds)*time.Second - startTicks*time.Second/userHZ
	if got.Uptime != want {
		t.Errorf("age: got %v, expected %v", got.Uptime, want)
	}
}

// An unavailable /proc zeroes the age, but the service state stays correct:
// the panel must open without it.
func TestUptimeUnavailable(t *testing.T) {
	client := New(runnerWith(procList(4242), 0, nil), "/bin/ubus")
	client.procDir = filepath.Join(t.TempDir(), "нет-такого")

	got, err := client.Service(t.Context(), "other-proxy", "")
	if err != nil {
		t.Fatalf("service poll: %v", err)
	}

	if !got.Running {
		t.Error("the service must count as up")
	}

	if got.Uptime != 0 {
		t.Errorf("age: got %v, expected 0", got.Uptime)
	}
}

func procList(pid int) string {
	return `{"other-proxy": {"instances": {"proxy": {"running": true, "pid": ` + strconv.Itoa(pid) + `}}}}`
}

func procStat(startTicks int) string {
	// Fields 1-9 are written explicitly, then zeros up to the 21st: starttime is the 22nd.
	stat := "4242 (sing box) S 1 4242 4242 0 -1 4194560"
	for range 12 {
		stat += " 0"
	}

	return stat + " " + strconv.Itoa(startTicks) + " 0 0\n"
}

func writeProcFile(t *testing.T, dir, name, content string) {
	t.Helper()

	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("creating %s: %v", dir, err)
	}

	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
		t.Fatalf("writing %s: %v", name, err)
	}
}

// The working directory is taken from -D of the instance command: procd remembers it even for a
// crashed instance, and it is the command the service will start with on an Apply restart.
func TestServiceReadsWorkdir(t *testing.T) {
	tests := []struct {
		name string
		list string
		want string
	}{
		{
			"flag as a separate argument",
			`{"sing-box": {"instances": {"sing-box.main": {"running": true, "pid": 0,
				"command": ["/usr/bin/sing-box", "run", "-c", "/etc/sing-box/config.json", "-D", "/usr/share/sing-box"]}}}}`,
			"/usr/share/sing-box",
		},
		{
			"long form with an equals sign",
			`{"sing-box": {"instances": {"main": {"running": true, "pid": 0,
				"command": ["/usr/bin/sing-box", "--directory=/etc/sing-box", "run"]}}}}`,
			"/etc/sing-box",
		},
		{
			"crashed instance",
			`{"sing-box": {"instances": {"main": {"running": false,
				"command": ["/usr/bin/sing-box", "-D", "/etc/sing-box", "-C", "/etc/sing-box", "run"]}}}}`,
			"/etc/sing-box",
		},
		{
			"repeated flag: the last wins",
			`{"sing-box": {"instances": {"main": {"running": true, "pid": 0,
				"command": ["/usr/bin/sing-box", "-D", "/a", "-D/b", "run"]}}}}`,
			"/b",
		},
		{
			"relative path is not returned",
			`{"sing-box": {"instances": {"main": {"running": true, "pid": 0,
				"command": ["/usr/bin/sing-box", "-D", "etc", "run"]}}}}`,
			"",
		},
		{
			"no flag and no process: unknown",
			`{"sing-box": {"instances": {"main": {"running": false, "command": ["/usr/bin/sing-box", "run"]}}}}`,
			"",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := New(runnerWith(tt.list, 0, nil), "/bin/ubus")
			client.procDir = t.TempDir()

			got, err := client.Service(t.Context(), "sing-box", "")
			if err != nil {
				t.Fatalf("service poll: %v", err)
			}

			if got.Workdir != tt.want {
				t.Errorf("working directory: got %q, expected %q", got.Workdir, tt.want)
			}
		})
	}
}

// Config files and directories are taken from the same command: the apply
// checks the candidate by them in the mode the service will start in.
func TestServiceReadsConfigFlags(t *testing.T) {
	tests := []struct {
		name     string
		command  string
		wantFile []string
		wantDir  []string
	}{
		{
			"package init script: one file",
			`["/usr/bin/sing-box", "run", "-c", "/etc/sing-box/config.json", "-D", "/usr/share/sing-box"]`,
			[]string{"/etc/sing-box/config.json"}, nil,
		},
		{
			"directory mode",
			`["/usr/bin/sing-box", "-D", "/etc/sing-box", "-C", "/etc/sing-box", "run"]`,
			nil, []string{"/etc/sing-box"},
		},
		{
			"long forms and repeat",
			`["/usr/bin/sing-box", "run", "--config=/a.json", "--config", "/b.json", "--config-directory=/c"]`,
			[]string{"/a.json", "/b.json"}, []string{"/c"},
		},
		{
			"relative path from the working directory",
			`["/usr/bin/sing-box", "run", "-D", "/etc/sing-box", "-cconfig.json"]`,
			[]string{"/etc/sing-box/config.json"}, nil,
		},
		{
			"relative path without a working directory stays as is",
			`["/usr/bin/sing-box", "run", "-c", "config.json"]`,
			[]string{"config.json"}, nil,
		},
		{
			"without -c and -C sing-box reads config.json of the working directory",
			`["/usr/bin/sing-box", "-D", "/usr/share/sing-box", "--disable-color", "run"]`,
			[]string{"/usr/share/sing-box/config.json"}, nil,
		},
		{
			"repeated -C",
			`["/usr/bin/sing-box", "run", "-C", "/a", "-C/b"]`,
			nil, []string{"/a", "/b"},
		},
		{
			"a flag value is not counted as a flag",
			`["/usr/bin/sing-box", "run", "-c", "-Cx.json"]`,
			[]string{"-Cx.json"}, nil,
		},
		{
			"no flags after --",
			`["/usr/bin/sing-box", "run", "-c", "/a.json", "--", "-C", "/b"]`,
			[]string{"/a.json"}, nil,
		},
		{
			"flag last, without a value",
			`["/usr/bin/sing-box", "run", "-c"]`,
			[]string{"config.json"}, nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			list := `{"sing-box": {"instances": {"main": {"running": false, "command": ` + tt.command + `}}}}`
			client := New(runnerWith(list, 0, nil), "/bin/ubus")
			client.procDir = t.TempDir()

			got, err := client.Service(t.Context(), "sing-box", "")
			if err != nil {
				t.Fatalf("service poll: %v", err)
			}

			if !slices.Equal(got.Configs, tt.wantFile) || !slices.Equal(got.ConfigDirs, tt.wantDir) {
				t.Errorf("files %q and directories %q, expected %q and %q", got.Configs, got.ConfigDirs, tt.wantFile, tt.wantDir)
			}
		})
	}
}

// Without -D sing-box resolves paths from the directory it was started in: it
// is returned by /proc/<pid>/cwd of the live process.
func TestServiceReadsWorkdirFromProc(t *testing.T) {
	const pid = 4242

	dir := t.TempDir()
	cwd := t.TempDir()

	if err := os.MkdirAll(filepath.Join(dir, strconv.Itoa(pid)), 0o700); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(cwd, filepath.Join(dir, strconv.Itoa(pid), "cwd")); err != nil {
		t.Fatal(err)
	}

	list := `{"sing-box": {"instances": {"main": {"running": true, "pid": ` + strconv.Itoa(pid) +
		`, "command": ["/usr/bin/sing-box", "run"]}}}}`

	client := New(runnerWith(list, 0, nil), "/bin/ubus")
	client.procDir = dir

	got, err := client.Service(t.Context(), "sing-box", "")
	if err != nil {
		t.Fatalf("service poll: %v", err)
	}

	if got.Workdir != cwd {
		t.Errorf("working directory: got %q, expected %q", got.Workdir, cwd)
	}
}
