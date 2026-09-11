package procd

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

const listOutput = `{
  "homeproxy": {"instances": {"proxy": {"running": true, "pid": 5810}}},
  "sing-box": {"instances": {"instance1": {"running": false, "pid": 0}}},
  "dnsmasq": {"instances": {"cfg01": {"running": true, "pid": 1234}}}
}`

func runnerWith(stdout string, code int, err error) Runner {
	return func(context.Context, string, ...string) (string, int, error) {
		return stdout, code, err
	}
}

func TestServiceReadsState(t *testing.T) {
	tests := []struct {
		name        string
		service     string
		wantKnown   bool
		wantRunning bool
		wantPID     int
	}{
		{"служба поднята", "homeproxy", true, true, 5810},
		{"служба известна, но не работает", "sing-box", true, false, 0},
		{"служба procd незнакома", "b4", false, false, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := New(runnerWith(listOutput, 0, nil), "/bin/ubus")

			got, err := client.Service(t.Context(), tt.service)
			if err != nil {
				t.Fatalf("опрос службы: %v", err)
			}

			if got.Known != tt.wantKnown {
				t.Errorf("известность: получили %v, ожидали %v", got.Known, tt.wantKnown)
			}

			if got.Running != tt.wantRunning {
				t.Errorf("работает: получили %v, ожидали %v", got.Running, tt.wantRunning)
			}

			if got.PID != tt.wantPID {
				t.Errorf("pid: получили %d, ожидали %d", got.PID, tt.wantPID)
			}
		})
	}
}

func TestServiceReportsFailures(t *testing.T) {
	tests := []struct {
		name   string
		runner Runner
	}{
		{"ubus не запустился", runnerWith("", 0, errors.New("нет такой команды"))},
		{"ubus вернул ошибку", runnerWith("", 1, nil)},
		{"ответ не разбирается", runnerWith("не json", 0, nil)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := New(tt.runner, "/bin/ubus")

			if _, err := client.Service(t.Context(), "homeproxy"); err == nil {
				t.Error("отказ не сообщён")
			}
		})
	}
}

// Возраст считается от загрузки системы: часов реального времени у роутера
// нет, и абсолютное время прыгает при синхронизации NTP.
func TestUptimeFromProc(t *testing.T) {
	const (
		pid         = 4242
		bootSeconds = 10_000.0
		startTicks  = 400_000
		userHZ      = 100
	)

	dir := t.TempDir()
	writeProcFile(t, dir, "uptime", strconv.FormatFloat(bootSeconds, 'f', 2, 64)+" 9000.00\n")
	// Имя процесса в скобках содержит пробел: поля считаются от скобки.
	writeProcFile(t, filepath.Join(dir, strconv.Itoa(pid)), "stat", procStat(startTicks))

	client := New(runnerWith(procList(pid), 0, nil), "/bin/ubus")
	client.procDir = dir

	got, err := client.Service(t.Context(), "homeproxy")
	if err != nil {
		t.Fatalf("опрос службы: %v", err)
	}

	want := time.Duration(bootSeconds)*time.Second - startTicks*time.Second/userHZ
	if got.Uptime != want {
		t.Errorf("возраст: получили %v, ожидали %v", got.Uptime, want)
	}
}

// Недоступный /proc возраст обнуляет, но состояние службы остаётся верным:
// панель обязана открыться и без него (NFR-1).
func TestUptimeUnavailable(t *testing.T) {
	client := New(runnerWith(procList(4242), 0, nil), "/bin/ubus")
	client.procDir = filepath.Join(t.TempDir(), "нет-такого")

	got, err := client.Service(t.Context(), "homeproxy")
	if err != nil {
		t.Fatalf("опрос службы: %v", err)
	}

	if !got.Running {
		t.Error("служба должна считаться поднятой")
	}

	if got.Uptime != 0 {
		t.Errorf("возраст: получили %v, ожидали 0", got.Uptime)
	}
}

func procList(pid int) string {
	return `{"homeproxy": {"instances": {"proxy": {"running": true, "pid": ` + strconv.Itoa(pid) + `}}}}`
}

func procStat(startTicks int) string {
	// Поля 1-9 записаны явно, дальше нули до 21-го: starttime идёт 22-м.
	stat := "4242 (sing box) S 1 4242 4242 0 -1 4194560"
	for range 12 {
		stat += " 0"
	}

	return stat + " " + strconv.Itoa(startTicks) + " 0 0\n"
}

func writeProcFile(t *testing.T, dir, name, content string) {
	t.Helper()

	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("создание %s: %v", dir, err)
	}

	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
		t.Fatalf("запись %s: %v", name, err)
	}
}
