package singbox

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"
)

const (
	// Output limit per stream: a broken config gives megabytes of diagnostics, and
	// the user needs its start. Without the limit one call takes
	// as much memory as the process printed.
	maxOutput = 64 << 10

	// How long to wait for a process that did not exit after a signal or left
	// the pipes open. Without this a hung sing-box holds the goroutine indefinitely.
	waitDelay = 5 * time.Second

	cutMark = "\n…output truncated"
)

// Exec is the production Runner on top of os/exec.
type Exec struct {
	timeout time.Duration
}

// NewExec sets the time ceiling for one binary call.
func NewExec(timeout time.Duration) *Exec {
	return &Exec{timeout: timeout}
}

// Run starts a command with arguments as a list, never as a string for the shell:
// `sh -c` with path substitution turns a file name into executable code.
func (e *Exec) Run(ctx context.Context, name string, args ...string) (Result, error) {
	return e.run(ctx, nil, name, args...)
}

// RunInput is the same as Run, with input on stdin: this is how `uci batch` gets
// its commands in one call.
func (e *Exec) RunInput(ctx context.Context, input, name string, args ...string) (Result, error) {
	return e.run(ctx, strings.NewReader(input), name, args...)
}

// Command is Run in the form of the runner types its consumers declare (procd, dataplane,
// devices): they cannot take Result, since singbox imports procd.
func (e *Exec) Command(ctx context.Context, name string, args ...string) (string, int, error) {
	res, err := e.Run(ctx, name, args...)

	return res.Stdout, res.ExitCode, err
}

// CommandInput is Command with input on stdin, in the form of dataplane.BatchRunner.
func (e *Exec) CommandInput(ctx context.Context, input, name string, args ...string) (string, int, error) {
	res, err := e.RunInput(ctx, input, name, args...)

	return res.Stdout, res.ExitCode, err
}

func (e *Exec) run(ctx context.Context, stdin io.Reader, name string, args ...string) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.WaitDelay = waitDelay
	cmd.Stdin = stdin

	stdout := &limitWriter{limit: maxOutput}
	stderr := &limitWriter{limit: maxOutput}
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	err := cmd.Run()
	res := Result{Stdout: stdout.String(), Stderr: stderr.String()}

	// Cancellation and timeout are checked before parsing the exit code: a process killed
	// by a signal also returns *exec.ExitError, and code -1 would look like
	// a binary verdict.
	if ctxErr := ctx.Err(); ctxErr != nil {
		return res, fmt.Errorf("start %s: %w", name, ctxErr)
	}

	if err == nil {
		return res, nil
	}

	if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
		res.ExitCode = exitErr.ExitCode()

		return res, nil
	}

	return res, fmt.Errorf("start %s: %w", name, err)
}

// limitWriter accumulates no more than limit bytes and always reports a full write:
// returning less would crash the process on EPIPE because of our limit.
type limitWriter struct {
	buf   bytes.Buffer
	limit int
	cut   bool
}

func (w *limitWriter) Write(p []byte) (int, error) {
	room := w.limit - w.buf.Len()

	switch {
	case room <= 0:
		w.cut = true
	case len(p) > room:
		w.buf.Write(p[:room])
		w.cut = true
	default:
		w.buf.Write(p)
	}

	return len(p), nil
}

func (w *limitWriter) String() string {
	if w.cut {
		return w.buf.String() + cutMark
	}

	return w.buf.String()
}
