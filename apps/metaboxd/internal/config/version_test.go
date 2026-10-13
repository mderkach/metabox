package config

import (
	"bytes"
	"errors"
	"io/fs"
	"maps"
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
			t.Fatalf("creating %s: %v", d, err)
		}
	}

	store, err := NewStore(cfgDir, "config.json", serviceDir)
	if err != nil {
		t.Fatalf("store creation: %v", err)
	}

	return store
}

func TestSaveVersionNumbersMonotonically(t *testing.T) {
	store := newVersionStore(t)

	for i := 1; i <= 3; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("saving version %d: %v", i, err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("versions in history %d, expected 3", len(got))
	}

	// Newest first: the history screen shows the latest edits on top.
	want := []int{3, 2, 1}
	for i, version := range got {
		if version.ID != want[i] {
			t.Errorf("version at position %d has number %d, expected %d", i, version.ID, want[i])
		}

		if version.Sum == "" || version.Size == 0 {
			t.Errorf("version %d without a fingerprint or size: %+v", version.ID, version)
		}
	}
}

func TestVersionsTrimmedToLimit(t *testing.T) {
	store := newVersionStore(t)

	total := maxVersions + 4
	for i := 1; i <= total; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("saving version %d: %v", i, err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if len(got) != maxVersions {
		t.Fatalf("versions in history %d, expected %d", len(got), maxVersions)
	}

	if got[0].ID != total {
		t.Errorf("newest version %d, expected %d", got[0].ID, total)
	}

	// Numbers are not reused: deleting old ones does not shift the counter.
	if oldest := got[len(got)-1].ID; oldest != total-maxVersions+1 {
		t.Errorf("oldest version %d, expected %d", oldest, total-maxVersions+1)
	}

	// List snapshots are trimmed together with versions: a directory for each
	// kept one and not one more.
	entries, err := os.ReadDir(store.VersionsPath())
	if err != nil {
		t.Fatalf("reading the history directory: %v", err)
	}

	sidecars := 0
	for _, entry := range entries {
		if _, ok := versionListsID(entry.Name()); ok && entry.IsDir() {
			sidecars++
		}
	}

	if sidecars != maxVersions {
		t.Errorf("list snapshots %d, expected %d", sidecars, maxVersions)
	}
}

func TestReadVersionReturnsBytesAsIs(t *testing.T) {
	store := newVersionStore(t)

	// Formatting and key order are preserved: the daemon does not parse the config.
	raw := []byte("{\n  \"outbounds\": [],\n  \"log\": {\"level\": \"error\"}\n}\n")
	if err := store.SaveVersion(t.Context(), raw); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	got, err := store.ReadVersion(t.Context(), 1)
	if err != nil {
		t.Fatalf("reading a version: %v", err)
	}

	if string(got) != string(raw) {
		t.Errorf("version content: got %q, expected %q", got, raw)
	}
}

func TestReadVersionUnknown(t *testing.T) {
	store := newVersionStore(t)

	if _, err := store.ReadVersion(t.Context(), 42); !errors.Is(err, ErrNoVersion) {
		t.Errorf("reading an unknown version: got %v, expected ErrNoVersion", err)
	}
}

func TestVersionsEmptyHistory(t *testing.T) {
	store := newVersionStore(t)

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading an empty history: %v", err)
	}

	if len(got) != 0 {
		t.Errorf("versions in an empty history %d, expected 0", len(got))
	}
}

// The history directory lies outside the config directory: the service starts in directory
// mode and would merge the versions into the working configuration.
func TestVersionsStoredOutsideConfigDir(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	// The config directory has only the lists subdirectory, and in it exactly the working
	// file: the snapshot lies in the history, not next to the config.
	entries, err := os.ReadDir(store.dir)
	if err != nil {
		t.Fatalf("reading the config directory: %v", err)
	}

	if len(entries) != 1 || entries[0].Name() != listsDirName {
		t.Errorf("files appeared in the config directory: %v", entries)
	}

	lists, err := os.ReadDir(store.ListsPath())
	if err != nil {
		t.Fatalf("reading the lists directory: %v", err)
	}

	if len(lists) != 1 {
		t.Errorf("files appeared in the lists directory: %v", lists)
	}

	if _, err := os.Stat(store.VersionsPath()); err != nil {
		t.Errorf("no history directory: %v", err)
	}
}

