// Package procd reads the service state from procd, the OpenWrt process manager.
//
// Service control stays with the init script (DeviceIO): here only
// reading. A process is neither stopped nor started by pid from here: the pid is needed
// to learn the process age and to tell the process after a restart from the previous one.
package procd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Runner runs an external command and returns its output with the exit code.
//
// The dependency is declared as a function, not an interface, on purpose: the package
// that owns command launching has its own result type, and importing it
// here is impossible, since it depends on this package itself.
type Runner func(ctx context.Context, name string, args ...string) (stdout string, exitCode int, err error)

// State is what procd knows about the service.
type State struct {
	// Known reports whether the service and its instance are declared at all. A service procd
	// does not know and a stopped one are different cases: the first means it was not
	// started once since boot.
	Known bool
	// Running is whether the service instance is up.
	Running bool
	// PID of the running instance; zero when it is not up. Read-only:
	// the service is controlled by the init script, and the apply learns by pid that
	// after a restart a new process is answering.
	PID int
	// Uptime is the process age. Zero when it could not be learned: procd
	// does not return the age, it is computed from /proc and may be
	// unavailable on a foreign system.
	Uptime time.Duration
	Launch
}

// Launch is what procd starts the service with: the working directory and the config.
type Launch struct {
	// Workdir is the service working directory: sing-box resolves relative
	// config paths from it. Taken from the -D flag of the command procd starts the
	// instance with: procd remembers a crashed instance together with the command, and the directory
	// is visible without a process. Without the flag it is the directory of the live process from
	// /proc/<pid>/cwd. Empty when it could not be learned.
	Workdir string
	// Configs are the config files from the -c (--config) flags of the same command, in
	// command order; a command without -c and -C gives config.json, which sing-box
	// then reads. A relative path sing-box reads from the working directory,
	// it moves there before reading the config, and here it is already brought to it;
	// with an unknown working directory it stays as is. Empty means the command is not
	// visible.
	Configs []string
	// ConfigDirs are the config directories from the -C (--config-directory) flags, by the
	// same rules.
	ConfigDirs []string
}

// Client asks procd through ubus.
type Client struct {
	runner Runner
	ubus   string
	// procDir is extracted so the test does not depend on /proc of the live machine.
	procDir string
}

// New assembles the client. ubus is the absolute path to the utility, like the other
// paths in the daemon: PATH under procd is not the one in the interactive shell.
func New(runner Runner, ubus string) *Client {
	return &Client{runner: runner, ubus: ubus, procDir: "/proc"}
}

// Service returns the service state by its name in procd. The name is the same as the
// init script's: procd registers the service under the script name.
//
// State, pid and command are taken only from the instance instance. If there is no
// instance with such a name, the service is considered unknown, Known is false.
func (c *Client) Service(ctx context.Context, name, instance string) (State, error) {
	stdout, code, err := c.runner(ctx, c.ubus, "call", "service", "list")
	if err != nil {
		return State{}, fmt.Errorf("query procd: %w", err)
	}

	if code != 0 {
		return State{}, fmt.Errorf("query procd: exit code %d", code)
	}

	var services map[string]struct {
		Instances map[string]struct {
			Running bool     `json:"running"`
			PID     int      `json:"pid"`
			Command []string `json:"command"`
		} `json:"instances"`
	}

	if err := json.Unmarshal([]byte(stdout), &services); err != nil {
		return State{}, fmt.Errorf("parse procd response: %w", err)
	}

	service, ok := services[name]
	if !ok {
		return State{}, nil
	}

	if len(service.Instances) == 0 {
		return State{Known: true}, nil
	}

	selected, ok := service.Instances[instance]
	if !ok {
		return State{}, nil
	}

	state := State{Known: true}

	if !selected.Running {
		state.Workdir = directoryFlag(selected.Command)
		state.Configs, state.ConfigDirs = configFlags(selected.Command, state.Workdir)

		return state, nil
	}

	state.Running = true
	state.PID = selected.PID
	state.Uptime = c.uptime(selected.PID)
	state.Workdir = c.workdir(selected.PID, selected.Command)
	state.Configs, state.ConfigDirs = configFlags(selected.Command, state.Workdir)

	return state, nil
}

// workdir takes the working directory from the instance command, and without the -D flag from
// the live process: sing-box without the flag resolves paths from the directory it
// was started in.
func (c *Client) workdir(pid int, command []string) string {
	if dir := directoryFlag(command); dir != "" {
		return dir
	}

	if pid <= 0 {
		return ""
	}

	dir, err := os.Readlink(c.procDir + "/" + strconv.Itoa(pid) + "/cwd")
	if err != nil || !filepath.IsAbs(dir) {
		return ""
	}

	return dir
}

