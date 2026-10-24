// Package singbox calls the sing-box binary and manages its service through
// procd. The package does not parse the config content: the only arbiter of
// validity is the binary itself.
package singbox

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"metabox/internal/procd"
)

// Result is the outcome of running a command. A non-zero ExitCode is a result, not a launch
// failure: the caller decides.
type Result struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// Runner runs an external command. Replaced in tests; the real sing-box
// and procd are checked by integration tests on the test bench.
type Runner interface {
	Run(ctx context.Context, name string, args ...string) (Result, error)
}

// CheckError carries the binary output verbatim: the user fixes the config by it,
// and these lines must not be reworded.
type CheckError struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

func (e *CheckError) Error() string {
	return fmt.Sprintf("sing-box check: exit code %d", e.ExitCode)
}

// Client is the daemon access to sing-box: config check and service control.
type Client struct {
	supervisor Supervisor
	runner     Runner
	binary     string
	initScript string
	// instance is the procd instance in which the service holds sing-box. Empty means the
	// single service instance.
	instance string
	// logread is the device logger utility; empty means "nowhere to take the crash reason
	// from", and the service state is reduced to the fact of a failure.
	logread string
}

// New assembles the client. Paths must be absolute: under procd the PATH variable
// is not the one in the interactive shell, and a relative name will resolve to the wrong
// file or not resolve at all.
// New assembles the client. supervisor is optional: without it the state is reduced
// to the init script exit code, and the panel keeps working.
func New(runner Runner, binary, initScript, instance, logread string, supervisor Supervisor) (*Client, error) {
	for _, path := range []string{binary, initScript} {
		if !filepath.IsAbs(path) {
			return nil, fmt.Errorf("path %q is not absolute", path)
		}
	}

	if logread != "" && !filepath.IsAbs(logread) {
		return nil, fmt.Errorf("path %q is not absolute", logread)
	}

	return &Client{
		runner:     runner,
		supervisor: supervisor,
		binary:     binary,
		initScript: initScript,
		instance:   instance,
		logread:    logread,
	}, nil
}

// Check validates a candidate in the mode the service will start in: config is
// the config file (-c), an empty string is the dir directory as a whole (-C), which the service
// merges from all .json. workdir is the base of relative config paths (-D), the same
// as the service's: otherwise the check and runtime verdicts diverge.
func (c *Client) Check(ctx context.Context, dir, config, workdir string) error {
	args := []string{"check", "-D", workdir, "-C", dir}
	if config != "" {
		args = []string{"check", "-D", workdir, "-c", config}
	}

	res, err := c.runner.Run(ctx, c.binary, args...)
	if err != nil {
		return fmt.Errorf("check config: %w", err)
	}

	if res.ExitCode != 0 {
		return &CheckError{Stdout: res.Stdout, Stderr: res.Stderr, ExitCode: res.ExitCode}
	}

	return nil
}

// Build is the binary version and the build tags it is built with.
type Build struct {
	Version string
	// Tags are the tags from the `Tags:` line of the `sing-box version` output. An empty list
	// means a build without tags, not ignorance: a node type gated by a tag will not be started
	// by such a binary.
	Tags []string
}

// Build reads the version and the build composition of the binary.
//
// The value is meant for a single read at daemon start: launching a process
// on every /api/status poll is too expensive for a router, so a binary
// replaced under a running daemon gets into the panel only after
// its restart.
func (c *Client) Build(ctx context.Context) (Build, error) {
	res, err := c.runner.Run(ctx, c.binary, "version")
	if err != nil {
		return Build{}, fmt.Errorf("sing-box version: %w", err)
	}

	if res.ExitCode != 0 {
		return Build{}, fmt.Errorf("sing-box version: exit code %d, %s", res.ExitCode, firstLine(res.Stderr))
	}

	version := parseVersion(res.Stdout)
	if version == "" {
		return Build{}, fmt.Errorf("sing-box version: output %q not parsed", firstLine(res.Stdout))
	}

	return Build{Version: version, Tags: parseTags(res.Stdout)}, nil
}

// parseVersion takes the number from the first line of the form
// `sing-box version 1.14.0-extended-2.7.1`: lines about the build environment
// and tags follow.
func parseVersion(stdout string) string {
	fields := strings.Fields(firstLine(stdout))
	if len(fields) < 3 || fields[0] != "sing-box" || fields[1] != "version" {
		return ""
	}

	return fields[2]
}

// parseTags takes the tags from the `Tags: with_quic,with_utls` line. There is no line
// when the binary is built without tags: sing-box prints it only if the list
// is not empty.
func parseTags(stdout string) []string {
	tags := []string{}

	for line := range strings.Lines(stdout) {
		list, ok := strings.CutPrefix(strings.TrimSpace(line), "Tags:")
		if !ok {
			continue
		}

		for tag := range strings.SplitSeq(list, ",") {
			if tag = strings.TrimSpace(tag); tag != "" {
				tags = append(tags, tag)
			}
		}
	}

	return tags
}

// Restart restarts the service through the init script. A stopped service is
// a regular path: the script will bring it up.
func (c *Client) Restart(ctx context.Context) error {
	return c.service(ctx, "restart")
}

