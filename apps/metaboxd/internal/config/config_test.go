package config_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"metabox/internal/config"
)

const configName = "config.json"

// newStore разводит рабочий каталог и служебный: бэкап обязан лежать вне
// каталога, который sing-box сливает целиком.
func newStore(t *testing.T) (*config.Store, string) {
	t.Helper()

	root := t.TempDir()
	cfgDir := filepath.Join(root, "sing-box")
	stateDir := filepath.Join(root, "metabox")

	for _, dir := range []string{cfgDir, stateDir} {
		if err := os.Mkdir(dir, 0o755); err != nil {
			t.Fatalf("каталог %s: %v", dir, err)
		}
	}

	store, err := config.NewStore(cfgDir, configName, stateDir)
	if err != nil {
		t.Fatalf("сборка хранилища: %v", err)
	}

	return store, cfgDir
}

func TestNewStoreRejectsServiceDirInsideConfigDir(t *testing.T) {
	dir := t.TempDir()

	tests := []struct {
		name       string
		serviceDir string
	}{
		{"тот же каталог", dir},
		{"подкаталог", filepath.Join(dir, "metabox")},
		{"подкаталог глубже", filepath.Join(dir, "state", "metabox")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := config.NewStore(dir, configName, tt.serviceDir); err == nil {
				t.Error("раскладка принята: сервис сливает каталог конфига целиком")
			}
		})
	}
}

func TestNewStoreAcceptsServiceDirOutside(t *testing.T) {
	root := t.TempDir()

	if _, err := config.NewStore(
		filepath.Join(root, "sing-box"),
		configName,
		filepath.Join(root, "metabox"),
	); err != nil {
		t.Errorf("соседний каталог отвергнут: %v", err)
	}
}

func TestStateRoundTrip(t *testing.T) {
	store, _ := newStore(t)

	if _, err := store.ReadState(t.Context()); !errors.Is(err, config.ErrNoState) {
		t.Errorf("получили %v, ожидали ErrNoState на чистом старте", err)
	}

	want := []byte(`{"phase":"awaiting_confirm"}`)
	if err := store.WriteState(t.Context(), want); err != nil {
		t.Fatalf("запись состояния: %v", err)
	}

	got, err := store.ReadState(t.Context())
	if err != nil {
		t.Fatalf("чтение состояния: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("прочитали %q, записали %q", got, want)
	}

	info, err := os.Stat(store.StatePath())
	if err != nil {
		t.Fatalf("stat состояния: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("права %o, ожидали 600: в состоянии тот же конфиг", perm)
	}

	if err := store.ClearState(t.Context()); err != nil {
		t.Fatalf("очистка состояния: %v", err)
	}
	if _, err := store.ReadState(t.Context()); !errors.Is(err, config.ErrNoState) {
		t.Errorf("получили %v, ожидали ErrNoState после очистки", err)
	}
	if err := store.ClearState(t.Context()); err != nil {
		t.Errorf("повторная очистка дала ошибку: %v", err)
	}
}

func TestStateLandsOutsideConfigDir(t *testing.T) {
	store, cfgDir := newStore(t)

	if err := store.WriteState(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("запись состояния: %v", err)
	}

	entries, err := os.ReadDir(cfgDir)
	if err != nil {
		t.Fatalf("чтение каталога конфига: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("в каталоге конфига появилось %d файлов: сервис сливает его целиком", len(entries))
	}
}

func writeConfig(t *testing.T, dir, name string, data []byte, perm fs.FileMode) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(dir, name), data, perm); err != nil {
		t.Fatalf("подготовка %s: %v", name, err)
	}
}

func readConfig(t *testing.T, dir string) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(dir, configName))
	if err != nil {
		t.Fatalf("чтение конфига: %v", err)
	}

	return data
}

func TestWriteThenRead(t *testing.T) {
	store, _ := newStore(t)
	want := []byte(`{"log":{"level":"info"}}`)

	if err := store.Write(t.Context(), want); err != nil {
		t.Fatalf("запись: %v", err)
	}

	got, err := store.Read(t.Context())
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("прочитали %q, записали %q", got, want)
	}
}

