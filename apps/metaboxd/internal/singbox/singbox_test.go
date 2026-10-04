package singbox_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"metabox/internal/procd"
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

	client, err := singbox.New(runner, binary, initScript, "", nil)
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
			if _, err := singbox.New(&fakeRunner{}, tt.binary, tt.initScript, "", nil); err == nil {
				t.Error("путь принят: под procd PATH не тот, что в шелле")
			}
		})
	}
}

// Проверяется каталог-кандидат, а не отдельный файл: сервис поднимется на
// слиянии всех .json каталога. -D — та же база относительных путей, что у
// службы.
func TestCheckValidatesDirectory(t *testing.T) {
	runner := &fakeRunner{}

	if err := newClient(t, runner).Check(t.Context(), "/tmp/candidate"); err != nil {
		t.Fatalf("проверка: %v", err)
	}

	want := []string{binary, "check", "-D", "/tmp/candidate", "-C", "/tmp/candidate"}
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

func TestBuildReadsVersionAndTags(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{
		Stdout: "sing-box version 1.14.0-extended-2.7.1\n\nEnvironment: go1.26.6 linux/arm64\nTags: with_quic, with_utls\nCGO: disabled\n",
	}}

	got, err := newClient(t, runner).Build(t.Context())
	if err != nil {
		t.Fatalf("версия: %v", err)
	}

	if got.Version != "1.14.0-extended-2.7.1" {
		t.Errorf("версия %q, ожидали 1.14.0-extended-2.7.1", got.Version)
	}
	if !slices.Equal(got.Tags, []string{"with_quic", "with_utls"}) {
		t.Errorf("теги %v, ожидали [with_quic with_utls]", got.Tags)
	}

	want := []string{binary, "version"}
	if len(runner.calls) != 1 || !slices.Equal(runner.calls[0], want) {
		t.Errorf("вызовы %v, ожидали один %v", runner.calls, want)
	}
}

// Вывод бинаря с устройства, 2026-09-23: строка окружения несёт свои флаги
// через дефис, а тегов — полтора десятка.
func TestBuildReadsDeviceOutput(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{Stdout: "sing-box version 1.14.0-extended-2.7.1\n\n" +
		"Environment: go1.26.6-X:nodwarf5 linux/arm64\n" +
		"Tags: with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale," +
		"with_masque,with_mtproxy,with_trusttunnel,with_call,with_sudoku,with_manager,with_admin_panel," +
		"with_profiler,badlinkname,tfogo_checklinkname0\n" +
		"Revision: 217f77643f19e915ea38ba2a9ac7e28e22a0cec5\nCGO: disabled\n"}}

	got, err := newClient(t, runner).Build(t.Context())
	if err != nil {
		t.Fatalf("версия: %v", err)
	}

	if len(got.Tags) != 18 || !slices.Contains(got.Tags, "with_quic") || slices.Contains(got.Tags, "with_ccm") {
		t.Errorf("теги %v: ожидали 18, с with_quic и без with_ccm", got.Tags)
	}
}

// sing-box не печатает строку `Tags:` для сборки без тегов, и это знание
// «тегов нет», а не «теги неизвестны».
func TestBuildWithoutTags(t *testing.T) {
	runner := &fakeRunner{result: singbox.Result{Stdout: "sing-box version 1.14.0\n\nEnvironment: go1.26.6 linux/arm64\n"}}

	got, err := newClient(t, runner).Build(t.Context())
	if err != nil {
		t.Fatalf("версия: %v", err)
	}

	if got.Tags == nil || len(got.Tags) != 0 {
		t.Errorf("теги %#v, ожидали пустой список", got.Tags)
	}
}

// Панель должна работать и при сломанном sing-box, поэтому неудача
// возвращается ошибкой, а не пустой версией, которую вызывающий примет за
// прочитанную.
func TestBuildFails(t *testing.T) {
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
			if _, err := newClient(t, &fakeRunner{result: tt.result}).Build(t.Context()); err == nil {
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

type fakeSupervisor struct {
	state procd.State
	err   error
	names []string
}

func (f *fakeSupervisor) Service(_ context.Context, name string) (procd.State, error) {
	f.names = append(f.names, name)

	return f.state, f.err
}

// Рабочий каталог спрашивается у procd по имени init-скрипта; без менеджера
// процессов он неизвестен, и это не отказ.
func TestWorkdir(t *testing.T) {
	t.Run("каталог от procd", func(t *testing.T) {
		supervisor := &fakeSupervisor{state: procd.State{Known: true, Workdir: "/etc/sing-box"}}

		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", supervisor)
		if err != nil {
			t.Fatalf("сборка клиента: %v", err)
		}

		got, err := client.Workdir(t.Context())
		if err != nil {
			t.Fatalf("рабочий каталог: %v", err)
		}
		if got != "/etc/sing-box" {
			t.Errorf("получили %q, ожидали /etc/sing-box", got)
		}
		if !slices.Equal(supervisor.names, []string{"sing-box"}) {
			t.Errorf("procd спрошен о %v, ожидали службу sing-box", supervisor.names)
		}
	})

	t.Run("отказ procd отдаётся вызывающему", func(t *testing.T) {
		supervisor := &fakeSupervisor{err: errors.New("ubus не отвечает")}

		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", supervisor)
		if err != nil {
			t.Fatalf("сборка клиента: %v", err)
		}

		if _, err := client.Workdir(t.Context()); err == nil {
			t.Error("отказ procd проглочен")
		}
	})

	t.Run("без procd каталог неизвестен", func(t *testing.T) {
		got, err := newClient(t, &fakeRunner{}).Workdir(t.Context())
		if err != nil || got != "" {
			t.Errorf("получили %q, %v; ожидали пустой каталог без ошибки", got, err)
		}
	})
}

// pid берётся у procd под именем init-скрипта: по его смене применение узнаёт,
// что после рестарта отвечает уже новый процесс.
func TestPIDReadsSupervisor(t *testing.T) {
	supervisor := &fakeSupervisor{state: procd.State{Known: true, Running: true, PID: 4242}}

	client, err := singbox.New(&fakeRunner{}, binary, initScript, "", supervisor)
	if err != nil {
		t.Fatalf("сборка клиента: %v", err)
	}

	pid, err := client.PID(t.Context())
	if err != nil {
		t.Fatalf("pid службы: %v", err)
	}
	if pid != 4242 {
		t.Errorf("pid %d, ожидали 4242", pid)
	}
	if !slices.Equal(supervisor.names, []string{"sing-box"}) {
		t.Errorf("procd спрошен о %v, ожидали службу init-скрипта", supervisor.names)
	}
}

func TestPIDFails(t *testing.T) {
	t.Run("без менеджера процессов", func(t *testing.T) {
		if _, err := newClient(t, &fakeRunner{}).PID(t.Context()); !errors.Is(err, singbox.ErrNoSupervisor) {
			t.Errorf("получили %v, ожидали ErrNoSupervisor", err)
		}
	})

	t.Run("procd не ответил", func(t *testing.T) {
		client, err := singbox.New(&fakeRunner{}, binary, initScript, "", &fakeSupervisor{err: errors.New("ubus молчит")})
		if err != nil {
			t.Fatalf("сборка клиента: %v", err)
		}

		if _, err := client.PID(t.Context()); err == nil {
			t.Error("отказ procd не сообщён")
		}
	})
}
