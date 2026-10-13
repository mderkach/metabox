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

// Environment variables of the stub process. Real binaries like /bin/false
// may be absent on different systems, so Exec is checked on the test
// binary itself, restarted in helper mode.
const (
	helperEnv    = "METABOX_HELPER"
	helperStdout = "METABOX_HELPER_STDOUT"
	helperStderr = "METABOX_HELPER_STDERR"
	helperCode   = "METABOX_HELPER_CODE"
	helperSleep  = "METABOX_HELPER_SLEEP"
	helperRepeat = "METABOX_HELPER_REPEAT"
)

// TestHelperProcess is not a check but a stub process: the test restarts its
// own binary with this filter and controls it through the environment.
func TestHelperProcess(t *testing.T) {
	if os.Getenv(helperEnv) != "1" {
		t.Skip("starts only as a stub process")
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
		t.Fatalf("start: %v", err)
	}

	if res.Stdout != "это stdout" {
		t.Errorf("stdout %q", res.Stdout)
	}
	if res.Stderr != "это stderr" {
		t.Errorf("stderr %q", res.Stderr)
	}
	if res.ExitCode != 0 {
		t.Errorf("code %d, expected 0", res.ExitCode)
	}
}

// A non-zero exit code is the command verdict, not a launch failure: there must be no error,
// the code must arrive in Result.
func TestExecReportsExitCode(t *testing.T) {
	t.Setenv(helperStderr, "конфиг не разобран")
	t.Setenv(helperCode, "7")

	res, err := runHelper(t, time.Minute)
	if err != nil {
		t.Fatalf("a non-zero code was passed off as a start failure: %v", err)
	}
	if res.ExitCode != 7 {
		t.Errorf("code %d, expected 7", res.ExitCode)
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
		t.Fatalf("start: %v", err)
	}

	if len(res.Stdout) > maxOutput+len(cutMark) {
		t.Errorf("output %d bytes, ceiling %d", len(res.Stdout), maxOutput+len(cutMark))
	}
	if !strings.HasSuffix(res.Stdout, cutMark) {
		t.Error("truncation is not marked in the output")
	}
}

// A process killed by timeout also returns *exec.ExitError; it must not
// be taken for a binary verdict.
func TestExecTimesOut(t *testing.T) {
	t.Setenv(helperSleep, "30s")
	t.Setenv(helperCode, "0")

	res, err := runHelper(t, 100*time.Millisecond)

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v, expected context.DeadlineExceeded", err)
	}
	if res.ExitCode != 0 {
		t.Errorf("code %d: a process that timed out cannot have a verdict", res.ExitCode)
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
		t.Errorf("got %v, expected context.Canceled", err)
	}
}

func TestExecReportsMissingBinary(t *testing.T) {
	res, err := NewExec(time.Minute).Run(t.Context(), "/нет/такого/бинаря", "check")

	if err == nil {
		t.Fatal("a missing binary gave no error")
	}
	if res.ExitCode != 0 {
		t.Errorf("code %d: the command did not start", res.ExitCode)
	}
}

func TestLimitWriterReportsFullWrite(t *testing.T) {
	w := &limitWriter{limit: 4}

	n, err := w.Write([]byte("длиннее лимита"))
	if err != nil {
		t.Fatalf("write: %v", err)
	}
	if n != len("длиннее лимита") {
		t.Errorf("reported %d bytes of %d: the process will get EPIPE", n, len("longer than the limit"))
	}
	if !strings.HasSuffix(w.String(), cutMark) {
		t.Error("truncation not marked")
	}
}
