package singbox_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"metabox/internal/singbox"
)

const (
	binary     = "/usr/bin/sing-box"
	initScript = "/etc/init.d/sing-box"
)

type fakeRunner struct {
	result singbox.Result
	err    error
	calls  [][]string
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (singbox.Result, error) {
	f.calls = append(f.calls, append([]string{name}, args...))

	return f.result, f.err
}

func newClient(t *testing.T, runner singbox.Runner) *singbox.Client {
	t.Helper()

	client, err := singbox.New(runner, binary, initScript)
	if err != nil {
		t.Fatalf("сборка клиента: %v", err)
	}

	return client
}

func TestNewRejectsRelativePaths(t *testing.T) {
	tests := []struct {
		name       string
		binary     string
		initScript string
	}{
		{"относительный бинарь", "sing-box", initScript},
		{"относительный init-скрипт", binary, "init.d/sing-box"},
		{"пустой путь", "", initScript},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := singbox.New(&fakeRunner{}, tt.binary, tt.initScript); err == nil {
				t.Error("путь принят: под procd PATH не тот, что в шелле")
			}
		})
	}
}

// Проверяется каталог-кандидат, а не отдельный файл: сервис поднимется на
// слиянии всех .json каталога.
func TestCheckValidatesDirectory(t *testing.T) {
	runner := &fakeRunner{}

	if err := newClient(t, runner).Check(t.Context(), "/tmp/candidate"); err != nil {
		t.Fatalf("проверка: %v", err)
	}

	want := []string{binary, "check", "-C", "/tmp/candidate"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("вызвано %v, ожидали %v", runner.calls, want)
	}
}

func TestCheckReturnsBinaryOutputVerbatim(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{
		Stdout:   "разбор конфига",
		Stderr:   "FATAL[0000] decode config at 12: unknown outbound type",
		ExitCode: 1,
	}}

	err := newClient(t, runner).Check(t.Context(), "/tmp/candidate")

	checkErr, ok := errors.AsType[*singbox.CheckError](err)
	if !ok {
		t.Fatalf("получили %v, ожидали *CheckError", err)
	}
	if checkErr.ExitCode != 1 {
		t.Errorf("код %d, ожидали 1", checkErr.ExitCode)
	}
	if checkErr.Stdout != runner.result.Stdout || checkErr.Stderr != runner.result.Stderr {
		t.Errorf("вывод изменён: %+v", checkErr)
	}
}

func TestCheckWrapsLaunchFailure(t *testing.T) {
	launch := errors.New("executable file not found")
	runner := &fakeRunner{err: launch}

	err := newClient(t, runner).Check(t.Context(), "/tmp/candidate")

	if !errors.Is(err, launch) {
		t.Errorf("получили %v, ожидали обёртку над ошибкой запуска", err)
	}
	if _, ok := errors.AsType[*singbox.CheckError](err); ok {
		t.Error("отказ запуска выдан за вердикт бинаря")
	}
}

func TestVersionReadsFirstLine(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{
		Stdout: "sing-box version 1.14.0-extended-2.7.1\n\nEnvironment: go1.26.6 linux/arm64\nTags: with_quic\n",
	}}

	got, err := newClient(t, runner).Version(t.Context())
	if err != nil {
		t.Fatalf("версия: %v", err)
	}

	if got != "1.14.0-extended-2.7.1" {
		t.Errorf("версия %q, ожидали 1.14.0-extended-2.7.1", got)
	}

	want := []string{binary, "version"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("вызовы %v, ожидали один %v", runner.calls, want)
	}
}

// Панель должна работать и при сломанном sing-box (NFR-1), поэтому неудача
// возвращается ошибкой, а не пустой версией, которую вызывающий примет за
// прочитанную.
func TestVersionFails(t *testing.T) {
	tests := []struct {
		name   string
		result singbox.Result
	}{
		{"ненулевой код", singbox.Result{Stderr: "not found", ExitCode: 1}},
		{"вывод не разобран", singbox.Result{Stdout: "какой-то мусор\n"}},
		{"пустой вывод", singbox.Result{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := newClient(t, &fakeRunner{result: tt.result}).Version(t.Context()); err == nil {
				t.Error("версия принята")
			}
		})
	}
}

func TestRestartUsesInitScript(t *testing.T) {
	runner := &fakeRunner{}

	if err := newClient(t, runner).Restart(t.Context()); err != nil {
		t.Fatalf("рестарт: %v", err)
	}

	want := []string{initScript, "restart"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("вызвано %v, ожидали %v: сервисом владеет procd", runner.calls, want)
	}
}

func TestRestartFails(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{ExitCode: 1, Stderr: "no such service\nподробности"}}

	if err := newClient(t, runner).Restart(t.Context()); err == nil {
		t.Error("ненулевой код рестарта принят за успех")
	}
}

func TestRunning(t *testing.T) {
	tests := []struct {
		name     string
		exitCode int
		want     bool
	}{
		{"сервис поднят", 0, true},
		{"сервис лежит", 1, false},
		{"init-скрипт вернул другой код", 3, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := &fakeRunner{result: singbox.Result{ExitCode: tt.exitCode}}

			got, err := newClient(t, runner).Running(t.Context())
			if err != nil {
				t.Fatalf("состояние сервиса: %v", err)
			}
			if got != tt.want {
				t.Errorf("получили %v, ожидали %v: лежащий сервис — не отказ", got, tt.want)
			}
		})
	}
}
