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

// newStore separates the working and service directories: the backup must lie outside
// the directory that sing-box merges whole.
func newStore(t *testing.T) (*config.Store, string) {
	t.Helper()

	root := t.TempDir()
	cfgDir := filepath.Join(root, "sing-box")
	stateDir := filepath.Join(root, "metabox")

	for _, dir := range []string{cfgDir, stateDir} {
		if err := os.Mkdir(dir, 0o755); err != nil {
			t.Fatalf("directory %s: %v", dir, err)
		}
	}

	store, err := config.NewStore(cfgDir, configName, stateDir)
	if err != nil {
		t.Fatalf("store build: %v", err)
	}

	return store, cfgDir
}

func TestNewStoreRejectsServiceDirInsideConfigDir(t *testing.T) {
	dir := t.TempDir()

	tests := []struct {
		name       string
		serviceDir string
	}{
		{"same directory", dir},
		{"subdirectory", filepath.Join(dir, "metabox")},
		{"deeper subdirectory", filepath.Join(dir, "state", "metabox")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := config.NewStore(dir, configName, tt.serviceDir); err == nil {
				t.Error("layout accepted: the service merges the whole config directory")
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
		t.Errorf("neighbouring directory rejected: %v", err)
	}
}

func TestStateRoundTrip(t *testing.T) {
	store, _ := newStore(t)

	if _, err := store.ReadState(t.Context()); !errors.Is(err, config.ErrNoState) {
		t.Errorf("got %v, expected ErrNoState on a clean start", err)
	}

	want := []byte(`{"phase":"awaiting_confirm"}`)
	if err := store.WriteState(t.Context(), want); err != nil {
		t.Fatalf("writing state: %v", err)
	}

	got, err := store.ReadState(t.Context())
	if err != nil {
		t.Fatalf("reading state: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("read %q, wrote %q", got, want)
	}

	info, err := os.Stat(store.StatePath())
	if err != nil {
		t.Fatalf("stat of the state: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("permissions %o, expected 600: the state holds the same config", perm)
	}

	if err := store.ClearState(t.Context()); err != nil {
		t.Fatalf("state cleanup: %v", err)
	}
	if _, err := store.ReadState(t.Context()); !errors.Is(err, config.ErrNoState) {
		t.Errorf("got %v, expected ErrNoState after cleanup", err)
	}
	if err := store.ClearState(t.Context()); err != nil {
		t.Errorf("repeated cleanup gave an error: %v", err)
	}
}

func TestStateLandsOutsideConfigDir(t *testing.T) {
	store, cfgDir := newStore(t)

	if err := store.WriteState(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("writing state: %v", err)
	}

	entries, err := os.ReadDir(cfgDir)
	if err != nil {
		t.Fatalf("reading the config directory: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("the config directory got %d files: the service merges it whole", len(entries))
	}
}

func writeConfig(t *testing.T, dir, name string, data []byte, perm fs.FileMode) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(dir, name), data, perm); err != nil {
		t.Fatalf("preparing %s: %v", name, err)
	}
}

func readConfig(t *testing.T, dir string) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(dir, configName))
	if err != nil {
		t.Fatalf("reading the config: %v", err)
	}

	return data
}

func TestWriteThenRead(t *testing.T) {
	store, _ := newStore(t)
	want := []byte(`{"log":{"level":"info"}}`)

	if err := store.Write(t.Context(), want); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := store.Read(t.Context())
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("read %q, wrote %q", got, want)
	}
}

func TestReadMissingConfig(t *testing.T) {
	store, _ := newStore(t)

	if _, err := store.Read(t.Context()); !errors.Is(err, config.ErrNoConfig) {
		t.Errorf("got %v, expected ErrNoConfig: a missing config is a normal case", err)
	}
}

func TestReadMissingConfigDir(t *testing.T) {
	store, err := config.NewStore(filepath.Join(t.TempDir(), "нет-такого"), configName, t.TempDir())
	if err != nil {
		t.Fatalf("store creation: %v", err)
	}

	if _, err := store.Read(t.Context()); !errors.Is(err, config.ErrNoConfig) {
		t.Errorf("got %v, expected ErrNoConfig", err)
	}
}

func TestWriteKeepsExistingPerm(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o640)

	if err := store.Write(t.Context(), []byte(`{"dns":{}}`)); err != nil {
		t.Fatalf("write: %v", err)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o640 {
		t.Errorf("permissions %o, expected 640: the owner could have narrowed them deliberately", got)
	}
}