func TestReadMissingConfig(t *testing.T) {
	store, _ := newStore(t)

	if _, err := store.Read(t.Context()); !errors.Is(err, config.ErrNoConfig) {
		t.Errorf("получили %v, ожидали ErrNoConfig: отсутствие конфига — штатный случай", err)
	}
}

func TestReadMissingConfigDir(t *testing.T) {
	store, err := config.NewStore(filepath.Join(t.TempDir(), "нет-такого"), configName, t.TempDir())
	if err != nil {
		t.Fatalf("создание хранилища: %v", err)
	}

	if _, err := store.Read(t.Context()); !errors.Is(err, config.ErrNoConfig) {
		t.Errorf("получили %v, ожидали ErrNoConfig", err)
	}
}

func TestWriteKeepsExistingPerm(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o640)

	if err := store.Write(t.Context(), []byte(`{"dns":{}}`)); err != nil {
		t.Fatalf("запись: %v", err)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o640 {
		t.Errorf("права %o, ожидали 640: владелец мог сузить их осознанно", got)
	}
}

func TestWriteNewConfigIsPrivate(t *testing.T) {
	store, _ := newStore(t)

	if err := store.Write(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("запись: %v", err)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("права %o, ожидали 600: в конфиге ключи пользователя", got)
	}
}

// Отказ до rename обязан оставить прежний конфиг побайтово нетронутым.
func TestFailedWriteKeepsFileIntact(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("под root права каталога не мешают записи")
	}

	store, cfgDir := newStore(t)
	before := []byte(`{"outbounds":[{"type":"direct"}]}`)
	writeConfig(t, cfgDir, configName, before, 0o600)

	if err := os.Chmod(cfgDir, 0o500); err != nil {
		t.Fatalf("снятие прав на запись: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(cfgDir, 0o700) })

	if err := store.Write(t.Context(), []byte(`{"сломано":`)); err == nil {
		t.Fatal("запись в закрытый на запись каталог прошла")
	}

	if err := os.Chmod(cfgDir, 0o700); err != nil {
		t.Fatalf("возврат прав: %v", err)
	}
	if after := readConfig(t, cfgDir); !bytes.Equal(after, before) {
		t.Errorf("конфиг стал %q, был %q", after, before)
	}
}

func TestSum(t *testing.T) {
	store, cfgDir := newStore(t)
	data := []byte(`{"log":{"level":"debug"}}`)
	writeConfig(t, cfgDir, configName, data, 0o600)

	want := sha256.Sum256(data)

	got, err := store.Sum(t.Context())
	if err != nil {
		t.Fatalf("sha256: %v", err)
	}
	if got != hex.EncodeToString(want[:]) {
		t.Errorf("получили %s, ожидали %s", got, hex.EncodeToString(want[:]))
	}
}

func TestSumChangesAfterWrite(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	before, err := store.Sum(t.Context())
	if err != nil {
		t.Fatalf("sha256 до: %v", err)
	}

	if err := store.Write(t.Context(), []byte(`{"dns":{}}`)); err != nil {
		t.Fatalf("запись: %v", err)
	}

	after, err := store.Sum(t.Context())
	if err != nil {
		t.Fatalf("sha256 после: %v", err)
	}
	if before == after {
		t.Error("sha256 не изменился после записи другого содержимого")
	}
}

func TestBackupAndRestore(t *testing.T) {
	store, cfgDir := newStore(t)
	original := []byte(`{"route":{"final":"direct"}}`)
	writeConfig(t, cfgDir, configName, original, 0o640)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("бэкап: %v", err)
	}
	if err := store.Write(t.Context(), []byte(`{"route":{"final":"proxy"}}`)); err != nil {
		t.Fatalf("запись: %v", err)
	}
	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("откат: %v", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, original) {
		t.Errorf("после отката %q, ожидали %q", got, original)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o640 {
		t.Errorf("права после отката %o, ожидали 640", got)
	}
}

func TestBackupLandsOutsideConfigDir(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("бэкап: %v", err)
	}

	entries, err := os.ReadDir(cfgDir)
	if err != nil {
		t.Fatalf("чтение каталога конфига: %v", err)
	}
	for _, entry := range entries {
		if entry.Name() != configName {
			t.Errorf("в каталоге конфига появился %q: сервис сливает его целиком", entry.Name())
		}
	}
}

