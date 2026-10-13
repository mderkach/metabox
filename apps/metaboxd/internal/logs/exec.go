package logs

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"time"
)

// waitDelay is how long to wait for logread that did not exit after a signal or
// left the pipes open: without it a hung process holds the stream goroutine.
const waitDelay = 2 * time.Second

// Exec is the production Start on top of os/exec. The output is not accumulated in a buffer, unlike
// singbox.Exec: that one keeps the start of the output, while the log tail needs the end, and
// the logread -f stream does not end at all.
func Exec(ctx context.Context, name string, args ...string) (io.ReadCloser, error) {
	ctx, cancel := context.WithCancel(ctx)

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.WaitDelay = waitDelay

	out, err := cmd.StdoutPipe()
	if err != nil {
		cancel()

		return nil, fmt.Errorf("stdout %s: %w", name, err)
	}

	if err := cmd.Start(); err != nil {
		cancel()

		return nil, fmt.Errorf("запуск %s: %w", name, err)
	}

	return &process{ReadCloser: out, cmd: cmd, cancel: cancel}, nil
}

type process struct {
	io.ReadCloser
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

// Close waits for the process; stopping a live one is the job of the launch context. A cancel before
// the wait does not fit: a process that exited on its own but is not yet reaped would get
// a signal, and Wait would return the cancellation instead of its exit code.
func (p *process) Close() error {
	defer p.cancel()

	return p.cmd.Wait()
}
