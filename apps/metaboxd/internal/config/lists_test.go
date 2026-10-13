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
		t.Fatalf("writing lists: %v", err)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading lists: %v", err)
	}
	if !bytes.Equal(files["my.json"], put["my.json"]) {
		t.Errorf("list came back as %q", files["my.json"])
	}

	sums, err := store.ListSums(t.Context())
	if err != nil {
		t.Fatalf("list sums: %v", err)
	}
	if sums["my.json"] != config.Sum(put["my.json"]) {
		t.Errorf("sum %q did not match the content", sums["my.json"])
	}

	if err := store.WriteLists(t.Context(), nil, []string{"my.json"}); err != nil {
		t.Fatalf("deleting a list: %v", err)
	}

	files, err = store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading after deletion: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("files remained after deletion: %v", files)
	}
}

func TestListsEmptyWithoutDir(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading without a directory: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("files found without a directory: %v", files)
	}

	// Deletion without a directory is an empty action, not a failure.
	if err := store.WriteLists(t.Context(), nil, []string{"нет.json"}); err != nil {
		t.Fatalf("deletion without a directory: %v", err)
	}
}

// A rollback must return both the config and the list files: a changed one byte for byte,
// one that appeared after the backup is removed.
func TestRestoreBringsListsBack(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

	original := []byte(`{"rules":[{"domain_suffix":["example.com"]}]}`)
	if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": original}, nil); err != nil {
		t.Fatalf("preparing the list: %v", err)
	}

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup: %v", err)
	}

	changed := map[string][]byte{
		"my.json":    []byte(`{"rules":[]}`),
		"extra.json": []byte(`{"rules":[]}`),
	}
	if err := store.WriteLists(t.Context(), changed, nil); err != nil {
		t.Fatalf("lists edit: %v", err)
	}
	if err := store.Write(t.Context(), []byte(`{"стало":true}`)); err != nil {
		t.Fatalf("config edit: %v", err)
	}

	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("restore: %v", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, []byte(`{"было":true}`)) {
		t.Errorf("config after rollback: %q", got)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading lists after rollback: %v", err)
	}
	if !bytes.Equal(files["my.json"], original) {
		t.Errorf("list after rollback: %q, expected the original", files["my.json"])
	}
	if _, ok := files["extra.json"]; ok {
		t.Error("a file that appeared after the backup survived the rollback")
	}
}

// A backup without a lists snapshot (from a previous daemon version) leaves the directory untouched on rollback.
func TestRestoreLeavesListsWithoutSnapshot(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup: %v", err)
	}

	// The previous daemon left no snapshot.
	if err := os.RemoveAll(backupListsPath(store)); err != nil {
		t.Fatal(err)
	}

	if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": []byte("{}")}, nil); err != nil {
		t.Fatalf("list after the backup: %v", err)
	}

	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("restore: %v", err)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := files["my.json"]; !ok {
		t.Error("rollback without a snapshot touched the lists directory")
	}
}

func backupListsPath(store *config.Store) string {
	return filepath.Join(filepath.Dir(store.BackupPath()), "rule-sets.backup")
}

// The candidate is assembled with the transaction changes: put lies over, remove does not
// get into the candidate, and the working directory stays untouched.
func TestStageCandidateOverlaysLists(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	if err := store.WriteLists(t.Context(), map[string][]byte{
		"old.json":  []byte(`{"old":true}`),
		"kept.json": []byte(`{"kept":true}`),
	}, nil); err != nil {
		t.Fatalf("preparing lists: %v", err)
	}

	dst := t.TempDir()
	put := map[string][]byte{"new.json": []byte(`{"new":true}`)}

	if err := store.StageCandidate(t.Context(), dst, []byte("{}"), put, []string{"old.json"}); err != nil {
		t.Fatalf("candidate layout: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dst, "rule-sets", "old.json")); !errors.Is(err, fs.ErrNotExist) {
		t.Error("the list to delete got into the candidate")
	}

	got, err := os.ReadFile(filepath.Join(dst, "rule-sets", "new.json"))
	if err != nil {
		t.Fatalf("the new list is absent from the candidate: %v", err)
	}
	if !bytes.Equal(got, put["new.json"]) {
		t.Errorf("new list in the candidate: %q", got)
	}

	if _, err := os.Stat(filepath.Join(dst, "rule-sets", "kept.json")); err != nil {
		t.Errorf("the untouched list did not move: %v", err)
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := files["old.json"]; !ok || len(files) != 2 {
		t.Errorf("candidate layout touched the working directory: %v", files)
	}
}

// foreignLists are the lists subdirectory files the daemon does not manage:
// the owner's compiled set and a leftover of a broken write.
var foreignLists = map[string][]byte{"geo.srs": []byte("binary"), ".metabox-123": []byte(`{"rules":[]}`)}

func writeForeignLists(t *testing.T, store *config.Store) {
	t.Helper()

	for name, data := range foreignLists {
		if err := os.WriteFile(filepath.Join(store.ListsPath(), name), data, 0o600); err != nil {
			t.Fatalf("foreign file %s: %v", name, err)
		}
	}
}

func TestListsSkipForeignNames(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	own := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	if err := store.WriteLists(t.Context(), own, nil); err != nil {
		t.Fatalf("writing lists: %v", err)
	}
	writeForeignLists(t, store)

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading lists: %v", err)
	}
	if len(files) != 1 || files["my.json"] == nil {
		t.Errorf("reading returned %q, expected only own files", files)
	}

	sums, err := store.ListSums(t.Context())
	if err != nil {
		t.Fatalf("list sums: %v", err)
	}
	if len(sums) != 1 || sums["my.json"] != config.Sum(own["my.json"]) {
		t.Errorf("sums %v, expected only own files", sums)
	}
}

// A rollback returns its own files and leaves foreign ones that appeared after the backup in
// place: the daemon did not write them and has no right to remove them.
func TestRestoreKeepsForeignLists(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	own := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	if err := store.WriteLists(t.Context(), own, nil); err != nil {
		t.Fatalf("writing lists: %v", err)
	}

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup: %v", err)
	}

	writeForeignLists(t, store)

	if err := store.WriteLists(t.Context(), map[string][]byte{"late.json": []byte("{}")}, []string{"my.json"}); err != nil {
		t.Fatalf("lists edit after the backup: %v", err)
	}

	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	for name, want := range foreignLists {
		got, err := os.ReadFile(filepath.Join(store.ListsPath(), name))
		if err != nil || !bytes.Equal(got, want) {
			t.Errorf("foreign file %s after rollback: %q, error %v", name, got, err)
		}
	}

	files, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading after rollback: %v", err)
	}
	if len(files) != 1 || !bytes.Equal(files["my.json"], own["my.json"]) {
		t.Errorf("own files after rollback %q, expected %q", files, own)
	}
}
