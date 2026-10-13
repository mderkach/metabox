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
		t.Fatalf("opening directory %s: %v", dir, err)
	}
	t.Cleanup(func() { _ = root.Close() })

	return root
}

// A temporary file lands in a directory that sing-box merges whole: the .json suffix
// on it would mean the candidate goes into the working config between steps.
func TestTempNameIsNotJSON(t *testing.T) {
	root := openTestRoot(t, t.TempDir())

	f, name, err := createTemp(root)
	if err != nil {
		t.Fatalf("temporary file: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("closing: %v", err)
	}

	if strings.HasSuffix(name, ".json") {
		t.Errorf("name %q ends with .json", name)
	}
	if !strings.HasPrefix(name, ".") {
		t.Errorf("name %q does not start with a dot", name)
	}
}

func TestCreateTempIsUnique(t *testing.T) {
	root := openTestRoot(t, t.TempDir())
	seen := make(map[string]bool)

	for range 16 {
		f, name, err := createTemp(root)
		if err != nil {
			t.Fatalf("temporary file: %v", err)
		}
		if err := f.Close(); err != nil {
			t.Fatalf("closing: %v", err)
		}
		if seen[name] {
			t.Fatalf("name %q issued twice", name)
		}
		seen[name] = true
	}
}

func TestWriteAtomicSetsPerm(t *testing.T) {
	dir := t.TempDir()

	if err := writeAtomic(openTestRoot(t, dir), "config.json", []byte("{}"), 0o640); err != nil {
		t.Fatalf("write: %v", err)
	}

	info, err := os.Stat(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o640 {
		t.Errorf("permissions %o, expected %o", got, 0o640)
	}
}

func TestWriteAtomicLeavesNoLeftovers(t *testing.T) {
	dir := t.TempDir()

	if err := writeAtomic(openTestRoot(t, dir), "config.json", []byte("{}"), securePerm); err != nil {
		t.Fatalf("write: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("reading the directory: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "config.json" {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("directory has %v, expected only config.json", names)
	}
}

func TestPermOfFallsBackToSecure(t *testing.T) {
	root := openTestRoot(t, t.TempDir())

	if got := permOf(root, "нет-такого"); got != securePerm {
		t.Errorf("permissions %o, expected %o for a nonexistent file", got, securePerm)
	}
}

func TestSyncDir(t *testing.T) {
	if err := syncDir(openTestRoot(t, t.TempDir())); err != nil {
		t.Errorf("fsync of the directory: %v", err)
	}
}
