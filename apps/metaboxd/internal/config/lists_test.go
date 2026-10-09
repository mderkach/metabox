package config_test

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"metabox/internal/config"
)

func TestListsRoundTrip(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	put := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	if err := store.WriteLists(t.Context(), put, nil); err != nil {
		t.Fatalf("запись списков: %v", err)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение списков: %v", err)
	}
	if !bytes.Equal(files["my.json"], put["my.json"]) {
		t.Errorf("список вернулся как %q", files["my.json"])
	}

	sums, err := store.ListSums(t.Context())
	if err != nil {
		t.Fatalf("суммы списков: %v", err)
	}
	if sums["my.json"] != config.Sum(put["my.json"]) {
		t.Errorf("сумма %q не совпала с содержимым", sums["my.json"])
	}

	if err := store.WriteLists(t.Context(), nil, []string{"my.json"}); err != nil {
		t.Fatalf("удаление списка: %v", err)
	}

	files, err = store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение после удаления: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("после удаления остались файлы: %v", files)
	}
}

func TestListsEmptyWithoutDir(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение без каталога: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("без каталога нашлись файлы: %v", files)
	}

	// Удаление без каталога — пустое действие, а не отказ.
	if err := store.WriteLists(t.Context(), nil, []string{"нет.json"}); err != nil {
		t.Fatalf("удаление без каталога: %v", err)
	}
}

// Откат обязан вернуть и конфиг, и файлы списков: изменённый — побайтово,
// появившийся после бэкапа — убрать.
func TestRestoreBringsListsBack(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

	original := []byte(`{"rules":[{"domain_suffix":["example.com"]}]}`)
	if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": original}, nil); err != nil {
		t.Fatalf("подготовка списка: %v", err)
	}

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("бэкап: %v", err)
	}

	changed := map[string][]byte{
		"my.json":    []byte(`{"rules":[]}`),
		"extra.json": []byte(`{"rules":[]}`),
	}
	if err := store.WriteLists(t.Context(), changed, nil); err != nil {
		t.Fatalf("правка списков: %v", err)
	}
	if err := store.Write(t.Context(), []byte(`{"стало":true}`)); err != nil {
		t.Fatalf("правка конфига: %v", err)
	}

	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("восстановление: %v", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, []byte(`{"было":true}`)) {
		t.Errorf("конфиг после отката: %q", got)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение списков после отката: %v", err)
	}
	if !bytes.Equal(files["my.json"], original) {
		t.Errorf("список после отката: %q, ожидали исходный", files["my.json"])
	}
	if _, ok := files["extra.json"]; ok {
		t.Error("файл, появившийся после бэкапа, пережил откат")
	}
}

// Бэкап без снимка списков — от прежней версии демона — откат каталога не трогает.
func TestRestoreLeavesListsWithoutSnapshot(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("бэкап: %v", err)
	}

	// Прежний демон снимка не оставлял.
	if err := os.RemoveAll(backupListsPath(store)); err != nil {
		t.Fatal(err)
	}

	if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": []byte("{}")}, nil); err != nil {
		t.Fatalf("список после бэкапа: %v", err)
	}

	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("восстановление: %v", err)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := files["my.json"]; !ok {
		t.Error("откат без снимка тронул каталог списков")
	}
}

func backupListsPath(store *config.Store) string {
	return filepath.Join(filepath.Dir(store.BackupPath()), "rule-sets.backup")
}

// Кандидат собирается с изменениями транзакции: put ложится поверх, remove в
// кандидата не попадает, а рабочий каталог остаётся нетронутым.
func TestStageCandidateOverlaysLists(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	if err := store.WriteLists(t.Context(), map[string][]byte{
		"old.json":  []byte(`{"old":true}`),
		"kept.json": []byte(`{"kept":true}`),
	}, nil); err != nil {
		t.Fatalf("подготовка списков: %v", err)
	}

	dst := t.TempDir()
	put := map[string][]byte{"new.json": []byte(`{"new":true}`)}

	if err := store.StageCandidate(t.Context(), dst, []byte("{}"), put, []string{"old.json"}); err != nil {
		t.Fatalf("раскладка кандидата: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dst, "rule-sets", "old.json")); !errors.Is(err, fs.ErrNotExist) {
		t.Error("удаляемый список попал в кандидата")
	}

	got, err := os.ReadFile(filepath.Join(dst, "rule-sets", "new.json"))
	if err != nil {
		t.Fatalf("нового списка в кандидате нет: %v", err)
	}
	if !bytes.Equal(got, put["new.json"]) {
		t.Errorf("новый список в кандидате: %q", got)
	}

	if _, err := os.Stat(filepath.Join(dst, "rule-sets", "kept.json")); err != nil {
		t.Errorf("нетронутый список не переехал: %v", err)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := files["old.json"]; !ok || len(files) != 2 {
		t.Errorf("раскладка кандидата тронула рабочий каталог: %v", files)
	}
}

// foreignLists — файлы подкаталога списков, которыми демон не управляет:
// скомпилированный набор владельца и остаток оборванной записи.
var foreignLists = map[string][]byte{"geo.srs": []byte("binary"), ".metabox-123": []byte(`{"rules":[]}`)}

func writeForeignLists(t *testing.T, store *config.Store) {
	t.Helper()

	for name, data := range foreignLists {
		if err := os.WriteFile(filepath.Join(store.ListsPath(), name), data, 0o600); err != nil {
			t.Fatalf("чужой файл %s: %v", name, err)
		}
	}
}

func TestListsSkipForeignNames(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	own := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	if err := store.WriteLists(t.Context(), own, nil); err != nil {
		t.Fatalf("запись списков: %v", err)
	}
	writeForeignLists(t, store)

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение списков: %v", err)
	}
	if len(files) != 1 || files["my.json"] == nil {
		t.Errorf("чтение отдало %q, ожидали только свои файлы", files)
	}

	sums, err := store.ListSums(t.Context())
	if err != nil {
		t.Fatalf("суммы списков: %v", err)
	}
	if len(sums) != 1 || sums["my.json"] != config.Sum(own["my.json"]) {
		t.Errorf("суммы %v, ожидали только свои файлы", sums)
	}
}

// Откат возвращает свои файлы, а чужие, появившиеся после бэкапа, оставляет на
// месте: их демон не писал и снимать не вправе.
func TestRestoreKeepsForeignLists(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	own := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	if err := store.WriteLists(t.Context(), own, nil); err != nil {
		t.Fatalf("запись списков: %v", err)
	}

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("бэкап: %v", err)
	}

	writeForeignLists(t, store)

	if err := store.WriteLists(t.Context(), map[string][]byte{"late.json": []byte("{}")}, []string{"my.json"}); err != nil {
		t.Fatalf("правка списков после бэкапа: %v", err)
	}

	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("откат: %v", err)
	}

	for name, want := range foreignLists {
		got, err := os.ReadFile(filepath.Join(store.ListsPath(), name))
		if err != nil || !bytes.Equal(got, want) {
			t.Errorf("чужой файл %s после отката: %q, ошибка %v", name, got, err)
		}
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("чтение после отката: %v", err)
	}
	if len(files) != 1 || !bytes.Equal(files["my.json"], own["my.json"]) {
		t.Errorf("свои файлы после отката %q, ожидали %q", files, own)
	}
}