func TestBackupIsPrivate(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o644)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("бэкап: %v", err)
	}

	info, err := os.Stat(store.BackupPath())
	if err != nil {
		t.Fatalf("stat бэкапа: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("права бэкапа %o, ожидали 600: в нём те же ключи, что в конфиге", got)
	}
}

func TestRestoreWithoutBackup(t *testing.T) {
	store, _ := newStore(t)

	if err := store.Restore(t.Context()); !errors.Is(err, config.ErrNoBackup) {
		t.Errorf("получили %v, ожидали ErrNoBackup", err)
	}
}

// Владелец удалил конфиг по SSH и применил новый: откат этого применения
// обязан вернуть «ничего», а не удалённый конфиг из бэкапа прошлой транзакции.
func TestBackupWithoutConfigDropsStaleBackup(t *testing.T) {
	tests := []struct {
		name string
		drop func(cfgDir string) error
		// listsKept — файлы списков лежат в каталоге конфига и переживают
		// удаление одного файла конфига.
		listsKept bool
	}{
		{
			name:      "конфиг удалён",
			drop:      func(cfgDir string) error { return os.Remove(filepath.Join(cfgDir, configName)) },
			listsKept: true,
		},
		{
			name: "каталога конфига нет вовсе",
			drop: os.RemoveAll,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, cfgDir := newStore(t)
			writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

			list := []byte(`{"rules":[]}`)
			if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": list}, nil); err != nil {
				t.Fatalf("подготовка списка: %v", err)
			}
			if err := store.Backup(t.Context()); err != nil {
				t.Fatalf("бэкап прошлой транзакции: %v", err)
			}

			if err := tt.drop(cfgDir); err != nil {
				t.Fatal(err)
			}

			if err := store.Backup(t.Context()); !errors.Is(err, config.ErrNoConfig) {
				t.Fatalf("бэкап без конфига: получили %v, ожидали ErrNoConfig", err)
			}

			for _, path := range []string{store.BackupPath(), backupListsPath(store)} {
				if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
					t.Errorf("%s пережил удаление конфига: %v", path, err)
				}
			}

			if err := store.Restore(t.Context()); !errors.Is(err, config.ErrNoBackup) {
				t.Errorf("откат: получили %v, ожидали ErrNoBackup", err)
			}

			if !tt.listsKept {
				return
			}

			files, err := store.ReadLists(t.Context())
			if err != nil {
				t.Fatalf("чтение списков: %v", err)
			}
			if !bytes.Equal(files["my.json"], list) {
				t.Errorf("список после снятия бэкапа: %q, ожидали нетронутый", files["my.json"])
			}
		})
	}
}

// Первый запуск: ни конфига, ни бэкапа. Backup отвечает ErrNoConfig и ничего
// не создаёт — снимать нечего.
func TestBackupWithoutConfigOrBackup(t *testing.T) {
	t.Run("служебный каталог есть", func(t *testing.T) {
		store, _ := newStore(t)

		if err := store.Backup(t.Context()); !errors.Is(err, config.ErrNoConfig) {
			t.Fatalf("получили %v, ожидали ErrNoConfig", err)
		}

		entries, err := os.ReadDir(filepath.Dir(store.BackupPath()))
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 0 {
			t.Errorf("в служебном каталоге появилось: %v", entries)
		}
	})

	t.Run("служебного каталога нет", func(t *testing.T) {
		root := t.TempDir()
		cfgDir := filepath.Join(root, "sing-box")
		stateDir := filepath.Join(root, "metabox")

		if err := os.Mkdir(cfgDir, 0o755); err != nil {
			t.Fatal(err)
		}

		store, err := config.NewStore(cfgDir, configName, stateDir)
		if err != nil {
			t.Fatal(err)
		}

		if err := store.Backup(t.Context()); !errors.Is(err, config.ErrNoConfig) {
			t.Fatalf("получили %v, ожидали ErrNoConfig", err)
		}
		if _, err := os.Stat(stateDir); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("служебный каталог создан без бэкапа: %v", err)
		}
	})
}

