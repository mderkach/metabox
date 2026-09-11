package config

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func newVersionStore(t *testing.T) *Store {
	t.Helper()

	dir := t.TempDir()
	cfgDir := filepath.Join(dir, "config")
	serviceDir := filepath.Join(dir, "service")

	for _, d := range []string{cfgDir, serviceDir} {
		if err := os.Mkdir(d, 0o700); err != nil {
			t.Fatalf("создание %s: %v", d, err)
		}
	}

	store, err := NewStore(cfgDir, "config.json", serviceDir)
	if err != nil {
		t.Fatalf("создание хранилища: %v", err)
	}

	return store
}

func TestSaveVersionNumbersMonotonically(t *testing.T) {
	store := newVersionStore(t)

	for i := 1; i <= 3; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("сохранение версии %d: %v", i, err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("версий в истории %d, ожидали 3", len(got))
	}

	// Свежая первой: экран истории показывает последние правки сверху.
	want := []int{3, 2, 1}
	for i, version := range got {
		if version.ID != want[i] {
			t.Errorf("версия на позиции %d имеет номер %d, ожидали %d", i, version.ID, want[i])
		}

		if version.Sum == "" || version.Size == 0 {
			t.Errorf("версия %d без отпечатка или размера: %+v", version.ID, version)
		}
	}
}

func TestVersionsTrimmedToLimit(t *testing.T) {
	store := newVersionStore(t)

	total := maxVersions + 4
	for i := 1; i <= total; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("сохранение версии %d: %v", i, err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != maxVersions {
		t.Fatalf("версий в истории %d, ожидали %d", len(got), maxVersions)
	}

	if got[0].ID != total {
		t.Errorf("самая свежая версия %d, ожидали %d", got[0].ID, total)
	}

	// Номера не переиспользуются: удаление старых не сдвигает счётчик.
	if oldest := got[len(got)-1].ID; oldest != total-maxVersions+1 {
		t.Errorf("самая старая версия %d, ожидали %d", oldest, total-maxVersions+1)
	}
}

func TestReadVersionReturnsBytesAsIs(t *testing.T) {
	store := newVersionStore(t)

	// Форматирование и порядок ключей сохраняются: демон конфиг не разбирает.
	raw := []byte("{\n  \"outbounds\": [],\n  \"log\": {\"level\": \"error\"}\n}\n")
	if err := store.SaveVersion(t.Context(), raw); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	got, err := store.ReadVersion(t.Context(), 1)
	if err != nil {
		t.Fatalf("чтение версии: %v", err)
	}

	if string(got) != string(raw) {
		t.Errorf("содержимое версии: получили %q, ожидали %q", got, raw)
	}
}

func TestReadVersionUnknown(t *testing.T) {
	store := newVersionStore(t)

	if _, err := store.ReadVersion(t.Context(), 42); !errors.Is(err, ErrNoVersion) {
		t.Errorf("чтение неизвестной версии: получили %v, ожидали ErrNoVersion", err)
	}
}

func TestVersionsEmptyHistory(t *testing.T) {
	store := newVersionStore(t)

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение пустой истории: %v", err)
	}

	if len(got) != 0 {
		t.Errorf("версий в пустой истории %d, ожидали 0", len(got))
	}
}

// Каталог истории лежит вне каталога конфига: сервис поднимается в режиме
// каталога и слил бы версии в рабочую конфигурацию.
func TestVersionsStoredOutsideConfigDir(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	entries, err := os.ReadDir(store.dir)
	if err != nil {
		t.Fatalf("чтение каталога конфига: %v", err)
	}

	if len(entries) != 0 {
		t.Errorf("в каталоге конфига появились файлы: %v", entries)
	}

	if _, err := os.Stat(store.VersionsPath()); err != nil {
		t.Errorf("каталога истории нет: %v", err)
	}
}

// Чужие файлы в служебном каталоге историю не ломают.
func TestVersionsIgnoresForeignNames(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("сохранение версии: %v", err)
	}

	foreign := filepath.Join(store.VersionsPath(), "readme.txt")
	if err := os.WriteFile(foreign, []byte("не версия"), securePerm); err != nil {
		t.Fatalf("запись чужого файла: %v", err)
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("чтение истории: %v", err)
	}

	if len(got) != 1 {
		t.Errorf("версий в истории %d, ожидали 1", len(got))
	}
}
