package apply_test

import (
	"encoding/json"
	"slices"
	"testing"
	"time"

	"metabox/internal/apply"
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

// Цикл оборвался, не дойдя до окна: что успело записаться, неизвестно, значит
// возвращаем предыдущий конфиг.
func TestReplayRollsBackInterruptedApply(t *testing.T) {
	h := newHarness(t)
	seedState(t, h, apply.Transaction{ID: "прерванная", Phase: apply.PhaseApplying, Window: window})

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

func TestReplayWithoutState(t *testing.T) {
	h := newHarness(t)

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("чистый старт: %v", err)
	}
	if got := h.rec.snapshot(); len(got) != 0 {
		t.Errorf("на чистом старте выполнены шаги %v", got)
	}
}
