package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func openTestRoot(t *testing.T, dir string) *os.Root {
	t.Helper()

	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatalf("открытие каталога %s: %v", dir, err)
	}
	t.Cleanup(func() { _ = root.Close() })

	return root
}

// Временный файл попадает в каталог, который sing-box сливает целиком: суффикс
// .json у него означал бы, что кандидат уезжает в рабочий конфиг между шагами.
func TestTempNameIsNotJSON(t *testing.T) {
	root := openTestRoot(t, t.TempDir())

	f, name, err := createTemp(root)
	if err != nil {
		t.Fatalf("временный файл: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("закрытие: %v", err)
	}

	if strings.HasSuffix(name, ".json") {
		t.Errorf("имя %q оканчивается на .json", name)
	}
	if !strings.HasPrefix(name, ".") {
		t.Errorf("имя %q не начинается с точки", name)
	}
}

func TestCreateTempIsUnique(t *testing.T) {
	root := openTestRoot(t, t.TempDir())
	seen := make(map[string]bool)

	for range 16 {
		f, name, err := createTemp(root)
		if err != nil {
			t.Fatalf("временный файл: %v", err)
		}
		if err := f.Close(); err != nil {
			t.Fatalf("закрытие: %v", err)
		}
		if seen[name] {
			t.Fatalf("имя %q выдано дважды", name)
		}
		seen[name] = true
	}
}

func TestWriteAtomicSetsPerm(t *testing.T) {
	dir := t.TempDir()

	if err := writeAtomic(openTestRoot(t, dir), "config.json", []byte("{}"), 0o640); err != nil {
		t.Fatalf("запись: %v", err)
	}

	info, err := os.Stat(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o640 {
		t.Errorf("права %o, ожидали %o", got, 0o640)
	}
}

func TestWriteAtomicLeavesNoLeftovers(t *testing.T) {
	dir := t.TempDir()

	if err := writeAtomic(openTestRoot(t, dir), "config.json", []byte("{}"), securePerm); err != nil {
		t.Fatalf("запись: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("чтение каталога: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "config.json" {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("в каталоге %v, ожидали только config.json", names)
	}
}

func TestPermOfFallsBackToSecure(t *testing.T) {
	root := openTestRoot(t, t.TempDir())

	if got := permOf(root, "нет-такого"); got != securePerm {
		t.Errorf("права %o, ожидали %o для несуществующего файла", got, securePerm)
	}
}

func TestSyncDir(t *testing.T) {
	if err := syncDir(openTestRoot(t, t.TempDir())); err != nil {
		t.Errorf("fsync каталога: %v", err)
	}
}