// directoryFlag extracts the value of -D (--directory) from the sing-box command; if the
// flag repeats, the last one wins. A relative path is not returned: which
// directory to count it from only procd knows.
func directoryFlag(command []string) string {
	values := flagValues(command, "-D", "--directory")
	if len(values) == 0 || !filepath.IsAbs(values[len(values)-1]) {
		return ""
	}

	return values[len(values)-1]
}

// defaultConfig is the file sing-box reads from the working directory when the
// command has neither -c nor -C.
const defaultConfig = "config.json"

// configFlags extracts the config files (-c) and directories (-C): sing-box
// accepts any number of them and merges all. A command with neither flag reads
// config.json of the working directory, and that is what we return, otherwise it would not differ
// from a command that is not visible. A relative path is brought to the working
// directory if it is known.
func configFlags(command []string, workdir string) (configs, dirs []string) {
	if len(command) == 0 {
		return nil, nil
	}

	resolve := func(values []string) []string {
		for i, value := range values {
			if !filepath.IsAbs(value) && workdir != "" {
				values[i] = filepath.Join(workdir, value)
			}
		}

		return values
	}

	configs = flagValues(command, "-c", "--config")
	dirs = flagValues(command, "-C", "--config-directory")

	if len(configs) == 0 && len(dirs) == 0 {
		configs = []string{defaultConfig}
	}

	return resolve(configs), resolve(dirs)
}

// flagValues collects the flag values in all forms accepted by the sing-box flag
// parsing: `-x v`, `-xv`, `-x=v`, `--long v`, `--long=v`. A value
// taken by a flag is not itself counted as a flag, and after `--` there are no flags.
func flagValues(command []string, short, long string) []string {
	var values []string

	for i := 0; i < len(command); i++ {
		arg := command[i]

		switch {
		case arg == "--":
			return values
		case arg == short || arg == long:
			if i+1 < len(command) {
				i++
				values = append(values, command[i])
			}
		case strings.HasPrefix(arg, long+"="):
			values = append(values, strings.TrimPrefix(arg, long+"="))
		case strings.HasPrefix(arg, short) && !strings.HasPrefix(arg, "--"):
			values = append(values, strings.TrimPrefix(strings.TrimPrefix(arg, short), "="))
		case isValueFlag(arg) && i+1 < len(command):
			i++
		}
	}

	return values
}

// isValueFlag reports whether a sing-box flag takes the next argument
// as a value: that one is then not parsed as a flag.
func isValueFlag(arg string) bool {
	switch arg {
	case "-c", "--config", "-C", "--config-directory", "-D", "--directory":
		return true
	}

	return false
}

// uptime counts the process age as the difference between the system uptime and
// the process start moment. Absolute time does not fit: the router has no real-time
// clock, and after power-on it jumps on NTP synchronization.
func (c *Client) uptime(pid int) time.Duration {
	if pid <= 0 {
		return 0
	}

	booted, err := c.systemUptime()
	if err != nil {
		return 0
	}

	started, err := c.processStart(pid)
	if err != nil || started > booted {
		return 0
	}

	return booted - started
}

func (c *Client) systemUptime() (time.Duration, error) {
	raw, err := os.ReadFile(c.procDir + "/uptime")
	if err != nil {
		return 0, err
	}

	seconds, _, _ := strings.Cut(strings.TrimSpace(string(raw)), " ")

	value, err := strconv.ParseFloat(seconds, 64)
	if err != nil {
		return 0, err
	}

	return time.Duration(value * float64(time.Second)), nil
}

// processStart extracts the starttime field from /proc/<pid>/stat, the process start
// moment in ticks since system boot.
func (c *Client) processStart(pid int) (time.Duration, error) {
	raw, err := os.ReadFile(c.procDir + "/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return 0, err
	}

	// The process name is in brackets and may contain both spaces and brackets themselves,
	// so fields are counted from the last closing bracket, not from the first
	// and not from the start of the line.
	end := strings.LastIndex(string(raw), ")")
	if end < 0 {
		return 0, fmt.Errorf("unexpected stat format for pid %d", pid)
	}

	fields := strings.Fields(string(raw)[end+1:])

	// starttime is the 22nd field of the whole line, that is the 20th after the state.
	const startTimeField = 19
	if len(fields) <= startTimeField {
		return 0, fmt.Errorf("no starttime field in stat for pid %d", pid)
	}

	ticks, err := strconv.ParseInt(fields[startTimeField], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse starttime for pid %d: %w", pid, err)
	}

	// USER_HZ on aarch64 and other common architectures equals 100;
	// the value cannot be learned from Go without cgo, and sysconf would pull in a dependency.
	// On a system with another USER_HZ the age comes out shifted by a factor.
	const userHZ = 100

	return time.Duration(ticks) * time.Second / userHZ, nil
}
