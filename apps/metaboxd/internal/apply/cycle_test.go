package apply_test

import (
	"bytes"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/config"
)

// Init-скрипт возвращается раньше, чем procd заменит процесс: API опрашивается
// только после того, как procd отчитался о новом pid.
func TestHealthcheckWaitsForNewProcess(t *testing.T) {
	h := newHarness(t)
	h.service.pid = 100
	h.service.lag = 2

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	calls := h.rec.snapshot()
	restart, wait := slices.Index(calls, "Restart"), slices.Index(calls, "Wait")

	if polls := countOf(calls[restart:wait], "PID"); polls != 3 {
		t.Errorf("опросов procd между рестартом и healthcheck: %d, ожидали 3 — два с прежним pid и один с новым", polls)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseAwaitingConfirm {
		t.Errorf("фаза %q, ожидали ожидание подтверждения", got)
	}
}

// Отвечает прежний процесс — procd так и не отдал новый pid. Ответ API ему не
// засчитывается: healthcheck не идёт, цикл встаёт с healthcheck_failed и
// откатывается.
func TestHealthcheckIgnoresOldProcess(t *testing.T) {
	h := newHarnessWith(t, 20*time.Millisecond, slog.New(slog.DiscardHandler))
	h.service.pid = 100
	h.service.lag = -1

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}

	tx := waitPhase(t, h, apply.PhaseRolledBack)

	if slices.Contains(h.rec.snapshot(), "Wait") {
		t.Error("API опрошен, хотя procd отдаёт прежний pid: ответ засчитан старому процессу")
	}
	if tx.ReasonCode != apply.ReasonHealthcheckFailed {
		t.Errorf("код причины %q, ожидали %q", tx.ReasonCode, apply.ReasonHealthcheckFailed)
	}
	if !strings.Contains(tx.Reason, "100") {
		t.Errorf("подробность %q не называет прежний pid", tx.Reason)
	}
}

// Без procd сверять pid не с чем: применение не останавливается, healthcheck
// идёт одним опросом API.
func TestHealthcheckWithoutProcd(t *testing.T) {
	h := newHarness(t)
	h.service.pidErr = errors.New("ubus не отвечает")

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if calls := h.rec.snapshot(); !slices.Contains(calls, "Wait") || countOf(calls, "PID") != 1 {
		t.Errorf("шаги %v, ожидали один опрос procd и healthcheck", calls)
	}
}

// Первое применение: бэкапа нет, и откат возвращать нечего. Фаза не врёт
// откатом, служба лишний раз не перезапускается.
func TestRollbackWithoutBackup(t *testing.T) {
	t.Run("окно истекло", func(t *testing.T) {
		h := newHarness(t)
		h.store.restoreErr = config.ErrNoBackup

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("применение: %v", err)
		}
		h.waitWindow(t)

		h.clock.fire()
		h.manager.Close()

		tx := h.manager.Current()
		if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
			t.Errorf("фаза %q с кодом %q, ожидали отказ с причиной no_backup", tx.Phase, tx.ReasonCode)
		}
		if tx.Reason == "" {
			t.Error("подробность пуста")
		}
		if got := countOf(h.rec.snapshot(), "Restart"); got != 1 {
			t.Errorf("рестартов %d, ожидали один — от самого применения", got)
		}
		if state, _ := h.store.ReadState(t.Context()); state != nil {
			t.Error("состояние закрытой транзакции осталось на диске")
		}

		// На диске конфиг, записанный самим демоном: следующее применение
		// не упирается ни в занятость, ни в ложную внешнюю правку.
		h.store.mu.Lock()
		h.store.sum = config.Sum(h.store.written)
		h.store.mu.Unlock()

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Errorf("применение после закрытия без бэкапа: %v", err)
		}
	})

	t.Run("шаг цикла не прошёл", func(t *testing.T) {
		h := newHarness(t)
		h.store.restoreErr = config.ErrNoBackup
		h.health.err = errors.New("порт молчит")

		if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
			t.Fatalf("применение: %v", err)
		}
		h.manager.Close()

		tx := h.manager.Current()
		if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
			t.Errorf("фаза %q с кодом %q, ожидали отказ с причиной no_backup", tx.Phase, tx.ReasonCode)
		}
		if !strings.Contains(tx.Reason, "порт молчит") {
			t.Errorf("подробность %q потеряла отказ шага", tx.Reason)
		}
		if got := countOf(h.rec.snapshot(), "Restart"); got != 1 {
			t.Errorf("рестартов %d, ожидали один — от самого применения", got)
		}
	})
}

