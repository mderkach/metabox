package apply_test

import (
	"errors"
	"slices"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
)

// Плохое имя файла списка отклоняется до того, как транзакция что-то тронула.
func TestStartRejectsBadListName(t *testing.T) {
	tests := []struct {
		name string
		list string
	}{
		{"выход из подкаталога", "../evil.json"},
		{"вложенный путь", "dir/evil.json"},
		{"без расширения", "evil"},
		{"скрытый файл", ".evil.json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			lists := apply.Lists{Put: map[string][]byte{tt.list: []byte("{}")}}

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", ""); !errors.Is(err, apply.ErrListName) {
				t.Fatalf("ошибка %v, ожидали ErrListName", err)
			}

			if got := h.rec.snapshot(); len(got) != 0 {
				t.Errorf("до транзакции дошло: %v", got)
			}
		})
	}
}

// Файл с тем же содержимым и удаление несуществующего — пустые действия: в
// транзакцию попадают только реальные изменения, иначе доигрывание прочитало
// бы совпадение неизменённого файла как начатую запись.
func TestStartNarrowsListsToChanges(t *testing.T) {
	h := newHarness(t)
	same := []byte(`{"rules":[]}`)

	h.store.mu.Lock()
	h.store.lists = map[string][]byte{"same.json": same}
	h.store.mu.Unlock()

	lists := apply.Lists{
		Put:    map[string][]byte{"same.json": same, "new.json": []byte("{}")},
		Remove: []string{"absent.json"},
	}

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}

	if _, ok := tx.Lists["same.json"]; ok {
		t.Error("неизменённый файл попал в транзакцию")
	}
	if _, ok := tx.Lists["new.json"]; !ok {
		t.Error("нового файла в транзакции нет")
	}
	if len(tx.RemovedLists) != 0 {
		t.Errorf("удаление несуществующего попало в транзакцию: %v", tx.RemovedLists)
	}
}

// Правка файлов списков мимо демона ловится базой клиента, как у конфига.
func TestStartChecksListsBase(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.lists = map[string][]byte{"my.json": []byte("{}")}
	h.store.mu.Unlock()

	stale := apply.ListsEtag(map[string]string{})

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", stale); !errors.Is(err, apply.ErrListsModified) {
		t.Fatalf("ошибка %v, ожидали ErrListsModified", err)
	}

	fresh := apply.ListsEtag(map[string]string{"my.json": config.Sum([]byte("{}"))})

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", fresh); err != nil {
		t.Fatalf("применение с верной базой: %v", err)
	}
}

// Обрыв после записи файла списка, но до конфига: запись началась, и без
// отката устройство осталось бы с новым списком при старом конфиге.
func TestReplayRollsBackWhenListWritten(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.sum = "старый-конфиг"
	h.store.lists = map[string][]byte{"my.json": []byte("новое")}
	h.store.mu.Unlock()

	seedState(t, h, apply.Transaction{
		ID:     "прерванная",
		Phase:  apply.PhaseApplying,
		Window: window,
		Sum:    "другая-сумма",
		Lists:  map[string]string{"my.json": config.Sum([]byte("новое"))},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("отката не было: %v", h.rec.snapshot())
	}
}

// Обрыв до любой записи: ни конфиг, ни файлы не совпали с целями транзакции —
// откат по бэкапу прошлой транзакции только навредил бы.
func TestReplaySkipsWhenListsUntouched(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.sum = "старый-конфиг"
	h.store.lists = map[string][]byte{
		"my.json":   []byte("старое"),
		"gone.json": []byte("ещё живой"),
	}
	h.store.mu.Unlock()

	seedState(t, h, apply.Transaction{
		ID:           "прерванная",
		Phase:        apply.PhaseApplying,
		Window:       window,
		Sum:          "другая-сумма",
		Lists:        map[string]string{"my.json": config.Sum([]byte("новое"))},
		RemovedLists: []string{"gone.json"},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("откат без записи: %v", h.rec.snapshot())
	}
}

// Тот же обрыв, но файл уже удалён: запись началась — откат обязан вернуть его.
func TestReplayRollsBackWhenListRemoved(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.sum = "старый-конфиг"
	h.store.lists = map[string][]byte{}
	h.store.mu.Unlock()

	seedState(t, h, apply.Transaction{
		ID:           "прерванная",
		Phase:        apply.PhaseApplying,
		Window:       window,
		Sum:          "другая-сумма",
		RemovedLists: []string{"gone.json"},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("доигрывание: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("отката не было: %v", h.rec.snapshot())
	}
}

// Записанные файлы уезжают на диск и доступны следующему применению как база.
func TestApplyWritesLists(t *testing.T) {
	h := newHarness(t)
	lists := apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", "")
	if err != nil {
		t.Fatalf("применение: %v", err)
	}

	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("подтверждение: %v", err)
	}

	h.store.mu.Lock()
	written := h.store.lists["my.json"]
	h.store.mu.Unlock()

	if string(written) != `{"rules":[]}` {
		t.Errorf("на диск уехало %q", written)
	}
}

// Относительный path списка служба резолвит от своего рабочего каталога:
// расхождение с каталогом конфига отказывает в применении до записи, а не
// откатом по healthcheck. Неизвестный каталог применение не останавливает.
func TestStartVerifiesWorkdir(t *testing.T) {
	tests := []struct {
		name       string
		workdir    string
		workdirErr error
		wantRefuse bool
	}{
		{"каталоги совпадают", configDir, nil, false},
		{"совпадают с точностью до записи пути", configDir + "/", nil, false},
		{"рабочий каталог пакета по умолчанию", "/usr/share/sing-box", nil, true},
		{"каталог неизвестен", "", nil, false},
		{"procd не ответил", "", errors.New("ubus не отвечает"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			h.service.workdir = tt.workdir
			h.service.workdirErr = tt.workdirErr
			lists := apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}

			_, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", "")

			if !tt.wantRefuse {
				if err != nil {
					t.Fatalf("применение: %v", err)
				}

				h.waitWindow(t)

				return
			}

			workdirErr, ok := errors.AsType[*apply.WorkdirError](err)
			if !ok {
				t.Fatalf("ошибка %v, ожидали WorkdirError", err)
			}
			if workdirErr.Workdir != tt.workdir || workdirErr.ConfigDir != configDir {
				t.Errorf("каталоги в отказе %q и %q, ожидали %q и %q",
					workdirErr.Workdir, workdirErr.ConfigDir, tt.workdir, configDir)
			}
			if got := h.rec.snapshot(); len(got) != 0 {
				t.Errorf("до транзакции дошло: %v", got)
			}
		})
	}
}

// Без файлов списков рабочий каталог не важен: конфиг без local применяется
// как раньше, даже когда служба запущена из каталога пакета.
func TestStartIgnoresWorkdirWithoutLists(t *testing.T) {
	h := newHarness(t)
	h.service.workdir = "/usr/share/sing-box"

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}

	h.waitWindow(t)
}
