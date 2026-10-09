package apply_test

import (
	"errors"
	"maps"
	"slices"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/procd"
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

	stale := config.ListsEtag(map[string]string{})

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", stale); !errors.Is(err, apply.ErrListsModified) {
		t.Fatalf("ошибка %v, ожидали ErrListsModified", err)
	}

	fresh := config.ListsEtag(map[string]string{"my.json": config.Sum([]byte("{}"))})

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
			h.service.launch = procd.Launch{Workdir: tt.workdir}
			h.service.launchErr = tt.workdirErr
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
	h.service.launch = procd.Launch{Workdir: "/usr/share/sing-box"}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("применение: %v", err)
	}

	h.waitWindow(t)
}

// Восстановление версии приводит каталог списков к снимку: файлы снимка
// пишутся, лишние удаляются, а имён, которых применение не примет, конверт не
// несёт — иначе чужой файл в подкаталоге валил бы восстановление.
func TestSnapshotLists(t *testing.T) {
	data := []byte(`{"rules":[]}`)

	tests := []struct {
		name       string
		snapshot   map[string][]byte
		current    map[string]string
		wantPut    []string
		wantRemove []string
	}{
		{
			name:     "снимок поверх пустого каталога",
			snapshot: map[string][]byte{"a.json": data},
			wantPut:  []string{"a.json"},
		},
		{
			name:       "пустой снимок снимает текущие",
			snapshot:   map[string][]byte{},
			current:    map[string]string{"a.json": "x", "b.json": "y"},
			wantRemove: []string{"a.json", "b.json"},
		},
		{
			name:       "общие пишутся, лишние снимаются",
			snapshot:   map[string][]byte{"a.json": data},
			current:    map[string]string{"a.json": "x", "b.json": "y"},
			wantPut:    []string{"a.json"},
			wantRemove: []string{"b.json"},
		},
		{
			name:     "недопустимое имя в снимке пропускается",
			snapshot: map[string][]byte{"a.json": data, "README": data},
			wantPut:  []string{"a.json"},
		},
		{
			name:     "недопустимое имя в каталоге не удаляется",
			snapshot: map[string][]byte{},
			current:  map[string]string{"notes.txt": "x"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := apply.SnapshotLists(tt.snapshot, tt.current)

			put := slices.Sorted(maps.Keys(got.Put))
			if !slices.Equal(put, tt.wantPut) {
				t.Errorf("пишутся %v, ожидали %v", put, tt.wantPut)
			}

			if !slices.Equal(got.Remove, tt.wantRemove) {
				t.Errorf("удаляются %v, ожидали %v", got.Remove, tt.wantRemove)
			}

			for name, content := range got.Put {
				if string(content) != string(tt.snapshot[name]) {
					t.Errorf("файл %s: пишется %q, ожидали %q", name, content, tt.snapshot[name])
				}
			}
		})
	}
}

// Кандидат проверяется тем режимом и от той базы путей, с какими procd поднимет
// службу; служба на чужом конфиге отказывает до записи.
func TestStartChecksLikeTheService(t *testing.T) {
	ours := configDir + "/" + configName

	// packageWorkdir подменяется существующим каталогом: проверка берёт
	// рабочий каталог базой путей, только если он есть на диске.
	const packageWorkdir = "<рабочий каталог пакета>"

	tests := []struct {
		name        string
		launch      procd.Launch
		wantFile    bool
		wantWorkdir string
		wantRefuse  bool
	}{
		{name: "команда неизвестна — как у пакета форка", wantFile: true},
		{
			name:        "пакет форка: файл и рабочий каталог пакета",
			launch:      procd.Launch{Configs: []string{ours}, Workdir: packageWorkdir},
			wantFile:    true,
			wantWorkdir: packageWorkdir,
		},
		{
			name:     "рабочего каталога нет на диске — база путей кандидат",
			launch:   procd.Launch{Configs: []string{ours}, Workdir: "/nonexistent/sing-box"},
			wantFile: true,
		},
		{
			name:       "команда без -c и -C на чужом рабочем каталоге",
			launch:     procd.Launch{Configs: []string{"/usr/share/sing-box/config.json"}, Workdir: "/usr/share/sing-box"},
			wantRefuse: true,
		},
		{name: "относительный файл при неизвестном рабочем каталоге", launch: procd.Launch{Configs: []string{"config.json"}}, wantRefuse: true},
		{
			name:     "файл при рабочем каталоге конфига",
			launch:   procd.Launch{Configs: []string{ours}, Workdir: configDir},
			wantFile: true,
		},
		{name: "режим каталога", launch: procd.Launch{ConfigDirs: []string{configDir}, Workdir: configDir}},
		{name: "чужой файл конфига", launch: procd.Launch{Configs: []string{"/var/run/homeproxy/sing-box-c.json"}}, wantRefuse: true},
		{name: "несколько файлов", launch: procd.Launch{Configs: []string{ours, configDir + "/extra.json"}}, wantRefuse: true},
		{name: "файл и каталог разом", launch: procd.Launch{Configs: []string{ours}, ConfigDirs: []string{configDir}}, wantRefuse: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			h.service.launch = tt.launch

			if tt.launch.Workdir == packageWorkdir {
				h.service.launch.Workdir = t.TempDir()
				tt.wantWorkdir = h.service.launch.Workdir
			}

			_, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")

			if tt.wantRefuse {
				launchErr, ok := errors.AsType[*apply.LaunchError](err)
				if !ok {
					t.Fatalf("ошибка %v, ожидали LaunchError", err)
				}
				if launchErr.Config != ours {
					t.Errorf("конфиг демона в отказе %q, ожидали %q", launchErr.Config, ours)
				}
				if got := h.rec.snapshot(); len(got) != 0 {
					t.Errorf("до транзакции дошло: %v", got)
				}

				return
			}

			if err != nil {
				t.Fatalf("применение: %v", err)
			}
			h.waitWindow(t)

			h.service.mu.Lock()
			dir, file, workdir := h.service.checked[0], h.service.checked[1], h.service.checked[2]
			h.service.mu.Unlock()

			if wantFile := dir + "/" + configName; tt.wantFile != (file == wantFile) || (!tt.wantFile && file != "") {
				t.Errorf("файл проверки %q при каталоге %q, ожидали файл: %v", file, dir, tt.wantFile)
			}

			wantWorkdir := tt.wantWorkdir
			if wantWorkdir == "" {
				wantWorkdir = dir
			}
			if workdir != wantWorkdir {
				t.Errorf("база путей проверки %q, ожидали %q", workdir, wantWorkdir)
			}
		})
	}
}
