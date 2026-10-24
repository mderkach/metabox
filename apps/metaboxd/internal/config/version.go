package config

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
)

var (
	// ErrNoVersion means there is no version with such a number in the history.
	ErrNoVersion = errors.New("версии конфига нет")

	// ErrNoVersionLists means the version was saved without a snapshot of list files, by a daemon
	// that did not take them yet. Restoring such a version does not touch the lists.
	ErrNoVersionLists = errors.New("у версии нет снимка списков")
)

const (
	// versionsDir is a subdirectory of the daemon service directory. The config directory
	// is no place for history: the service in directory mode would merge every version into
	// the working configuration.
	versionsDir = "versions"

	// maxVersions is how many versions we keep. A hand-written router config is
	// tens of kilobytes, while the OpenWrt overlay is measured in tens of megabytes:
	// a deeper history costs space that packages need more.
	maxVersions = 10

	// secureDirPerm is the permissions of the history directory. It holds the same as the
	// config, including keys, so access is for the owner only.
	secureDirPerm fs.FileMode = 0o700

	// versionDigits sets the number width: names sort as strings, and without
	// alignment the tenth version would stand before the second.
	versionDigits = 6

	// versionListsSuffix is the suffix of the neighbouring directory with the lists snapshot:
	// 000007 and 000007.rule-sets. Such a name does not parse as a number, so
	// a daemon of the previous version skips the directory and its counter stays the same.
	versionListsSuffix = "." + listsDirName

	// versionListsStaging is a draft of the snapshot. Starts with a dot so that it is taken
	// neither for a number nor for a snapshot.
	versionListsStaging = ".rule-sets.next"
)

// Version is a history entry. The daemon does not parse the config content,
// so only the number, size, fingerprint and timestamp go outside.
type Version struct {
	// ID is a monotonic number. Time cannot be the source of order: the
	// router has no real-time clock, it starts from the epoch and jumps on
	// NTP synchronization.
	ID int `json:"id"`
	// Size is the size in bytes.
	Size int64 `json:"size"`
	// Sum is the sha256 of the content. It shows that the version matches the
	// active config without reading both.
	Sum string `json:"sum"`
	// SavedAt is the file timestamp, Unix seconds. Informational: shows the
	// device clock at the time of saving and lies if it is not synchronized.
	SavedAt int64 `json:"saved_at"`
	// ListsSum is the fingerprint of the list files snapshot in the same notation as the etag of
	// `GET /api/config/rule-sets`. No field means the version was saved without a snapshot, and its
	// restore does not touch the lists.
	ListsSum string `json:"lists_sum,omitempty"`
}

// SkippedVersion is a history entry left out of the listing because its config file or its
// list snapshot could not be read.
type SkippedVersion struct {
	ID  int
	Err error
}

// VersionsPath returns the history directory.
func (s *Store) VersionsPath() string {
	return filepath.Join(s.serviceDir, versionsDir)
}

// SaveVersion puts the content into the history under a new number together with a snapshot of
// list files and trims it to maxVersions. Called next to Backup, before
// writing the new config, so the history holds what was applied
// earlier. The commit point is the version file: the snapshot is written before it, and a break between
// them leaves a directory without a number, which the listing does not see.
func (s *Store) SaveVersion(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(true)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	// Numbers are read without content: hashing the whole history for the next
	// number means keeping it all in memory, and the daemon has little memory.
	saved, err := listIDs(root)
	if err != nil {
		return err
	}

	lists, err := s.readLists()
	if err != nil {
		return fmt.Errorf("чтение списков под версию: %w", err)
	}

	// prev is the sums of the newest version snapshot: they catch a repeat and
	// select files that can be hard-linked instead of copied.
	var prev map[string]string

	if len(saved) > 0 {
		prev, err = snapshotSums(root, saved[0])
		if err != nil && !errors.Is(err, ErrNoVersionLists) {
			return err
		}

		same, err := sameContent(root, saved[0], data)
		if err != nil {
			return err
		}

		// A repeated apply of the same config with the same lists is not written
		// to the history: ten identical applies would push out everything that was
		// there.
		if same && sameLists(prev, lists) {
			return nil
		}
	}

	next := 1
	if len(saved) > 0 {
		next = saved[0] + 1
	}

	if err := saveVersionLists(root, next, prev, lists); err != nil {
		return err
	}

	if err := writeAtomic(root, versionName(next), data, securePerm); err != nil {
		return err
	}

	if err := trimVersions(root, append([]int{next}, saved...)); err != nil {
		return fmt.Errorf("версия %d сохранена, подрезка истории: %w", next, err)
	}

	return nil
}

