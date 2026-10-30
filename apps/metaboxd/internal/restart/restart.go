// Package restart restarts the daemon's own service through its init script.
//
// The script stops the very process that launches it, so the launch is detached: the script
// runs in its own session and is not waited for by the request that asked for it.
package restart

import (
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"syscall"
)

// Launcher starts a command detached from the daemon and returns once it is started, not
// when it finishes; done receives the exit result if the daemon outlives the command.
// Replaced in tests: a real restart stops the test process.
type Launcher func(done func(error), name string, args ...string) error

// Daemon restarts the daemon's service.
type Daemon struct {
	script string
	launch Launcher
	log    *slog.Logger
	// running is set while a launched script has not exited: a second request, from another
	// tab, joins it instead of starting the script again.
	running atomic.Bool
}

// New assembles the restart through the init script at script. The path must be absolute
// for the same reason as the sing-box paths: under procd PATH is not the interactive one.
// launch is nil on the device, a fake in tests.
func New(script string, launch Launcher, log *slog.Logger) (*Daemon, error) {
	if !filepath.IsAbs(script) {
		return nil, fmt.Errorf("path %q is not absolute", script)
	}

	if launch == nil {
		launch = detached
	}

	return &Daemon{script: script, launch: launch, log: log}, nil
}

// Restart launches `<script> restart` and returns as soon as it is started. The script
// stops this process; the caller has until then to answer, and the HTTP server's graceful
// shutdown lets an answer in progress finish.
func (d *Daemon) Restart(context.Context) error {
	if !d.running.CompareAndSwap(false, true) {
		return nil
	}

	if err := d.launch(d.exited, d.script, "restart"); err != nil {
		d.running.Store(false)

		return fmt.Errorf("launch %s restart: %w", d.script, err)
	}

	return nil
}

// exited is reached only when the script ends and this process is still alive: on success
// procd stops the daemon first.
func (d *Daemon) exited(err error) {
	d.running.Store(false)

	if err != nil {
		d.log.Error("daemon restart", "err", err)
	}
}

// detached starts the command in its own session: procd stopping the daemon must not reach
// the script that restarts it. The command is not bound to a request context for the same
// reason. Its exit is waited for only to report it.
func detached(done func(error), name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		return err
	}

	go func() {
		done(cmd.Wait())
	}()

	return nil
}