// Foreign files in the service directory do not break the history.
func TestVersionsIgnoresForeignNames(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	foreign := filepath.Join(store.VersionsPath(), "readme.txt")
	if err := os.WriteFile(foreign, []byte("не версия"), securePerm); err != nil {
		t.Fatalf("writing a foreign file: %v", err)
	}

	// A directory with the snapshot suffix but without a number is also foreign.
	foreignDir := filepath.Join(store.VersionsPath(), "notes"+versionListsSuffix)
	if err := os.Mkdir(foreignDir, secureDirPerm); err != nil {
		t.Fatalf("creating a foreign directory: %v", err)
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if len(got) != 1 {
		t.Errorf("versions in history %d, expected 1", len(got))
	}

	// Trimming leaves foreign things alone: it removes only snapshots with a number.
	if err := store.SaveVersion(t.Context(), []byte(`{"v":2}`)); err != nil {
		t.Fatalf("saving the second version: %v", err)
	}

	for _, path := range []string{foreign, foreignDir} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("foreign %s vanished after saving: %v", path, err)
		}
	}
}

// Before the first apply the service directory may be absent on the device:
// reading the history must return empty, not a failure.
func TestVersionsWithoutServiceDir(t *testing.T) {
	dir := t.TempDir()
	cfgDir := filepath.Join(dir, "config")

	if err := os.Mkdir(cfgDir, 0o700); err != nil {
		t.Fatalf("creating %s: %v", cfgDir, err)
	}

	store, err := NewStore(cfgDir, "config.json", filepath.Join(dir, "нет-такого"))
	if err != nil {
		t.Fatalf("store creation: %v", err)
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history without a service directory: %v", err)
	}

	if got == nil {
		t.Error("history returned as nil: in JSON that is null, not an empty list")
	}

	if len(got) != 0 {
		t.Errorf("versions %d, expected 0", len(got))
	}

	if _, err := store.ReadVersion(t.Context(), 1); !errors.Is(err, ErrNoVersion) {
		t.Errorf("reading a version: got %v, expected ErrNoVersion", err)
	}

	// Saving creates the directory itself.
	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	if got, err := store.Versions(t.Context()); err != nil || len(got) != 1 {
		t.Errorf("after saving versions %d, error %v", len(got), err)
	}
}

// A repeated apply of the same config does not clutter the history: otherwise ten
// identical applies would push out everything that was in it.
func TestSaveVersionSkipsDuplicate(t *testing.T) {
	store := newVersionStore(t)
	same := []byte(`{"log":{"level":"error"}}`)

	for range 3 {
		if err := store.SaveVersion(t.Context(), same); err != nil {
			t.Fatalf("saving a version: %v", err)
		}
	}

	got, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("versions %d, expected 1", len(got))
	}

	// Different content is still added.
	if err := store.SaveVersion(t.Context(), []byte(`{"log":{"level":"warn"}}`)); err != nil {
		t.Fatalf("saving another version: %v", err)
	}

	if got, err := store.Versions(t.Context()); err != nil || len(got) != 2 {
		t.Errorf("versions %d, error %v, expected 2", len(got), err)
	}
}

// writeVersionLists brings the working lists directory to files: extra files
// are deleted, the rest are written.
func writeVersionLists(t *testing.T, store *Store, files map[string][]byte) {
	t.Helper()

	current, err := store.ReadLists(t.Context())
	if err != nil {
		t.Fatalf("reading lists: %v", err)
	}

	var remove []string

	for name := range current {
		if _, ok := files[name]; !ok {
			remove = append(remove, name)
		}
	}

	if err := store.WriteLists(t.Context(), files, remove); err != nil {
		t.Fatalf("writing lists: %v", err)
	}
}