func TestWriteNewConfigIsPrivate(t *testing.T) {
	store, _ := newStore(t)

	if err := store.Write(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("write: %v", err)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("permissions %o, expected 600: the config holds user keys", got)
	}
}

// A failure before rename must leave the previous config untouched byte for byte.
func TestFailedWriteKeepsFileIntact(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("under root directory permissions do not block the write")
	}

	store, cfgDir := newStore(t)
	before := []byte(`{"outbounds":[{"type":"direct"}]}`)
	writeConfig(t, cfgDir, configName, before, 0o600)

	if err := os.Chmod(cfgDir, 0o500); err != nil {
		t.Fatalf("removing write permission: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(cfgDir, 0o700) })

	if err := store.Write(t.Context(), []byte(`{"сломано":`)); err == nil {
		t.Fatal("write into a write-protected directory succeeded")
	}

	if err := os.Chmod(cfgDir, 0o700); err != nil {
		t.Fatalf("restoring permissions: %v", err)
	}
	if after := readConfig(t, cfgDir); !bytes.Equal(after, before) {
		t.Errorf("config became %q, was %q", after, before)
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
		t.Errorf("got %s, expected %s", got, hex.EncodeToString(want[:]))
	}
}

func TestSumChangesAfterWrite(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	before, err := store.Sum(t.Context())
	if err != nil {
		t.Fatalf("sha256 before: %v", err)
	}

	if err := store.Write(t.Context(), []byte(`{"dns":{}}`)); err != nil {
		t.Fatalf("write: %v", err)
	}

	after, err := store.Sum(t.Context())
	if err != nil {
		t.Fatalf("sha256 after: %v", err)
	}
	if before == after {
		t.Error("sha256 did not change after writing other content")
	}
}

func TestBackupAndRestore(t *testing.T) {
	store, cfgDir := newStore(t)
	original := []byte(`{"route":{"final":"direct"}}`)
	writeConfig(t, cfgDir, configName, original, 0o640)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup: %v", err)
	}
	if err := store.Write(t.Context(), []byte(`{"route":{"final":"proxy"}}`)); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := store.Restore(t.Context()); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, original) {
		t.Errorf("after rollback %q, expected %q", got, original)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o640 {
		t.Errorf("permissions after rollback %o, expected 640", got)
	}
}

func TestBackupLandsOutsideConfigDir(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup: %v", err)
	}

	entries, err := os.ReadDir(cfgDir)
	if err != nil {
		t.Fatalf("reading the config directory: %v", err)
	}
	for _, entry := range entries {
		if entry.Name() != configName {
			t.Errorf("%q appeared in the config directory: the service merges it whole", entry.Name())
		}
	}
}

func TestBackupIsPrivate(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o644)

	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup: %v", err)
	}

	info, err := os.Stat(store.BackupPath())
	if err != nil {
		t.Fatalf("stat of the backup: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("backup permissions %o, expected 600: it holds the same keys as the config", got)
	}
}

func TestRestoreWithoutBackup(t *testing.T) {
	store, _ := newStore(t)

	if err := store.Restore(t.Context()); !errors.Is(err, config.ErrNoBackup) {
		t.Errorf("got %v, expected ErrNoBackup", err)
	}
}

// The owner deleted the config over SSH and applied a new one: the rollback of this apply
// must not return the deleted config from the backup of a previous transaction.
func TestBackupWithoutConfigDropsStaleBackup(t *testing.T) {
	tests := []struct {
		name string
		drop func(cfgDir string) error
	}{
		{
			name: "config and lists deleted",
			drop: func(cfgDir string) error {
				if err := os.Remove(filepath.Join(cfgDir, configName)); err != nil {
					return err
				}

				return os.RemoveAll(filepath.Join(cfgDir, "rule-sets"))
			},
		},
		{
			name: "no config directory at all",
			drop: os.RemoveAll,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, cfgDir := newStore(t)
			writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

			if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": []byte(`{"rules":[]}`)}, nil); err != nil {
				t.Fatalf("preparing the list: %v", err)
			}
			if err := store.Backup(t.Context()); err != nil {
				t.Fatalf("backup of the previous transaction: %v", err)
			}

			if err := tt.drop(cfgDir); err != nil {
				t.Fatal(err)
			}

			if err := store.Backup(t.Context()); !errors.Is(err, config.ErrNoConfig) {
				t.Fatalf("backup without a config: got %v, expected ErrNoConfig", err)
			}

			for _, path := range []string{store.BackupPath(), backupListsPath(store)} {
				if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
					t.Errorf("%s survived the config removal: %v", path, err)
				}
			}

			if err := store.Restore(t.Context()); !errors.Is(err, config.ErrNoBackup) {
				t.Errorf("rollback: got %v, expected ErrNoBackup", err)
			}
		})
	}
}