// Бэкап не прошёл — записи ещё не было, на диске прежний конфиг. Откат по
// бэкапу прошлой транзакции потерял бы то, что работает: транзакция
// закрывается отказом без Restore и рестарта.
func TestBackupFailureSkipsRollback(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = errors.New("диск переполнен")

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonBackupFailed {
		t.Errorf("фаза %q с кодом %q, ожидали отказ с причиной backup_failed", tx.Phase, tx.ReasonCode)
	}
	if !strings.Contains(tx.Reason, "диск переполнен") {
		t.Errorf("подробность %q потеряла отказ бэкапа", tx.Reason)
	}

	calls := h.rec.snapshot()
	for _, step := range []string{"Restore", "WriteLists", "Write", "Restart"} {
		if slices.Contains(calls, step) {
			t.Errorf("после отказа бэкапа вызван %s: шаги %v", step, calls)
		}
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("состояние закрытой транзакции осталось на диске")
	}

	h.store.backupErr = nil

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Errorf("применение после отказа бэкапа: %v", err)
	}
}

// Отказ бэкапа и неубранное состояние: применение освобождается, а оставшаяся
// на диске фаза applying при следующем старте закрывается без отката — записи
// не было, и откат по бэкапу прошлой транзакции потерял бы рабочий конфиг.
func TestBackupFailureWithStateLeftReplaysWithoutRollback(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = errors.New("диск переполнен")
	h.store.clearErr = errors.New("файловая система только для чтения")

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.manager.Close()

	if tx := h.manager.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonBackupFailed {
		t.Fatalf("фаза %q с кодом %q, ожидали отказ с причиной backup_failed", tx.Phase, tx.ReasonCode)
	}

	if state, _ := h.store.ReadState(t.Context()); state == nil {
		t.Fatal("состояние убрано, хотя ClearState отказал: проверять доигрывание нечем")
	}

	// Следующая жизнь демона на том же диске.
	h.rec.mu.Lock()
	h.rec.calls = nil
	h.rec.mu.Unlock()

	h.store.backupErr = nil
	h.store.clearErr = nil
	restarted := apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler),
		apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout, ProcessInterval: time.Millisecond})
	t.Cleanup(restarted.Close)

	if err := restarted.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	calls := h.rec.snapshot()
	for _, step := range []string{"Restore", "Restart"} {
		if slices.Contains(calls, step) {
			t.Errorf("доигрывание транзакции без записи вызвало %s: шаги %v", step, calls)
		}
	}

	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("доигрывание оставило состояние на диске")
	}
}

// Конфига на устройстве нет — первый запуск или удалён владельцем. Применение
// не останавливается, а откат этого применения возвращать нечего.
func TestBackupWithoutConfigContinues(t *testing.T) {
	h := newHarness(t)
	h.store.backupErr = config.ErrNoConfig

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if !slices.Contains(h.rec.snapshot(), "Write") {
		t.Error("без конфига на устройстве применение не дошло до записи")
	}

	// Бэкап прошлой транзакции снят вместе с конфигом: откат возвращать нечего.
	h.store.restoreErr = config.ErrNoBackup
	h.clock.fire()
	h.manager.Close()

	tx := h.manager.Current()
	if tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
		t.Errorf("фаза %q с кодом %q, ожидали отказ с причиной no_backup", tx.Phase, tx.ReasonCode)
	}
}

// Отказ чтения конфига перед историей применение не останавливает, но и не
// проходит молча; отсутствие конфига — штатный первый запуск без записи.
func TestReadFailureBeforeSaveVersionIsLogged(t *testing.T) {
	tests := []struct {
		name     string
		readErr  error
		wantWarn bool
	}{
		{"чтение не прошло", errors.New("ошибка ввода-вывода"), true},
		{"конфига ещё нет", config.ErrNoConfig, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer

			h := newHarnessWith(t, cycleTimeout, slog.New(slog.NewTextHandler(&logs, nil)))
			h.store.readErr = tt.readErr

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
				t.Fatalf("применение: %v", err)
			}
			h.waitWindow(t)

			if slices.Contains(h.rec.snapshot(), "SaveVersion") {
				t.Error("в историю ушла версия, которую не прочитали")
			}

			warned := strings.Contains(logs.String(), "level=WARN msg=\"конфиг не прочитан, версия в историю не сохранена\"")
			if warned != tt.wantWarn {
				t.Errorf("предупреждение в логе: %v, ожидали %v; лог:\n%s", warned, tt.wantWarn, logs.String())
			}
		})
	}
}

func countOf(calls []string, name string) int {
	n := 0

	for _, call := range calls {
		if call == name {
			n++
		}
	}

	return n
}