// A version stores the lists at the time of saving: a later edit of the working
// files does not change the snapshot.
func TestSaveVersionSnapshotsLists(t *testing.T) {
	store := newVersionStore(t)
	before := map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["a"]}]}`)}
	writeVersionLists(t, store, before)

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	writeVersionLists(t, store, map[string][]byte{
		"my.json":  []byte(`{"rules":[{"domain":["b"]}]}`),
		"new.json": []byte(`{"rules":[]}`),
	})

	got, err := store.ReadVersionLists(t.Context(), 1)
	if err != nil {
		t.Fatalf("reading the list snapshot: %v", err)
	}

	if !maps.EqualFunc(got, before, bytes.Equal) {
		t.Errorf("list snapshot: got %q, expected %q", got, before)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	want := ListsEtag(map[string]string{"my.json": Sum(before["my.json"])})
	if len(versions) != 1 || versions[0].ListsSum != want {
		t.Errorf("snapshot fingerprint: got %+v, expected lists_sum %q", versions, want)
	}
}

// "There were no lists" is also a state: a rollback to such a version removes lists
// that appeared later.
func TestSaveVersionSnapshotsEmptyLists(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	got, err := store.ReadVersionLists(t.Context(), 1)
	if err != nil {
		t.Fatalf("reading an empty snapshot: %v", err)
	}

	if got == nil || len(got) != 0 {
		t.Errorf("empty snapshot: got %v, expected an empty map", got)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if want := ListsEtag(map[string]string{}); len(versions) != 1 || versions[0].ListsSum != want {
		t.Errorf("fingerprint of an empty snapshot: got %+v, expected %q", versions, want)
	}
}

// writeLegacyVersion puts a version the way the daemon saved it before list
// snapshots: one file without a neighbouring directory.
func writeLegacyVersion(t *testing.T, store *Store, id int, data []byte) {
	t.Helper()

	if err := os.MkdirAll(store.VersionsPath(), secureDirPerm); err != nil {
		t.Fatalf("history directory: %v", err)
	}

	if err := os.WriteFile(filepath.Join(store.VersionsPath(), versionName(id)), data, securePerm); err != nil {
		t.Fatalf("writing an old version: %v", err)
	}
}

// A version saved before list snapshots is read as before, and its snapshot
// gives a separate refusal: the restore then does not touch the lists.
func TestReadVersionListsLegacy(t *testing.T) {
	store := newVersionStore(t)
	raw := []byte(`{"log":{}}`)
	writeLegacyVersion(t, store, 1, raw)

	if _, err := store.ReadVersionLists(t.Context(), 1); !errors.Is(err, ErrNoVersionLists) {
		t.Errorf("snapshot of an old version: got %v, expected ErrNoVersionLists", err)
	}

	data, err := store.ReadVersion(t.Context(), 1)
	if err != nil || !bytes.Equal(data, raw) {
		t.Errorf("content of an old version: got %q, error %v", data, err)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if len(versions) != 1 {
		t.Fatalf("versions %d, expected 1", len(versions))
	}

	if versions[0].ListsSum != "" {
		t.Errorf("the old version has snapshot fingerprint %q, expected empty", versions[0].ListsSum)
	}
}

func TestReadVersionListsUnknown(t *testing.T) {
	t.Run("no history", func(t *testing.T) {
		store := newVersionStore(t)

		if _, err := store.ReadVersionLists(t.Context(), 1); !errors.Is(err, ErrNoVersion) {
			t.Errorf("got %v, expected ErrNoVersion", err)
		}
	})

	t.Run("no number", func(t *testing.T) {
		store := newVersionStore(t)

		if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
			t.Fatalf("saving a version: %v", err)
		}

		if _, err := store.ReadVersionLists(t.Context(), 42); !errors.Is(err, ErrNoVersion) {
			t.Errorf("got %v, expected ErrNoVersion", err)
		}
	})

	// A snapshot without a version file is an orphan of a broken write, not a version.
	t.Run("orphan without a version file", func(t *testing.T) {
		store := newVersionStore(t)

		if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
			t.Fatalf("saving a version: %v", err)
		}

		if err := os.Mkdir(filepath.Join(store.VersionsPath(), versionListsName(2)), secureDirPerm); err != nil {
			t.Fatalf("creating an orphan: %v", err)
		}

		if _, err := store.ReadVersionLists(t.Context(), 2); !errors.Is(err, ErrNoVersion) {
			t.Errorf("got %v, expected ErrNoVersion", err)
		}
	})
}

// A repeat is the same config and the same set of lists. A changed list gives a new
// version with the previous config; an old version without a snapshot equals only an empty
// set.
func TestSaveVersionDedupesConfigAndLists(t *testing.T) {
	a := map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["a"]}]}`)}
	b := map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["b"]}]}`)}
	renamed := map[string][]byte{"other.json": a["my.json"]}

	tests := []struct {
		name        string
		legacy      bool
		firstCfg    string
		firstLists  map[string][]byte
		secondCfg   string
		secondLists map[string][]byte
		want        int
	}{
		{"same config and same lists", false, "{}", a, "{}", a, 1},
		{"same config without lists", false, "{}", nil, "{}", nil, 1},
		{"same config, different list content", false, "{}", a, "{}", b, 2},
		{"same config, list renamed", false, "{}", a, "{}", renamed, 2},
		{"same config, list deleted", false, "{}", a, "{}", nil, 2},
		{"different config, same lists", false, "{}", a, `{"v":2}`, a, 2},
		{"old version, no lists", true, "{}", nil, "{}", nil, 1},
		{"old version, lists appeared", true, "{}", nil, "{}", a, 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newVersionStore(t)

			if tt.legacy {
				writeLegacyVersion(t, store, 1, []byte(tt.firstCfg))
			} else {
				writeVersionLists(t, store, tt.firstLists)

				if err := store.SaveVersion(t.Context(), []byte(tt.firstCfg)); err != nil {
					t.Fatalf("saving the first version: %v", err)
				}
			}

			writeVersionLists(t, store, tt.secondLists)

			if err := store.SaveVersion(t.Context(), []byte(tt.secondCfg)); err != nil {
				t.Fatalf("saving the second version: %v", err)
			}

			got, err := store.Versions(t.Context())
			if err != nil {
				t.Fatalf("reading history: %v", err)
			}

			if len(got) != tt.want {
				t.Errorf("versions %d, expected %d", len(got), tt.want)
			}
		})
	}
}

// An unchanged list file in neighbouring snapshots is the same entry on
// disk: the history must not pay the full size of the lists for every config
// edit.
func TestSaveVersionLinksUnchangedLists(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	for i := 1; i <= 2; i++ {
		if err := store.SaveVersion(t.Context(), []byte(`{"v":`+strconv.Itoa(i)+`}`)); err != nil {
			t.Fatalf("saving version %d: %v", i, err)
		}
	}

	first, err := os.Stat(filepath.Join(store.VersionsPath(), versionListsName(1), "my.json"))
	if err != nil {
		t.Fatalf("snapshot of the first version: %v", err)
	}

	second, err := os.Stat(filepath.Join(store.VersionsPath(), versionListsName(2), "my.json"))
	if err != nil {
		t.Fatalf("snapshot of the second version: %v", err)
	}

	if !os.SameFile(first, second) {
		t.Error("unchanged list was copied, not hard-linked")
	}

	// A link does not make snapshots dependent: trimming the older one leaves the younger.
	if err := os.RemoveAll(filepath.Join(store.VersionsPath(), versionListsName(1))); err != nil {
		t.Fatalf("deleting the first snapshot: %v", err)
	}

	got, err := store.ReadVersionLists(t.Context(), 2)
	if err != nil || string(got["my.json"]) != `{"rules":[]}` {
		t.Errorf("snapshot of the second version after deleting the first: %q, error %v", got, err)
	}
}

// An orphan of a broken write, a snapshot without a version file and a draft, does not
// get mixed into the next version and does not pile up in the history.
func TestSaveVersionReplacesOrphanSidecar(t *testing.T) {
	store := newVersionStore(t)

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	orphans := []string{versionListsName(2), versionListsStaging, versionListsName(50)}
	for _, name := range orphans {
		dir := filepath.Join(store.VersionsPath(), name)
		if err := os.Mkdir(dir, secureDirPerm); err != nil {
			t.Fatalf("creating orphan %s: %v", name, err)
		}

		if err := os.WriteFile(filepath.Join(dir, "stale.json"), []byte("{}"), securePerm); err != nil {
			t.Fatalf("orphan file %s: %v", name, err)
		}
	}

	current := map[string][]byte{"my.json": []byte(`{"rules":[]}`)}
	writeVersionLists(t, store, current)

	if err := store.SaveVersion(t.Context(), []byte(`{"v":2}`)); err != nil {
		t.Fatalf("saving a version over an orphan: %v", err)
	}

	got, err := store.ReadVersionLists(t.Context(), 2)
	if err != nil {
		t.Fatalf("reading the snapshot: %v", err)
	}

	if !maps.EqualFunc(got, current, bytes.Equal) {
		t.Errorf("snapshot over an orphan: got %q, expected %q", got, current)
	}

	for _, name := range []string{versionListsStaging, versionListsName(50)} {
		if _, err := os.Stat(filepath.Join(store.VersionsPath(), name)); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("orphan %s remained: %v", name, err)
		}
	}
}

// The snapshot holds the same as the config and lists: access is for the owner only, even
// if the owner opened the working file wider.
func TestVersionListsArePrivate(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	if err := os.Chmod(filepath.Join(store.ListsPath(), "my.json"), 0o644); err != nil {
		t.Fatalf("permissions of the working file: %v", err)
	}

	if err := store.SaveVersion(t.Context(), []byte("{}")); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	dir := filepath.Join(store.VersionsPath(), versionListsName(1))

	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("snapshot directory: %v", err)
	}

	if perm := info.Mode().Perm(); perm != secureDirPerm {
		t.Errorf("snapshot directory permissions %o, expected %o", perm, secureDirPerm)
	}

	info, err = os.Stat(filepath.Join(dir, "my.json"))
	if err != nil {
		t.Fatalf("snapshot file: %v", err)
	}

	if perm := info.Mode().Perm(); perm != securePerm {
		t.Errorf("snapshot file permissions %o, expected %o", perm, securePerm)
	}
}

// A version without a snapshot is not issued as whole: a snapshot failure leaves the history
// as it was, and there is no version file under the new number.
func TestSaveVersionFailedSnapshotLeavesNoVersion(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root is not restricted by directory permissions")
	}

	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("saving the first version: %v", err)
	}

	// An orphan that cannot be removed is not bypassed by the snapshot: cleaning its directory
	// fails, and the history directory stays open for writing.
	locked := filepath.Join(store.VersionsPath(), versionListsName(2), "locked")
	if err := os.MkdirAll(locked, secureDirPerm); err != nil {
		t.Fatalf("orphan directory: %v", err)
	}

	if err := os.WriteFile(filepath.Join(locked, "stale.json"), []byte("{}"), securePerm); err != nil {
		t.Fatalf("orphan file: %v", err)
	}

	if err := os.Chmod(locked, 0o500); err != nil {
		t.Fatalf("orphan permissions: %v", err)
	}

	t.Cleanup(func() { _ = os.Chmod(locked, secureDirPerm) })

	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[{"domain":["a"]}]}`)})

	if err := store.SaveVersion(t.Context(), []byte(`{"v":2}`)); err == nil {
		t.Fatal("version was saved although the list snapshot was not written")
	}

	if _, err := os.Stat(filepath.Join(store.VersionsPath(), versionName(2))); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("version 2 file appeared without a snapshot: %v", err)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}

	if len(versions) != 1 || versions[0].ID != 1 {
		t.Errorf("history after the snapshot failure: %+v, expected only version 1", versions)
	}
}