// The config is gone but the list files stay: the backup drops the deleted config and
// snapshots the lists, and the rollback returns the lists alone.
func TestBackupWithoutConfigKeepsLists(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"было":true}`), 0o600)

	original := []byte(`{"rules":[{"domain_suffix":["example.com"]}]}`)
	if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": original}, nil); err != nil {
		t.Fatalf("preparing the list: %v", err)
	}
	if err := store.Backup(t.Context()); err != nil {
		t.Fatalf("backup of the previous transaction: %v", err)
	}

	if err := os.Remove(filepath.Join(cfgDir, configName)); err != nil {
		t.Fatal(err)
	}

	if err := store.Backup(t.Context()); !errors.Is(err, config.ErrNoConfig) {
		t.Fatalf("backup without a config: got %v, expected ErrNoConfig", err)
	}
	if _, err := os.Stat(store.BackupPath()); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("the deleted config survived in the backup: %v", err)
	}

	changed := map[string][]byte{
		"my.json":    []byte(`{"rules":[]}`),
		"extra.json": []byte(`{"rules":[]}`),
	}
	if err := store.WriteLists(t.Context(), changed, nil); err != nil {
		t.Fatalf("lists edit: %v", err)
	}
	written := []byte(`{"стало":true}`)
	if err := store.Write(t.Context(), written); err != nil {
		t.Fatalf("config write: %v", err)
	}

	if err := store.Restore(t.Context()); !errors.Is(err, config.ErrListsOnly) {
		t.Fatalf("rollback: got %v, expected ErrListsOnly", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, written) {
		t.Errorf("config after rollback: %q, expected the written one in place", got)
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

// A failed snapshot of the lists without a config is a backup failure, not "no config":
// the apply must stop before the write.
func TestBackupWithoutConfigListsFailure(t *testing.T) {
	store, _ := newStore(t)

	if err := store.WriteLists(t.Context(), map[string][]byte{"my.json": []byte("{}")}, nil); err != nil {
		t.Fatalf("preparing the list: %v", err)
	}

	// A file in place of the service directory: the snapshot has nowhere to go.
	serviceDir := filepath.Dir(store.BackupPath())
	if err := os.RemoveAll(serviceDir); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(serviceDir, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	err := store.Backup(t.Context())
	if err == nil || errors.Is(err, config.ErrNoConfig) {
		t.Errorf("got %v, expected a backup failure", err)
	}
}

// The first start: neither a config nor a backup. Backup answers ErrNoConfig and creates
// nothing: nothing to take.
func TestBackupWithoutConfigOrBackup(t *testing.T) {
	t.Run("service directory exists", func(t *testing.T) {
		store, _ := newStore(t)

		if err := store.Backup(t.Context()); !errors.Is(err, config.ErrNoConfig) {
			t.Fatalf("got %v, expected ErrNoConfig", err)
		}

		entries, err := os.ReadDir(filepath.Dir(store.BackupPath()))
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 0 {
			t.Errorf("something appeared in the service directory: %v", entries)
		}
	})

	t.Run("service directory is absent", func(t *testing.T) {
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
			t.Fatalf("got %v, expected ErrNoConfig", err)
		}
		if _, err := os.Stat(stateDir); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("service directory created without a backup: %v", err)
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
		t.Fatalf("candidate layout: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, configName))
	if err != nil {
		t.Fatalf("reading the candidate: %v", err)
	}
	if !bytes.Equal(got, candidate) {
		t.Errorf("candidate %q, expected %q", got, candidate)
	}

	if _, err := os.Stat(filepath.Join(dst, "10-dns.json")); err != nil {
		t.Errorf("neighbouring .json did not move: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "notes.txt")); !errors.Is(err, fs.ErrNotExist) {
		t.Error("non-.json moved into the candidate: the service does not read it")
	}
}

// Subdirectories go into the candidate whole: check runs with -D on it, and a file the
// config refers to by a relative path must be found where
// the service will find it.
func TestStageCandidateCopiesSubdirectories(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte(`{"старое":true}`), 0o600)

	nested := filepath.Join(cfgDir, "rule-sets", "local")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatalf("preparing the subdirectory: %v", err)
	}
	ruleSet := []byte("domain:example.org")
	if err := os.WriteFile(filepath.Join(nested, "my.txt"), ruleSet, 0o600); err != nil {
		t.Fatalf("preparing the rule set file: %v", err)
	}

	dst := t.TempDir()
	if err := store.StageCandidate(t.Context(), dst, []byte(`{"новое":true}`), nil, nil); err != nil {
		t.Fatalf("candidate layout: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "rule-sets", "local", "my.txt"))
	if err != nil {
		t.Fatalf("subdirectory file did not move: %v", err)
	}
	if !bytes.Equal(got, ruleSet) {
		t.Errorf("got %q, expected %q", got, ruleSet)
	}
}

func TestStageCandidateSkipsSymlinkOutside(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	secret := filepath.Join(t.TempDir(), "secret.json")
	if err := os.WriteFile(secret, []byte(`{"ключ":"чужой"}`), 0o600); err != nil {
		t.Fatalf("preparing a foreign file: %v", err)
	}
	if err := os.Symlink(secret, filepath.Join(cfgDir, "link.json")); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	dst := t.TempDir()
	if err := store.StageCandidate(t.Context(), dst, []byte(`{"новое":true}`), nil, nil); err == nil {
		t.Fatal("symlink outward was laid out silently: the daemon runs as root")
	}

	if _, err := os.Stat(filepath.Join(dst, "link.json")); !errors.Is(err, fs.ErrNotExist) {
		t.Error("content of a foreign file went into the candidate")
	}
}

// A symlink inside the directory is read and merged by the service, so the candidate must
// contain it, otherwise what is checked is not what will run.
func TestStageCandidateFollowsSymlinkInside(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)
	writeConfig(t, cfgDir, "10-dns.conf", []byte(`{"dns":{}}`), 0o600)

	if err := os.Symlink("10-dns.conf", filepath.Join(cfgDir, "10-dns.json")); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	dst := t.TempDir()
	if err := store.StageCandidate(t.Context(), dst, []byte(`{"новое":true}`), nil, nil); err != nil {
		t.Fatalf("candidate layout: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "10-dns.json"))
	if err != nil {
		t.Fatalf("reading the symlink neighbour: %v", err)
	}
	if !bytes.Equal(got, []byte(`{"dns":{}}`)) {
		t.Errorf("got %q, expected the symlink target content", got)
	}
}

func TestStageCandidateLeavesWorkingDirIntact(t *testing.T) {
	store, cfgDir := newStore(t)
	original := []byte(`{"старое":true}`)
	writeConfig(t, cfgDir, configName, original, 0o600)

	if err := store.StageCandidate(t.Context(), t.TempDir(), []byte(`{"новое":true}`), nil, nil); err != nil {
		t.Fatalf("candidate layout: %v", err)
	}

	if got := readConfig(t, cfgDir); !bytes.Equal(got, original) {
		t.Errorf("working config became %q, was %q", got, original)
	}
}

// Store is the only owner of the file, and concurrent access is closed by its
// methods. The test catches a race under -race and does not check the result.
func TestConcurrentAccess(t *testing.T) {
	store, cfgDir := newStore(t)
	writeConfig(t, cfgDir, configName, []byte("{}"), 0o600)

	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()

			if err := store.Write(t.Context(), fmt.Appendf(nil, `{"n":%d}`, i)); err != nil {
				t.Errorf("write: %v", err)
			}
			if _, err := store.Sum(t.Context()); err != nil {
				t.Errorf("sha256: %v", err)
			}
			if _, err := store.Read(t.Context()); err != nil {
				t.Errorf("reading: %v", err)
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
		t.Errorf("got %v, expected context.Canceled", err)
	}
	if got := readConfig(t, cfgDir); !bytes.Equal(got, []byte("{}")) {
		t.Errorf("config became %q with a cancelled context", got)
	}
}

// A daemon started not by the init script does not find the service directory: the first
// Apply must create it and not fail on writing the state or the backup.
func TestServiceDirIsCreatedOnDemand(t *testing.T) {
	tests := []struct {
		name  string
		write func(t *testing.T, store *config.Store) error
		file  string
	}{
		{
			name:  "state",
			write: func(t *testing.T, store *config.Store) error { return store.WriteState(t.Context(), []byte("{}")) },
			file:  "apply.json",
		},
		{
			name:  "backup",
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
				t.Fatalf("write without a service directory: %v", err)
			}

			for _, dir := range []string{filepath.Dir(stateDir), stateDir} {
				info, err := os.Stat(dir)
				if err != nil {
					t.Fatalf("directory %s not created: %v", dir, err)
				}
				if perm := info.Mode().Perm(); perm != 0o700 {
					t.Errorf("permissions of %s are %o, expected 700: it holds user keys", dir, perm)
				}
			}

			if _, err := os.Stat(filepath.Join(stateDir, tt.file)); err != nil {
				t.Errorf("file %s not written: %v", tt.file, err)
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
		t.Fatalf("no directory yet, but reading gave %v", err)
	}

	want := []byte(`{"lists":{}}`)
	if err := store.WriteRuleSets(t.Context(), want); err != nil {
		t.Fatalf("write without a service directory: %v", err)
	}

	got, err := store.ReadRuleSets(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(got, want) {
		t.Errorf("read %s, wrote %s", got, want)
	}

	info, err := os.Stat(filepath.Join(stateDir, "rule-sets.json"))
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Errorf("permissions %v, expected 0600", info.Mode().Perm())
	}
}

func TestAuthFileIsReadableByRootOnly(t *testing.T) {
	store, cfgDir := newStore(t)

	if _, err := store.ReadAuth(t.Context()); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("read before a password was set: got %v, want ErrNotExist", err)
	}

	want := []byte(`{"algorithm":"pbkdf2-sha256"}`)
	if err := store.WriteAuth(t.Context(), want); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := store.ReadAuth(t.Context())
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !bytes.Equal(got, want) {
		t.Errorf("read %q, want %q", got, want)
	}

	info, err := os.Stat(filepath.Join(filepath.Dir(cfgDir), "metabox", "auth.json"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("mode %o, want 600", perm)
	}
}

func TestSessionFileIsReadableByRootOnly(t *testing.T) {
	store, cfgDir := newStore(t)

	if _, err := store.ReadSessions(t.Context()); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("read before a login: got %v, want ErrNotExist", err)
	}

	want := []byte(`{"sessions":[]}`)
	if err := store.WriteSessions(t.Context(), want); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := store.ReadSessions(t.Context())
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !bytes.Equal(got, want) {
		t.Errorf("read %q, want %q", got, want)
	}

	info, err := os.Stat(filepath.Join(filepath.Dir(cfgDir), "metabox", "sessions.json"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("mode %o, want 600", perm)
	}
}

func TestMCPFileIsReadableByRootOnly(t *testing.T) {
	store, cfgDir := newStore(t)

	if _, err := store.ReadMCP(t.Context()); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("read before MCP was enabled: got %v, want ErrNotExist", err)
	}

	want := []byte(`{"hash":"AAAA"}`)
	if err := store.WriteMCP(t.Context(), want); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := store.ReadMCP(t.Context())
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !bytes.Equal(got, want) {
		t.Errorf("read %q, want %q", got, want)
	}

	info, err := os.Stat(filepath.Join(filepath.Dir(cfgDir), "metabox", "mcp.json"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("mode %o, want 600", perm)
	}
}

func TestTLSFilesAreReadableByRootOnly(t *testing.T) {
	store, cfgDir := newStore(t)

	if _, err := store.ReadTLS(t.Context(), "ca.crt"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("read before a certificate was issued: got %v, want ErrNotExist", err)
	}

	want := []byte("-----BEGIN CERTIFICATE-----\n")
	if err := store.WriteTLS(t.Context(), "ca.crt", want); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := store.ReadTLS(t.Context(), "ca.crt")
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !bytes.Equal(got, want) {
		t.Errorf("read %q, want %q", got, want)
	}

	dir := filepath.Join(filepath.Dir(cfgDir), "metabox", "tls")

	info, err := os.Stat(filepath.Join(dir, "ca.crt"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("file mode %o, want 600", perm)
	}

	dirInfo, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stat dir: %v", err)
	}

	if perm := dirInfo.Mode().Perm(); perm != 0o700 {
		t.Errorf("dir mode %o, want 700", perm)
	}

	if _, err := store.ReadTLS(t.Context(), "../auth.json"); err == nil {
		t.Error("a name outside the tls directory was read")
	}
}
