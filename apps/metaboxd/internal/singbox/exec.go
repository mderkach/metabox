package singbox

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"time"
)

const (
	// Ограничение вывода на поток: битый конфиг даёт мегабайты диагностики, а
	// пользователю нужно её начало. Без ограничения один вызов забирает
	// столько памяти, сколько напечатал процесс.
	maxOutput = 64 << 10

	// Сколько ждать процесс, который не вышел после сигнала или оставил
	// открытыми трубы. Без этого зависший sing-box держит горутину бессрочно.
	waitDelay = 5 * time.Second

	cutMark = "\n…вывод обрезан"
)

// Exec — боевой Runner поверх os/exec.
type Exec struct {
	timeout time.Duration
}

// NewExec задаёт потолок времени на один вызов бинаря.
func NewExec(timeout time.Duration) *Exec {
	return &Exec{timeout: timeout}
}

// Run запускает команду аргументами списком — никогда строкой для шелла:
// `sh -c` с подстановкой пути превращает имя файла в исполняемый код.
func (e *Exec) Run(ctx context.Context, name string, args ...string) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.WaitDelay = waitDelay

	stdout := &limitWriter{limit: maxOutput}
	stderr := &limitWriter{limit: maxOutput}
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	err := cmd.Run()
	res := Result{Stdout: stdout.String(), Stderr: stderr.String()}

	// Отмена и таймаут проверяются до разбора кода возврата: убитый по
	// сигналу процесс тоже отдаёт *exec.ExitError, и код -1 выглядел бы как
	// вердикт бинаря.
	if ctxErr := ctx.Err(); ctxErr != nil {
		return res, fmt.Errorf("запуск %s: %w", name, ctxErr)
	}

	if err == nil {
		return res, nil
	}

	if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
		res.ExitCode = exitErr.ExitCode()

		return res, nil
	}

	return res, fmt.Errorf("запуск %s: %w", name, err)
}

// limitWriter копит не больше limit байт и всегда рапортует полную запись:
// вернуть меньше значило бы уронить процесс на EPIPE из-за нашего лимита.
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
