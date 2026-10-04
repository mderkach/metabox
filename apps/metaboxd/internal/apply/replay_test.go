package apply_test

import (
	"encoding/json"
	"errors"
	"log/slog"
	"slices"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/config"
)

// seedState кладёт состояние так, как его оставила бы прошлая жизнь демона.
func seedState(t *testing.T, h *harness, tx apply.Transaction) {
	t.Helper()

	data, err := json.Marshal(tx)
	if err != nil {
		t.Fatalf("сериализация состояния: %v", err)
	}
	if err := h.store.WriteState(t.Context(), data); err != nil {
		t.Fatalf("подготовка состояния: %v", err)
	}

	h.rec.mu.Lock()
	h.rec.calls = nil
	h.rec.mu.Unlock()
}

// Цикл оборвался после записи конфига: sha на диске совпал с суммой из
// состояния, значит возвращаем предыдущий конфиг.
func TestReplayRollsBackInterruptedApply(t *testing.T) {
	h := newHarness(t)
	h.store.mu.Lock()
	h.store.sum = "записанный"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "прерванная", Phase: apply.PhaseApplying, Window: window, Sum: "записанный"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if got := h.rec.snapshot(); !slices.Contains(got, "Restore") || !slices.Contains(got, "Restart") {
		t.Errorf("шаги %v, ожидали откат и рестарт", got)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("фаза %q, ожидали откат", got)
	}
}

// Питание снято между записью состояния и конфига: на диске конфиг прежнего
// поколения, а бэкап мог остаться от прошлой транзакции — откат по нему
// молча потерял бы подтверждённую версию.
func TestReplaySkipsRollbackWhenConfigWasNotWritten(t *testing.T) {
	h := newHarness(t)
	h.store.mu.Lock()
	h.store.sum = "подтверждённый"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "оборванная", Phase: apply.PhaseApplying, Window: window, Sum: "новый"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Restore") || slices.Contains(got, "Restart") {
		t.Errorf("шаги %v, ожидали только очистку состояния", got)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("состояние несостоявшейся записи осталось на диске")
	}
}

func TestReplayRollsBackExpiredWindow(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "истёкшая", Phase: apply.PhaseAwaitingConfirm, Window: 0})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("отката не было: %v", h.rec.snapshot())
	}
	if got := h.manager.Current().Phase; got != apply.PhaseRolledBack {
		t.Errorf("фаза %q, ожидали откат", got)
	}
}

// Неистёкшее окно восстанавливается таймером: пользователю остаётся шанс
// подтвердить связь, а без подтверждения откат всё равно наступит.
func TestReplayRestoresLiveWindow(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{
		ID:     "живая",
		Phase:  apply.PhaseAwaitingConfirm,
		Window: 30 * time.Second,
		Sum:    "сумма-из-состояния",
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if got := h.waitWindow(t); got != 30*time.Second {
		t.Errorf("окно %v, ожидали 30s из состояния", got)
	}
	if got := h.manager.Current().Phase; got != apply.PhaseAwaitingConfirm {
		t.Errorf("фаза %q, ожидали ожидание подтверждения", got)
	}
	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("живое окно откатилось сразу")
	}

	h.clock.fire()
	h.manager.Close()

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("восстановленное окно не привело к откату: %v", h.rec.snapshot())
	}
}

func TestReplayConfirmsRestoredWindow(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "живая", Phase: apply.PhaseAwaitingConfirm, Window: 30 * time.Second})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), "живая"); err != nil {
		t.Fatalf("подтверждение восстановленной транзакции: %v", err)
	}

	h.manager.Close()

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Error("подтверждённая транзакция откатилась")
	}
}

func TestReplayClearsFinishedState(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "завершённая", Phase: apply.PhaseConfirmed})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "ClearState") {
		t.Errorf("состояние завершённой транзакции осталось: %v", h.rec.snapshot())
	}
}

// Состояние подтверждённой транзакции не удалилось: на диске остаётся
// терминальная фаза, и перезагрузка не откатывает подтверждённый конфиг.
func TestReplayKeepsConfirmedWhenStateNotCleared(t *testing.T) {
	h := newHarness(t)
	h.store.clearErr = errors.New("файловая система только для чтения")

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}
	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("подтверждение: %v", err)
	}
	h.manager.Close()

	data, err := h.store.ReadState(t.Context())
	if err != nil {
		t.Fatalf("чтение состояния: %v", err)
	}

	var saved apply.Transaction
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("разбор состояния: %v", err)
	}
	if saved.Phase != apply.PhaseConfirmed {
		t.Fatalf("на диске фаза %q, ожидали подтверждение", saved.Phase)
	}

	// Следующая жизнь демона на том же диске.
	h.rec.mu.Lock()
	h.rec.calls = nil
	h.rec.mu.Unlock()

	h.store.clearErr = nil
	restarted := apply.New(h.store, h.service, h.health, h.clock, slog.New(slog.DiscardHandler),
		apply.Options{Window: window, ClashPort: clashPort, CycleTimeout: cycleTimeout, ProcessInterval: time.Millisecond})
	t.Cleanup(restarted.Close)

	if err := restarted.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Restore") || slices.Contains(got, "Restart") {
		t.Errorf("шаги %v: подтверждённый конфиг откатился после перезагрузки", got)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("терминальное состояние не убрано доигрыванием")
	}
}

// Цикл оборвался после записи первого конфига: бэкапа нет, и доигрывание
// закрывает транзакцию своей причиной, а не откатом с лишним рестартом.
func TestReplayWithoutBackup(t *testing.T) {
	h := newHarness(t)
	h.store.restoreErr = config.ErrNoBackup
	h.store.mu.Lock()
	h.store.sum = "записанный"
	h.store.mu.Unlock()
	seedState(t, h, apply.Transaction{ID: "первая", Phase: apply.PhaseApplying, Window: window, Sum: "записанный"})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if got := h.rec.snapshot(); slices.Contains(got, "Restart") {
		t.Errorf("шаги %v: служба перезапущена, хотя возвращать было нечего", got)
	}
	if tx := h.manager.Current(); tx.Phase != apply.PhaseFailed || tx.ReasonCode != apply.ReasonNoBackup {
		t.Errorf("фаза %q с кодом %q, ожидали отказ с причиной no_backup", tx.Phase, tx.ReasonCode)
	}
	if state, _ := h.store.ReadState(t.Context()); state != nil {
		t.Error("состояние закрытой транзакции осталось на диске")
	}
}

func TestReplayWithoutState(t *testing.T) {
	h := newHarness(t)

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("чистый старт: %v", err)
	}
	if got := h.rec.snapshot(); len(got) != 0 {
		t.Errorf("на чистом старте выполнены шаги %v", got)
	}
}
