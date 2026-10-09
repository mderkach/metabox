package logs

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"time"
)

// waitDelay — сколько ждать logread, который не вышел после сигнала или
// оставил открытыми трубы: без этого зависший процесс держит горутину потока.
const waitDelay = 2 * time.Second

// Exec — боевой Start поверх os/exec. Вывод не копится в буфер, как у
// singbox.Exec: тот оставляет начало вывода, а хвосту лога нужен конец, и
// поток logread -f не кончается вовсе.
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

// Close ждёт процесс; остановить живой — дело контекста запуска. Отмена до
// ожидания не годится: процесс, вышедший сам, но ещё не прибранный, получил
// бы сигнал, и Wait отдал бы отмену вместо его кода возврата.
func (p *process) Close() error {
	defer p.cancel()

	return p.cmd.Wait()
}
