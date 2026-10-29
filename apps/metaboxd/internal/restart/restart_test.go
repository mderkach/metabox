package restart

import (
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func discard() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestRestartLaunchesInitScript(t *testing.T) {
	var got []string

	d, err := New("/etc/init.d/metaboxd", func(_ func(error), name string, args ...string) error {
		got = append([]string{name}, args...)

		return nil
	}, discard())
	if err != nil {
		t.Fatal(err)
	}

	if err := d.Restart(t.Context()); err != nil {
		t.Fatalf("restart: %v", err)
	}

	if want := []string{"/etc/init.d/metaboxd", "restart"}; !slices.Equal(got, want) {
		t.Errorf("launched %v, want %v", got, want)
	}
}

// A second tab asking while the script runs joins it; once the script has exited and the
// daemon is still alive, a new request launches it again.
func TestRestartJoinsRunningScript(t *testing.T) {
	launches := 0

	var done func(error)

	d, err := New("/etc/init.d/metaboxd", func(exit func(error), _ string, _ ...string) error {
		launches++
		done = exit

		return nil
	}, discard())
	if err != nil {
		t.Fatal(err)
	}

	for range 2 {
		if err := d.Restart(t.Context()); err != nil {
			t.Fatalf("restart: %v", err)
		}
	}

	if launches != 1 {
		t.Fatalf("launches while the script runs: got %d, want 1", launches)
	}

	done(errors.New("exit status 1"))

	if err := d.Restart(t.Context()); err != nil {
		t.Fatalf("restart after the script exited: %v", err)
	}

	if launches != 2 {
		t.Errorf("launches after the script exited: got %d, want 2", launches)
	}
}

func TestRestartReportsLaunchFailure(t *testing.T) {
	launchErr := errors.New("no such file")
	launches := 0

	d, err := New("/etc/init.d/metaboxd", func(func(error), string, ...string) error {
		launches++

		return launchErr
	}, discard())
	if err != nil {
		t.Fatal(err)
	}

	if err := d.Restart(t.Context()); !errors.Is(err, launchErr) {
		t.Errorf("error %v does not wrap the launch failure", err)
	}

	// A launch that did not start leaves nothing to join.
	_ = d.Restart(t.Context())

	if launches != 2 {
		t.Errorf("launches after a failed launch: got %d, want 2", launches)
	}
}

func TestNewRejectsRelativeScript(t *testing.T) {
	if _, err := New("init.d/metaboxd", func(func(error), string, ...string) error { return nil }, discard()); err == nil {
		t.Error("a relative init script path was accepted")
	}
}

// The real launcher returns before the command finishes and puts it into its own session:
// procd stopping the daemon must not take the restarting script with it.
func TestDetachedRunsInOwnSession(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "pid")
	script := filepath.Join(dir, "init")

	// The script reports its pid and stays alive long enough for its session to be read.
	body := "#!/bin/sh\necho $$ > " + out + ".tmp && mv " + out + ".tmp " + out + "\nsleep 2\n"
	if err := os.WriteFile(script, []byte(body), 0o700); err != nil {
		t.Fatal(err)
	}

	started := time.Now()

	if err := detached(func(error) {}, script, "restart"); err != nil {
		t.Fatalf("launch: %v", err)
	}

	if time.Since(started) > time.Second {
		t.Fatal("the launcher waited for the command to finish")
	}

	// A real process outside synctest: bounded polling.
	deadline := time.Now().Add(5 * time.Second)

	var data []byte

	for {
		var err error
		if data, err = os.ReadFile(out); err == nil {
			break
		}

		if time.Now().After(deadline) {
			t.Fatal("the launched script did not run")
		}

		time.Sleep(20 * time.Millisecond)
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatalf("script pid %q: %v", data, err)
	}

	// A new session makes the script the leader of a new process group: Getpgid is in the
	// syscall package on Linux and macOS alike, Getsid is not.
	group, err := syscall.Getpgid(pid)
	if err != nil {
		t.Fatalf("process group of the script: %v", err)
	}

	if group != pid || group == syscall.Getpgrp() {
		t.Errorf("script %d runs in process group %d, the test in %d: want a group of its own", pid, group, syscall.Getpgrp())
	}
}