// saveVersionLists puts the lists snapshot into the neighbouring directory of version next.
// The snapshot is assembled whole in a draft and only then gets its name: a break in the
// middle must not leave an incomplete set under a number. A file with the same
// content as in the snapshot prev of the previous version is joined by a hard link:
// an unchanged list must not cost space in every version. The file system
// may refuse the link, and then the file is copied: saving space is not
// a reason to refuse a version.
func saveVersionLists(root *os.Root, next int, prev map[string]string, lists map[string][]byte) error {
	// An orphan of the same number is a trace of a break before the version file was written: the number
	// is then not taken, and the snapshot is assembled anew.
	for _, name := range []string{versionListsName(next), versionListsStaging} {
		if err := root.RemoveAll(name); err != nil {
			return fmt.Errorf("очистка черновика снимка списков %s: %w", name, err)
		}
	}

	if err := root.Mkdir(versionListsStaging, secureDirPerm); err != nil {
		return fmt.Errorf("каталог черновика снимка списков: %w", err)
	}

	staging, err := root.OpenRoot(versionListsStaging)
	if err != nil {
		return fmt.Errorf("открытие черновика снимка списков: %w", err)
	}
	defer func() { _ = staging.Close() }()

	for name, data := range lists {
		if sum, ok := prev[name]; ok && sum == Sum(data) {
			from := versionListsName(next-1) + "/" + name
			if root.Link(from, versionListsStaging+"/"+name) == nil {
				continue
			}
		}

		if err := writeAtomic(staging, name, data, securePerm); err != nil {
			return fmt.Errorf("снимок списка %s: %w", name, err)
		}
	}

	// Links bypass writeAtomic, and their entries in the directory are fixed
	// separately.
	if err := syncDir(staging); err != nil {
		return err
	}

	if err := root.Rename(versionListsStaging, versionListsName(next)); err != nil {
		return fmt.Errorf("снимок списков версии %d: %w", next, err)
	}

	return syncDir(root)
}

// sameLists reports whether the file set matches the snapshot. A version without a snapshot
// (prev == nil) equals only an empty set: otherwise the first apply with
// lists after the daemon update would not get into the history.
func sameLists(prev map[string]string, lists map[string][]byte) bool {
	if prev == nil {
		return len(lists) == 0
	}

	if len(prev) != len(lists) {
		return false
	}

	for name, data := range lists {
		if sum, ok := prev[name]; !ok || sum != Sum(data) {
			return false
		}
	}

	return true
}

// Versions returns the history from newest to oldest.
func (s *Store) Versions(ctx context.Context) ([]Version, error) {
	versions, _, err := s.History(ctx)

	return versions, err
}

// History is Versions together with the entries left out of it: an unreadable version is not
// a reason to refuse the whole history, but the owner must be able to find out about it.
func (s *Store) History(ctx context.Context) ([]Version, []SkippedVersion, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(false)
	if errors.Is(err, errNoHistory) {
		// An empty slice, not nil: in JSON the difference between `[]` and `null` is visible, and
		// the panel would break on `null` on the very first list walk.
		return []Version{}, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = root.Close() }()

	return listVersions(root)
}

// ReadVersion returns the version content as bytes, as the active config is also returned:
// the daemon has no right to parse it.
func (s *Store) ReadVersion(ctx context.Context, id int) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(false)
	if errors.Is(err, errNoHistory) {
		return nil, ErrNoVersion
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(versionName(id))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersion
	}
	if err != nil {
		return nil, fmt.Errorf("чтение версии %d: %w", id, err)
	}

	return data, nil
}