// Reload rereads the dataplane model from UCI. For the panel service reload
// restarts the sing-box instance and brings the dataplane to the model: fw4 and dnsmasq
// are touched only if what concerns them changed.
func (c *Client) Reload(ctx context.Context) error {
	return c.service(ctx, "reload")
}

// Start brings the service up. An already running service is a regular path: the procd
// init script does not complain about a repeated start.
func (c *Client) Start(ctx context.Context) error {
	return c.service(ctx, "start")
}

// Stop stops the service. A stopped service is not counted as an error for the same
// reason as in Start.
func (c *Client) Stop(ctx context.Context) error {
	return c.service(ctx, "stop")
}

func (c *Client) service(ctx context.Context, action string) error {
	res, err := c.runner.Run(ctx, c.initScript, action)
	if err != nil {
		return fmt.Errorf("service %s: %w", action, err)
	}

	if res.ExitCode != 0 {
		return fmt.Errorf("service %s: exit code %d, %s", action, res.ExitCode, firstLine(res.Stderr))
	}

	return nil
}

// State is the service state for the panel.
type State struct {
	Running bool
	// LastError is how the process explained its crash in the device log, and without
	// it in the log.output file. Empty when there is an explanation in neither.
	LastError string
	// Failed means procd knows the service but no instance is up:
	// it was started and it fell off. A merely stopped service procd does not
	// remember at all, so there is no other way to tell them apart.
	Failed bool
	// Uptime is the process age; zero when the source is unavailable.
	Uptime time.Duration
}

// Supervisor returns what the process manager knows about the service. The interface is
// declared here, at the consumer.
type Supervisor interface {
	Service(ctx context.Context, name, instance string) (procd.State, error)
}

// Running reports whether the service is up. A non-zero exit code means "not
// running", not a failure: the panel must work with the service down.
func (c *Client) Running(ctx context.Context) (bool, error) {
	res, err := c.running(ctx)
	if err != nil {
		return false, fmt.Errorf("service state: %w", err)
	}

	return res.ExitCode == 0, nil
}

// ErrNoSupervisor means the process manager is not attached, and there is nobody to learn the service pid
// from.
var ErrNoSupervisor = errors.New("process manager not connected")

// ErrUnknownService means procd does not know the service: the init script is not under procd or
// the service is registered under another name, and there is nowhere to learn the process pid.
var ErrUnknownService = errors.New("service not registered in procd")

// PID returns the pid of the running service process from procd; zero means no instance is
// up. By the pid change the apply tells the process after a restart from the previous one:
// the init script returns before procd replaces the process.
func (c *Client) PID(ctx context.Context) (int, error) {
	if c.supervisor == nil {
		return 0, ErrNoSupervisor
	}

	state, err := c.supervisor.Service(ctx, c.ServiceName(), c.instance)
	if err != nil {
		return 0, fmt.Errorf("service pid: %w", err)
	}

	if !state.Known {
		return 0, ErrUnknownService
	}

	return state.PID, nil
}

// State complements the init script response with procd data. The init script returns only
// the exit code, so the age and the failure flag are taken from the process
// manager; its absence does not break the response.
func (c *Client) State(ctx context.Context) (State, error) {
	running, err := c.running(ctx)
	if err != nil {
		return State{}, fmt.Errorf("service state: %w", err)
	}

	state := State{Running: running.ExitCode == 0}

	if c.supervisor == nil {
		return state, nil
	}

	supervised, err := c.supervisor.Service(ctx, c.ServiceName(), c.instance)
	if errors.Is(err, procd.ErrAmbiguousInstance) {
		// Other procd failures only impoverish the state, and this one means
		// the daemon does not know which process is its own: guessing is not allowed.
		return State{}, fmt.Errorf("service state: %w", err)
	}

	if err != nil {
		return state, nil
	}

	if state.Running {
		state.Uptime = supervised.Uptime

		return state, nil
	}

	state.Failed = supervised.Known

	if state.Failed {
		state.LastError = c.failure(ctx, supervised.Launch)
	}

	return state, nil
}

// Launch returns what procd starts the service with: the working directory and the config.
// Empty fields without an error mean nowhere to learn it: there is no process manager, the service
// is unfamiliar to it or started without flags and not running.
func (c *Client) Launch(ctx context.Context) (procd.Launch, error) {
	if c.supervisor == nil {
		return procd.Launch{}, nil
	}

	state, err := c.supervisor.Service(ctx, c.ServiceName(), c.instance)
	if err != nil {
		return procd.Launch{}, err
	}

	return state.Launch, nil
}

// running asks the init script whether the sing-box instance is up. Without an instance
// name rc.common answers for the service, and it may have other instances.
func (c *Client) running(ctx context.Context) (Result, error) {
	args := []string{"running"}
	if c.instance != "" {
		args = append(args, c.instance)
	}

	return c.runner.Run(ctx, c.initScript, args...)
}

// ServiceName derives the procd service name from the init script path: procd
// registers the service under the script name.
func (c *Client) ServiceName() string {
	return filepath.Base(c.initScript)
}

// firstLine leaves one line of the output: the error text gets the reason, not
// the whole diagnostic stream, which goes to the caller in Result.
func firstLine(s string) string {
	for i, r := range s {
		if r == '\n' {
			return s[:i]
		}
	}

	return s
}