// The version snapshot and its fingerprint take the same names as the current set: otherwise
// a restored version would never match the current one.
func TestSaveVersionSkipsForeignLists(t *testing.T) {
	store := newVersionStore(t)
	writeVersionLists(t, store, map[string][]byte{"my.json": []byte(`{"rules":[]}`)})

	for name, data := range map[string][]byte{"geo.srs": []byte("binary"), ".metabox-1": []byte("{}")} {
		if err := os.WriteFile(filepath.Join(store.ListsPath(), name), data, 0o600); err != nil {
			t.Fatalf("foreign file %s: %v", name, err)
		}
	}

	if err := store.SaveVersion(t.Context(), []byte(`{"v":1}`)); err != nil {
		t.Fatalf("saving a version: %v", err)
	}

	snapshot, err := store.ReadVersionLists(t.Context(), 1)
	if err != nil {
		t.Fatalf("reading the snapshot: %v", err)
	}
	if len(snapshot) != 1 || snapshot["my.json"] == nil {
		t.Errorf("in the snapshot %q, expected only own files", snapshot)
	}

	current, err := store.ListSums(t.Context())
	if err != nil {
		t.Fatalf("list sums: %v", err)
	}

	versions, err := store.Versions(t.Context())
	if err != nil {
		t.Fatalf("reading history: %v", err)
	}
	if len(versions) != 1 || versions[0].ListsSum != ListsEtag(current) {
		t.Errorf("version fingerprint %+v did not match the current set %q", versions, ListsEtag(current))
	}
}