func TestStageCandidate(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"старое":true}`), 0o600)
	writeConfig(t, cfgDir, "10-dns.json", []byte(`{"dns":{}}`), 0o600)
	writeConfig(t, cfgDir, "notes.txt", []byte("не конфиг"), 0o600)

	dst := t.TempDir()
	candidate := []byte(`{"новое":true}`)

	if err := store.StageCandidate(t.Context(), dst, candidate, nil, nil); err != nil {
		t.Fatalf("раскладка кандидата: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, configName))
	if err != nil {
		t.Fatalf("чтение кандидата: %v", err)
	}
	if !bytes.Equal(got, candidate) {
		t.Errorf("кандидат %q, ожидали %q", got, candidate)
	}

	if _, err := os.Stat(filepath.Join(dst, "10-dns.json")); err != nil {
		t.Errorf("соседний .json не переехал: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "notes.txt")); !errors.Is(err, fs.ErrNotExist) {
		t.Error("не-.json переехал в кандидат: сервис его не читает")
	}
}

// Подкаталоги едут в кандидата целиком: check идёт с -D на нём, и файл, на
// который конфиг ссылается относительным путём, обязан найтись там же, где
// его найдёт служба.
func TestStageCandidateCopiesSubdirectories(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"старое":true}`), 0o600)

	nested := filepath.Join(cfgDir, "rule-sets", "local")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatalf("подготовка подкаталога: %v", err)
	}
	ruleSet := []byte("domain:example.org")
	if err := os.WriteFile(filepath.Join(nested, "my.txt"), ruleSet, 0o600); err != nil {
		t.Fatalf("подготовка файла набора: %v", err)
	}

	dst := t.TempDir()
	if err := store.StageCandidate(t.Context(), dst, []byte(`{"новое":true}`), nil, nil); err != nil {
		t.Fatalf("раскладка кандидата: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "rule-sets", "local", "my.txt"))
	if err != nil {
		t.Fatalf("файл подкаталога не переехал: %v", err)
	}
	if !bytes.Equal(got, ruleSet) {
		t.Errorf("получили %q, ожидали %q", got, ruleSet)
	}
}

func TestStageCandidateSkipsSymlinkOutside(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	secret := filepath.Join(t.TempDir(), "secret.json")
	if err := os.WriteFile(secret, []byte(`{"ключ":"чужой"}`), 0o600); err != nil {
		t.Fatalf("подготовка чужого файла: %v", err)
	}
	if err := os.Symlink(secret, filepath.Join(cfgDir, "link.json")); err != nil {
		t.Fatalf("симлинк: %v", err)
	}

	dst := t.TempDir()
	if err := store.StageCandidate(t.Context(), dst, []byte(`{"новое":true}`), nil, nil); err == nil {
		t.Fatal("симлинк наружу разложился молча: демон работает под root")
	}

	if _, err := os.Stat(filepath.Join(dst, "link.json")); !errors.Is(err, fs.ErrNotExist) {
		t.Error("содержимое чужого файла уехало в кандидат")
	}
}

// Симлинк внутрь каталога сервис прочитает и сольёт, значит кандидат обязан
// его содержать — иначе проверяется не то, что запустится.
func TestStageCandidateFollowsSymlinkInside(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)
	writeConfig(t, cfgDir, "10-dns.conf", []byte(`{"dns":{}}`), 0o600)

	if err := os.Symlink("10-dns.conf", filepath.Join(cfgDir, "10-dns.json")); err != nil {
		t.Fatalf("симлинк: %v", err)
	}

	dst := t.TempDir()
	if err := store.StageCandidate(t.Context(), dst, []byte(`{"новое":true}`), nil, nil); err != nil {
		t.Fatalf("раскладка кандидата: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "10-dns.json"))
	if err != nil {
		t.Fatalf("чтение соседа по симлинку: %v", err)
	}
	if !bytes.Equal(got, []byte(`{"dns":{}}`)) {
		t.Errorf("получили %q, ожидали содержимое цели симлинка", got)
	}
}

func TestStageCandidateLeavesWorkingDirIntact(t *testing.T) {
	store, cfgDir := newStore(t)
	original := []byte(`{"старое":true}`)
	writeConfig(t, cfgDir, configName, original, 0o600)

	if err := store.StageCandidate(t.Context(), t.TempDir(), []byte(`{"новое":true}`), nil, nil); err != nil {
		t.Fatalf("раскладка кандидата: %v", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, original) {
		t.Errorf("рабочий конфиг стал %q, был %q", got, original)
	}
}

// Store — единственный владелец файла, и параллельный доступ закрыт его
// методами. Тест ловит гонку под -race, а не проверяет результат.
func TestConcurrentAccess(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()

			if err := store.Write(t.Context(), fmt.Appendf(nil, `{"n":%d}`, i)); err != nil {
				t.Errorf("запись: %v", err)
			}
			if _, err := store.Sum(t.Context()); err != nil {
				t.Errorf("sha256: %v", err)
			}
			if _, err := store.Read(t.Context()); err != nil {
				t.Errorf("чтение: %v", err)
			}
		}()
	}
	wg.Wait()
}

func TestCancelledContext(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	if err := store.Write(ctx, []byte(`{"новое":true}`)); !errors.Is(err, context.Canceled) {
		t.Errorf("получили %v, ожидали context.Canceled", err)
	}
	if got := readConfig(t, cfgDir); !bytes.Equal(got, []byte("{}")) {
		t.Errorf("конфиг стал %q при отменённом контексте", got)
	}
}

// Демон, запущенный не init-скриптом, не находит служебного каталога: первый
// Apply обязан его создать, а не упасть на записи состояния или бэкапа.
func TestServiceDirIsCreatedOnDemand(t *testing.T) {
	tests := []struct {
		name  string
		write func(t *testing.T, store *config.Store) error
		file  string
	}{
		{
			name:  "состояние",
			write: func(t *testing.T, store *config.Store) error { return store.WriteState(t.Context(), []byte("{}")) },
			file:  "apply.json",
		},
		{
			name:  "бэкап",
			write: func(t *testing.T, store *config.Store) error { return store.Backup(t.Context()) },
			file:  "config.backup",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			cfgDir := filepath.Join(root, "sing-box")
			stateDir := filepath.Join(root, "etc", "metabox")

			if err := os.Mkdir(cfgDir, 0o755); err != nil {
				t.Fatal(err)
			}
			writeConfig(t, cfgDir, configName, []byte(`{"log":{}}`), 0o644)

			store, err := config.NewStore(cfgDir, configName, stateDir)
			if err != nil {
				t.Fatal(err)
			}

			if err := tt.write(t, store); err != nil {
				t.Fatalf("запись без служебного каталога: %v", err)
			}

			for _, dir := range []string{filepath.Dir(stateDir), stateDir} {
				info, err := os.Stat(dir)
				if err != nil {
					t.Fatalf("каталог %s не создан: %v", dir, err)
				}
				if perm := info.Mode().Perm(); perm != 0o700 {
					t.Errorf("права %s — %o, ожидали 700: внутри ключи пользователя", dir, perm)
				}
			}

			if _, err := os.Stat(filepath.Join(stateDir, tt.file)); err != nil {
				t.Errorf("файл %s не записан: %v", tt.file, err)
			}
		})
	}
}

func TestRuleSetsRoundTrip(t *testing.T) {
	root := t.TempDir()
	stateDir := filepath.Join(root, "metabox")

	store, err := config.NewStore(filepath.Join(root, "sing-box"), configName, stateDir)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.ReadRuleSets(t.Context()); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("каталога ещё нет, а чтение дало %v", err)
	}

	want := []byte(`{"lists":{}}`)
	if err := store.WriteRuleSets(t.Context(), want); err != nil {
		t.Fatalf("запись без служебного каталога: %v", err)
	}

	got, err := store.ReadRuleSets(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(got, want) {
		t.Errorf("прочитали %s, записали %s", got, want)
	}

	info, err := os.Stat(filepath.Join(stateDir, "rule-sets.json"))
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Errorf("права %v, ожидали 0600", info.Mode().Perm())
	}
}
