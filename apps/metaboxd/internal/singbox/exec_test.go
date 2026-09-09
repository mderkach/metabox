package singbox

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Переменные окружения подставного процесса. Настоящих бинарей вроде /bin/false
// на разных системах может не оказаться, поэтому Exec проверяется на самом
// тестовом бинаре, перезапущенном в режиме помощника.
const (
	helperEnv    = "METABOX_HELPER"
	helperStdout = "METABOX_HELPER_STDOUT"
	helperStderr = "METABOX_HELPER_STDERR"
	helperCode   = "METABOX_HELPER_CODE"
	helperSleep  = "METABOX_HELPER_SLEEP"
	helperRepeat = "METABOX_HELPER_REPEAT"
)

// TestHelperProcess — не проверка, а подставной процесс: тест перезапускает
// собственный бинарь с этим фильтром и управляет им через окружение.
func TestHelperProcess(t *testing.T) {
	if os.Getenv(helperEnv) != "1" {
		t.Skip("запускается только как подставной процесс")
	}

	if d, err := time.ParseDuration(os.Getenv(helperSleep)); err == nil {
		time.Sleep(d)
	}

	repeat := 1
	if n, err := strconv.Atoi(os.Getenv(helperRepeat)); err == nil {
		repeat = n
	}

	_, _ = fmt.Fprint(os.Stdout, strings.Repeat(os.Getenv(helperStdout), repeat))
	_, _ = fmt.Fprint(os.Stderr, strings.Repeat(os.Getenv(helperStderr), repeat))

	code, _ := strconv.Atoi(os.Getenv(helperCode))
	os.Exit(code)
}

func runHelper(t *testing.T, timeout time.Duration) (Result, error) {
	t.Helper()

	t.Setenv(helperEnv, "1")

	return NewExec(timeout).Run(t.Context(), os.Args[0], "-test.run=^TestHelperProcess$")
}

func TestExecCollectsStreamsSeparately(t *testing.T) {
	t.Setenv(helperStdout, "это stdout")
	t.Setenv(helperStderr, "это stderr")
	t.Setenv(helperCode, "0")

	res, err := runHelper(t, time.Minute)
	if err != nil {
		t.Fatalf("запуск: %v", err)
	}

	if res.Stdout != "это stdout" {
		t.Errorf("stdout %q", res.Stdout)
	}
	if res.Stderr != "это stderr" {
		t.Errorf("stderr %q", res.Stderr)
	}
	if res.ExitCode != 0 {
		t.Errorf("код %d, ожидали 0", res.ExitCode)
	}
}

// Ненулевой код возврата — вердикт команды, а не отказ запуска: ошибки быть не
// должно, код обязан приехать в Result.
func TestExecReportsExitCode(t *testing.T) {
	t.Setenv(helperStderr, "конфиг не разобран")
	t.Setenv(helperCode, "7")

	res, err := runHelper(t, time.Minute)
	if err != nil {
		t.Fatalf("ненулевой код выдан за отказ запуска: %v", err)
	}
	if res.ExitCode != 7 {
		t.Errorf("код %d, ожидали 7", res.ExitCode)
	}
	if res.Stderr != "конфиг не разобран" {
		t.Errorf("stderr %q", res.Stderr)
	}
}

func TestExecTruncatesLongOutput(t *testing.T) {
	t.Setenv(helperStdout, strings.Repeat("щ", 1024))
	t.Setenv(helperRepeat, "256")
	t.Setenv(helperCode, "0")

	res, err := runHelper(t, time.Minute)
	if err != nil {
		t.Fatalf("запуск: %v", err)
	}

	if len(res.Stdout) > maxOutput+len(cutMark) {
		t.Errorf("вывод %d байт, потолок %d", len(res.Stdout), maxOutput+len(cutMark))
	}
	if !strings.HasSuffix(res.Stdout, cutMark) {
		t.Error("обрезка не отмечена в выводе")
	}
}

// Убитый по таймауту процесс тоже отдаёт *exec.ExitError; вердиктом бинаря это
// быть не должно.
func TestExecTimesOut(t *testing.T) {
	t.Setenv(helperSleep, "30s")
	t.Setenv(helperCode, "0")

	res, err := runHelper(t, 100*time.Millisecond)

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("получили %v, ожидали context.DeadlineExceeded", err)
	}
	if res.ExitCode != 0 {
		t.Errorf("код %d: у отвалившегося по таймауту вердикта быть не может", res.ExitCode)
	}
}

func TestExecRespectsCancel(t *testing.T) {
	t.Setenv(helperEnv, "1")
	t.Setenv(helperSleep, "30s")

	ctx, cancel := context.WithCancel(t.Context())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	_, err := NewExec(time.Minute).Run(ctx, os.Args[0], "-test.run=^TestHelperProcess$")
	if !errors.Is(err, context.Canceled) {
		t.Errorf("получили %v, ожидали context.Canceled", err)
	}
}

func TestExecReportsMissingBinary(t *testing.T) {
	res, err := NewExec(time.Minute).Run(t.Context(), "/нет/такого/бинаря", "check")

	if err == nil {
		t.Fatal("отсутствующий бинарь не дал ошибки")
	}
	if res.ExitCode != 0 {
		t.Errorf("код %d: команда не запускалась", res.ExitCode)
	}
}

func TestLimitWriterReportsFullWrite(t *testing.T) {
	w := &limitWriter{limit: 4}

	n, err := w.Write([]byte("длиннее лимита"))
	if err != nil {
		t.Fatalf("запись: %v", err)
	}
	if n != len("длиннее лимита") {
		t.Errorf("отчитались о %d байтах из %d: процесс получит EPIPE", n, len("длиннее лимита"))
	}
	if !strings.HasSuffix(w.String(), cutMark) {
		t.Error("обрезка не отмечена")
	}
}
