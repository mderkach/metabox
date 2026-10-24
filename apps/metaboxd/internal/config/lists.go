package config

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	// listsDirName is the subdirectory of the config directory for the daemon's own list files.
	// Such a file cannot be put in the root: the service in directory mode would merge it
	// with the config as one more .json.
	listsDirName = "rule-sets"

	// listsBackupName is the snapshot of the lists subdirectory in the service directory;
	// restored together with config.backup.
	listsBackupName = "rule-sets.backup"

	// listsBackupStaging is the name under which the next snapshot is assembled
	// whole before the swap: a break in the middle must not spoil the previous one.
	listsBackupStaging = "rule-sets.backup.next"
)

// listNamePattern is the name the panel builds from a tag: a simple name with
// the .json extension, with no escape from the subdirectory.
var listNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$`)

// maxListName limits the name: device file systems do not accept longer ones.
const maxListName = 128

// ValidListName reports whether the daemon manages a file with such a name in the
// lists subdirectory. The rest is an attempt to escape the subdirectory, a foreign file
// of the owner (`.srs`, notes) or a leftover of a broken write `.metabox-*`: the
// daemon neither writes nor deletes them. Reading, sums, version snapshot, backup and rollback
// see only such names, otherwise the fingerprint of a restored version would not match
// the current set, and a rollback would remove foreign files.
func ValidListName(name string) bool {
	return len(name) <= maxListName && listNamePattern.MatchString(name) && !strings.Contains(name, "..")
}

// ListsPath returns the list files directory.
func (s *Store) ListsPath() string {
	return filepath.Join(s.dir, listsDirName)
}

// ReadLists returns the list files: name → content. A missing subdirectory is
// an empty set, not an error: before the first list it does not exist.
func (s *Store) ReadLists(ctx context.Context) (map[string][]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.readLists()
}

func (s *Store) readLists() (map[string][]byte, error) {
	root, err := s.listsRoot(false)
	if errors.Is(err, errNoLists) {
		return map[string][]byte{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("read list directory %s: %w", s.ListsPath(), err)
	}

	files := make(map[string][]byte, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !ValidListName(entry.Name()) {
			continue
		}

		data, err := root.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read list %s: %w", entry.Name(), err)
		}

		files[entry.Name()] = data
	}

	return files, nil
}

// ListSums returns the sha256 of each list file: they catch an edit of files
// outside metabox and the replay of a broken write.
func (s *Store) ListSums(ctx context.Context) (map[string]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.listSums()
}

// listSums counts the sums as a stream: they are asked for by the check before every
// apply and every visit to the history, and there is no need to raise all lists into
// memory for them.
func (s *Store) listSums() (map[string]string, error) {
	root, err := s.listsRoot(false)
	if errors.Is(err, errNoLists) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("read list directory %s: %w", s.ListsPath(), err)
	}

	sums := make(map[string]string, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !ValidListName(entry.Name()) {
			continue
		}

		sum, err := streamSum(root, entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read list %s: %w", entry.Name(), err)
		}

		sums[entry.Name()] = sum
	}

	return sums, nil
}

// WriteLists applies list file changes: put is written atomically with
// the config permissions, remove deletes. Only the Apply protocol writes: the fork watches
// the files and rereads them on the fly, so a write bypassing the transaction would skip
// the check and the automatic rollback.
func (s *Store) WriteLists(ctx context.Context, put map[string][]byte, remove []string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.listsRoot(len(put) > 0)
	if errors.Is(err, errNoLists) {
		// Nothing to write, nothing to delete from.
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	for name, data := range put {
		if err := writeAtomic(root, name, data, permOf(root, name)); err != nil {
			return fmt.Errorf("write list %s: %w", name, err)
		}
	}

	for _, name := range remove {
		if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("remove list %s: %w", name, err)
		}
	}

	return syncDir(root)
}

// errNoLists: there is no lists subdirectory. For reading this is an empty set.
var errNoLists = errors.New("no list directory")

// listsRoot opens the lists subdirectory from the open config directory root:
// a symlink in its place would take the write outside. With create the subdirectory is created,
// and the creation is fixed by an fsync of the parent, otherwise a power failure may take the
// directory away together with fresh lists.
func (s *Store) listsRoot(create bool) (*os.Root, error) {
	cfgRoot, err := openRoot(s.dir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = cfgRoot.Close() }()

	if create {
		if err := cfgRoot.Mkdir(listsDirName, secureDirPerm); err != nil && !errors.Is(err, fs.ErrExist) {
			return nil, fmt.Errorf("create list directory %s: %w", s.ListsPath(), err)
		}

		if err := syncDir(cfgRoot); err != nil {
			return nil, err
		}
	}

	root, err := cfgRoot.OpenRoot(listsDirName)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoLists
		}

		return nil, fmt.Errorf("open list directory %s: %w", s.ListsPath(), err)
	}

	return root, nil
}