// ReadVersionLists returns the version list files snapshot: name → content.
// An empty map means there were no lists at save time, ErrNoVersionLists means
// the version was saved without a snapshot.
func (s *Store) ReadVersionLists(ctx context.Context, id int) (map[string][]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.versionsRoot(false)
	if errors.Is(err, errNoHistory) {
		return nil, ErrNoVersion
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	// A snapshot without a version file is an orphan of a broken write, not a version.
	if _, err := root.Stat(versionName(id)); errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersion
	} else if err != nil {
		return nil, fmt.Errorf("версия %d: %w", id, err)
	}

	snapshot, err := root.OpenRoot(versionListsName(id))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersionLists
	}
	if err != nil {
		return nil, fmt.Errorf("открытие снимка списков версии %d: %w", id, err)
	}
	defer func() { _ = snapshot.Close() }()

	entries, err := fs.ReadDir(snapshot.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("чтение снимка списков версии %d: %w", id, err)
	}

	files := make(map[string][]byte, len(entries))

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		data, err := snapshot.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("чтение снимка списка %s версии %d: %w", entry.Name(), id, err)
		}

		files[entry.Name()] = data
	}

	return files, nil
}

// errNoHistory: there is no history directory yet. For reading this is an empty history, not
// a failure: there was nothing to save before the first apply.
var errNoHistory = errors.New("каталога истории нет")

// versionsRoot opens the history directory. With create it is created together with the
// daemon service directory; without create a missing directory means an empty
// history, not an error.
func (s *Store) versionsRoot(create bool) (*os.Root, error) {
	if create {
		if err := ensureDir(s.serviceDir); err != nil {
			return nil, fmt.Errorf("служебный каталог: %w", err)
		}
	}

	// The subdirectory is opened from the already open root, not by an assembled path:
	// os.Root keeps operations inside the directory and does not let go through a symlink.
	// A symlink in place of versions would take every version into the working configuration.
	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoHistory
		}

		return nil, err
	}
	defer func() { _ = serviceRoot.Close() }()

	if create {
		err := serviceRoot.Mkdir(versionsDir, secureDirPerm)
		if err != nil && !errors.Is(err, fs.ErrExist) {
			return nil, fmt.Errorf("создание каталога истории %s: %w", s.VersionsPath(), err)
		}

		// A fresh directory is fixed by an fsync of the parent, as in ensureDir.
		if err == nil {
			if err := syncDir(serviceRoot); err != nil {
				return nil, err
			}
		}
	}

	root, err := serviceRoot.OpenRoot(versionsDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoHistory
		}

		return nil, fmt.Errorf("открытие каталога истории %s: %w", s.VersionsPath(), err)
	}

	return root, nil
}

// listVersions reads the directory and returns entries from newest to oldest. Files with
// names not in the format are skipped: the directory is a service one, but a foreign file in it is not
// a reason to refuse the history. A version that cannot be read goes into skipped.
func listVersions(root *os.Root) ([]Version, []SkippedVersion, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, nil, fmt.Errorf("чтение каталога истории: %w", err)
	}

	versions := make([]Version, 0, len(entries))

	var skipped []SkippedVersion

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		id, ok := versionID(entry.Name())
		if !ok {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			skipped = append(skipped, SkippedVersion{ID: id, Err: fmt.Errorf("версия %d: %w", id, err)})

			continue
		}

		sum, err := streamSum(root, entry.Name())
		if err != nil {
			skipped = append(skipped, SkippedVersion{ID: id, Err: fmt.Errorf("чтение версии %d: %w", id, err)})

			continue
		}

		version := Version{
			ID:      id,
			Size:    info.Size(),
			Sum:     sum,
			SavedAt: info.ModTime().Unix(),
		}

		lists, err := snapshotSums(root, id)
		switch {
		case err == nil:
			version.ListsSum = ListsEtag(lists)
		case errors.Is(err, ErrNoVersionLists):
		default:
			skipped = append(skipped, SkippedVersion{ID: id, Err: err})

			continue
		}

		versions = append(versions, version)
	}

	sort.Slice(versions, func(i, j int) bool { return versions[i].ID > versions[j].ID })
	sort.Slice(skipped, func(i, j int) bool { return skipped[i].ID > skipped[j].ID })

	return versions, skipped, nil
}

// streamSum counts the sha256 of a version as a stream: the history list is requested on
// every visit to the panel, and there is no need to raise all versions into memory for a
// fingerprint.
func streamSum(root *os.Root, name string) (string, error) {
	f, err := root.Open(name)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// trimVersions deletes everything that does not fit in maxVersions, together with
// neighbouring snapshot directories, and also snapshots without a version file among
// the kept numbers: orphans of a broken write and directories left by
// the trimming of a previous-version daemon. A deletion failure does not stop the apply:
// an extra history file is harmless, while an interrupted Apply cycle is not.
func trimVersions(root *os.Root, ids []int) error {
	kept := ids[:min(len(ids), maxVersions)]

	for _, stale := range ids[len(kept):] {
		if err := root.Remove(versionName(stale)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("удаление версии %d: %w", stale, err)
		}
	}

	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return fmt.Errorf("чтение каталога истории: %w", err)
	}

	for _, entry := range entries {
		id, ok := versionListsID(entry.Name())
		if !ok || slices.Contains(kept, id) {
			continue
		}

		if err := root.RemoveAll(entry.Name()); err != nil {
			return fmt.Errorf("удаление снимка списков %s: %w", entry.Name(), err)
		}
	}

	return nil
}

// listIDs returns the numbers from newest to oldest without reading content.
func listIDs(root *os.Root) ([]int, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("чтение каталога истории: %w", err)
	}

	ids := make([]int, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		if id, ok := versionID(entry.Name()); ok {
			ids = append(ids, id)
		}
	}

	sort.Sort(sort.Reverse(sort.IntSlice(ids)))

	return ids, nil
}

// sameContent reports whether the version matches what is about to be saved.
func sameContent(root *os.Root, id int, data []byte) (bool, error) {
	saved, err := root.ReadFile(versionName(id))
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("чтение версии %d: %w", id, err)
	}

	return sha256.Sum256(saved) == sha256.Sum256(data), nil
}

// snapshotSums counts the sha256 of the version snapshot files as a stream without raising
// the snapshot into memory: the history list is requested on every visit to the panel.
// ErrNoVersionLists means the version has no snapshot.
func snapshotSums(root *os.Root, id int) (map[string]string, error) {
	dir := versionListsName(id)

	entries, err := fs.ReadDir(root.FS(), dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoVersionLists
	}
	if err != nil {
		return nil, fmt.Errorf("чтение снимка списков версии %d: %w", id, err)
	}

	sums := make(map[string]string, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !ValidListName(entry.Name()) {
			continue
		}

		sum, err := streamSum(root, dir+"/"+entry.Name())
		if err != nil {
			return nil, fmt.Errorf("снимок списка %s версии %d: %w", entry.Name(), id, err)
		}

		sums[entry.Name()] = sum
	}

	return sums, nil
}

func versionName(id int) string {
	return fmt.Sprintf("%0*d", versionDigits, id)
}

func versionListsName(id int) string {
	return versionName(id) + versionListsSuffix
}

func versionListsID(name string) (int, bool) {
	prefix, ok := strings.CutSuffix(name, versionListsSuffix)
	if !ok {
		return 0, false
	}

	return versionID(prefix)
}

func versionID(name string) (int, bool) {
	// Less than the due width is a foreign name. More is allowed: a number above
	// a million no longer fits versionDigits, and rejecting such names
	// would mean resetting the counter and overwriting the first version.
	if len(name) < versionDigits {
		return 0, false
	}

	id, err := strconv.Atoi(name)
	if err != nil || id <= 0 {
		return 0, false
	}

	return id, true
}

// Sum is the content fingerprint in the notation the panel sees: sha256
// as a hexadecimal string.
func Sum(data []byte) string {
	sum := sha256.Sum256(data)

	return hex.EncodeToString(sum[:])
}

// ListsEtag is the fingerprint of the list file set: names with sums in a stable
// order. The list read returns it, the client returns it as the apply base, and in the same
// notation the history returns the version snapshot fingerprint.
func ListsEtag(sums map[string]string) string {
	names := make([]string, 0, len(sums))
	for name := range sums {
		names = append(names, name)
	}

	sort.Strings(names)

	h := sha256.New()
	for _, name := range names {
		// A write to hash.Hash does not fail by the contract of the hash package.
		_, _ = fmt.Fprintf(h, "%s:%s\n", name, sums[name])
	}

	return hex.EncodeToString(h.Sum(nil))
}
