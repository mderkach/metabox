// Package config owns the sing-box config file on the device: reads it,
// writes it atomically, keeps a backup for the rollback and lays out a candidate directory for
// the binary check. The package does not parse the content: for the daemon the config is
// a sequence of bytes.
//
// All file operations go through os.Root: the daemon runs as root, and the
// working directory may contain a symlink left by the owner or foreign
// software, so the package never leaves its directory.
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
	"strings"
	"sync"

	"metabox/internal/locale"
)

var (
	// ErrNoConfig means there is no config in place, neither a file nor a directory for it.
	// A regular case, sing-box may not have been configured on the device yet.
	ErrNoConfig = locale.New("no config file")

	// ErrNoBackup means nothing to roll back to, the device had neither a config
	// nor list files before the apply.
	ErrNoBackup = errors.New("no backup")

	// ErrListsOnly means the rollback returned only the list files: the device had no
	// config before the apply, and the written one stays in place.
	ErrListsOnly = errors.New("no config before the apply, only the lists were restored")

	// ErrNoState means there is no unfinished transaction, nothing to replay.
	ErrNoState = errors.New("no transaction state")
)

// Names of service files in the daemon directory. They are not configurable: the directory
// is set by a flag, and the layout inside it is the daemon's own concern.
const (
	backupName   = "config.backup"
	stateName    = "apply.json"
	planeName    = "dataplane.json"
	ruleSetsName = "rule-sets.json"
	devicesName  = "devices.json"
	authName     = "auth.json"
	sessionsName = "sessions.json"
	mcpName      = "mcp.json"
	// tlsDir holds the panel certificates and keys under the service directory.
	tlsDir = "tls"
)

// Store is the only owner of the config file and the daemon service directory:
// backup, transaction state, version history, rule set catalog cache and the
// device names. A single owner requires Architecture&Style: concurrent
// access is closed by methods, there must be no mutex outside.
type Store struct {
	mu         sync.Mutex
	dir        string
	name       string
	serviceDir string
}

// NewStore takes the config directory, the file name in it and the daemon service
// directory for the backup and state. The paths come by flags, the package does not invent them.
//
// A service directory inside the config directory would be merged by the service in directory mode
// into the working configuration, so such a layout is rejected at start and not
// discovered on the device.
func NewStore(dir, name, serviceDir string) (*Store, error) {
	if name == "" {
		return nil, errors.New("config file name is empty")
	}

	dir = filepath.Clean(dir)
	serviceDir = filepath.Clean(serviceDir)

	if within(dir, serviceDir) {
		return nil, fmt.Errorf("service directory %s lies inside the config directory %s", serviceDir, dir)
	}

	return &Store{dir: dir, name: name, serviceDir: serviceDir}, nil
}

// within reports whether path lies inside dir. filepath.Rel gives a path leading
// outside through "..", which is how we tell.
func within(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}

	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// Path returns the full path to the config file.
func (s *Store) Path() string {
	return filepath.Join(s.dir, s.name)
}

// BackupPath returns the full path to the backup.
func (s *Store) BackupPath() string {
	return filepath.Join(s.serviceDir, backupName)
}

// StatePath returns the full path to the transaction state file.
func (s *Store) StatePath() string {
	return filepath.Join(s.serviceDir, stateName)
}

// Read returns the current config. A missing file or directory is ErrNoConfig.
func (s *Store) Read(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoConfig
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(s.name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoConfig
	}
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", s.Path(), err)
	}

	return data, nil
}

// Sum counts the sha256 of the current config as a stream without raising the file into memory:
// the daemon runs for months, and an extra copy of the config is pointless here.
func (s *Store) Sum(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.dir)
	if err != nil {
		return "", err
	}
	defer func() { _ = root.Close() }()

	f, err := root.Open(s.name)
	if err != nil {
		return "", fmt.Errorf("open config %s: %w", s.Path(), err)
	}
	defer func() { _ = f.Close() }()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("read config %s: %w", s.Path(), err)
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// Write puts the new config in place of the old one atomically. A failure at any step before
// rename leaves the previous file untouched byte for byte.
//
// The context is checked before the write starts and does not interrupt its middle: a cancel
// between fsync and rename would give exactly the state that atomic
// writing protects against.
func (s *Store) Write(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.write(data)
}

// Backup saves the current config and a snapshot of the lists directory for the rollback.
// Called before writing the new one (step 4 of the apply protocol). The service directory
// is created if absent, as in WriteState.
//
// No config in place is ErrNoConfig, and the config backup of the previous transaction is removed:
// the owner could have deleted the config over SSH, and the rollback of this apply must not return
// the deleted config. The list files are still snapshotted if there are any, and Restore
// returns them alone (ErrListsOnly); without them it gives ErrNoBackup.
func (s *Store) Backup(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cfgRoot, err := openRoot(s.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return s.dropBackup()
	}
	if err != nil {
		return err
	}
	defer func() { _ = cfgRoot.Close() }()

	data, err := cfgRoot.ReadFile(s.name)
	if errors.Is(err, fs.ErrNotExist) {
		return s.backupListsOnly()
	}
	if err != nil {
		return fmt.Errorf("read config %s for the backup: %w", s.Path(), err)
	}

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	if err := writeAtomic(serviceRoot, backupName, data, securePerm); err != nil {
		return err
	}

	return s.backupLists(serviceRoot)
}

// backupListsOnly is Backup without a config: the config backup of the previous transaction
// is removed, and the lists snapshot is taken as usual. No list files means
// nothing to snapshot, as in dropBackup. Returns ErrNoConfig. Called under mu.
func (s *Store) backupListsOnly() error {
	sums, err := s.listSums()
	if err != nil {
		return fmt.Errorf("read lists for the backup: %w", err)
	}
	if len(sums) == 0 {
		return s.dropBackup()
	}

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	if err := serviceRoot.Remove(backupName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove stale backup %s: %w", s.BackupPath(), err)
	}

	if err := s.backupLists(serviceRoot); err != nil {
		return err
	}

	return ErrNoConfig
}

// dropBackup removes the backup of the previous transaction together with the lists snapshot and
// returns ErrNoConfig. A break in the middle leaves a part of the previous backup, but Restore
// runs only after a Backup of the same transaction has finished, so it does not read it. No service
// directory means nothing to remove. Called under mu.
func (s *Store) dropBackup() error {
	serviceRoot, err := openRoot(s.serviceDir)
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNoConfig
	}
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	if err := serviceRoot.Remove(backupName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove stale backup %s: %w", s.BackupPath(), err)
	}

	for _, name := range []string{listsBackupName, listsBackupStaging} {
		if err := serviceRoot.RemoveAll(name); err != nil {
			return fmt.Errorf("remove stale list backup %s: %w", name, err)
		}
	}

	if err := syncDir(serviceRoot); err != nil {
		return err
	}

	return ErrNoConfig
}

// backupLists puts a snapshot of the lists directory next to the config backup. The snapshot
// is first assembled whole under a temporary name and only then replaces the
// previous one: a break in the middle must not leave a rollback without list files.
func (s *Store) backupLists(serviceRoot *os.Root) error {
	files, err := s.readLists()
	if err != nil {
		return fmt.Errorf("read lists for the backup: %w", err)
	}

	if err := serviceRoot.RemoveAll(listsBackupStaging); err != nil {
		return fmt.Errorf("clear list backup draft: %w", err)
	}

	if err := serviceRoot.Mkdir(listsBackupStaging, secureDirPerm); err != nil {
		return fmt.Errorf("list backup draft directory: %w", err)
	}

	staging, err := serviceRoot.OpenRoot(listsBackupStaging)
	if err != nil {
		return fmt.Errorf("open list backup draft: %w", err)
	}
	defer func() { _ = staging.Close() }()

	for name, data := range files {
		if err := writeAtomic(staging, name, data, securePerm); err != nil {
			return fmt.Errorf("back up list %s: %w", name, err)
		}
	}

	if err := serviceRoot.RemoveAll(listsBackupName); err != nil {
		return fmt.Errorf("remove previous list backup: %w", err)
	}

	if err := serviceRoot.Rename(listsBackupStaging, listsBackupName); err != nil {
		return fmt.Errorf("replace list backup: %w", err)
	}

	return syncDir(serviceRoot)
}

// Restore returns the config and the lists directory from the backup. The permissions of the target file
// are kept: the rollback must not change what the owner narrowed deliberately.
//
// A backup taken without a config returns the lists alone and gives ErrListsOnly: the
// written config stays in place. No backup at all is ErrNoBackup.
func (s *Store) Restore(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	serviceRoot, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = serviceRoot.Close() }()

	data, err := serviceRoot.ReadFile(backupName)
	if errors.Is(err, fs.ErrNotExist) {
		return s.restoreListsOnly(serviceRoot)
	}
	if err != nil {
		return fmt.Errorf("read backup %s: %w", s.BackupPath(), err)
	}

	if err := s.restoreLists(serviceRoot); err != nil {
		return err
	}

	return s.write(data)
}

// restoreListsOnly is Restore of a backup taken without a config.
func (s *Store) restoreListsOnly(serviceRoot *os.Root) error {
	_, err := serviceRoot.Stat(listsBackupName)
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNoBackup
	}
	if err != nil {
		return fmt.Errorf("open list backup: %w", err)
	}

	if err := s.restoreLists(serviceRoot); err != nil {
		return err
	}

	return ErrListsOnly
}

// restoreLists brings the lists directory to the backup snapshot: files are returned
// byte for byte, those that appeared after the snapshot are deleted. Foreign names the rollback does not
// touch, neither in the backup nor in the directory. A backup without a snapshot means it was taken
// before lists appeared, and the directory is not touched.
func (s *Store) restoreLists(serviceRoot *os.Root) error {
	backup, err := serviceRoot.OpenRoot(listsBackupName)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open list backup: %w", err)
	}
	defer func() { _ = backup.Close() }()

	entries, err := fs.ReadDir(backup.FS(), ".")
	if err != nil {
		return fmt.Errorf("read list backup: %w", err)
	}

	saved := make(map[string][]byte, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !ValidListName(entry.Name()) {
			continue
		}

		data, err := backup.ReadFile(entry.Name())
		if err != nil {
			return fmt.Errorf("read list backup %s: %w", entry.Name(), err)
		}

		saved[entry.Name()] = data
	}

	current, err := s.readLists()
	if err != nil {
		return err
	}

	var remove []string

	for name := range current {
		if _, ok := saved[name]; !ok {
			remove = append(remove, name)
		}
	}

	root, err := s.listsRoot(len(saved) > 0)
	if errors.Is(err, errNoLists) {
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	for name, data := range saved {
		if err := writeAtomic(root, name, data, permOf(root, name)); err != nil {
			return fmt.Errorf("restore list %s: %w", name, err)
		}
	}

	for _, name := range remove {
		if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("remove list %s: %w", name, err)
		}
	}

	return syncDir(root)
}

// StageCandidate lays out a candidate directory: the config with the new content,
// the other .json files of the working directory and its subdirectories whole. The lists directory
// is assembled with the transaction changes: putLists lie over the current
// files, removeLists do not get into the candidate: exactly what will land on disk after the write
// must be checked. The layout repeats the whole config directory:
// the service in directory mode merges all its .json, and check runs with -D on
// the candidate, and files the config refers to by a relative path
// must lie in it in the same layout.
// The directory is created and removed by the caller.
func (s *Store) StageCandidate(
	ctx context.Context,
	dst string,
	data []byte,
	putLists map[string][]byte,
	removeLists []string,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	srcRoot, err := openRoot(s.dir)
	if err != nil {
		return err
	}
	defer func() { _ = srcRoot.Close() }()

	dstRoot, err := openRoot(dst)
	if err != nil {
		return err
	}
	defer func() { _ = dstRoot.Close() }()

	entries, err := fs.ReadDir(srcRoot.FS(), ".")
	if err != nil {
		return fmt.Errorf("read config directory %s: %w", s.dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			if err := copyTree(srcRoot, dstRoot, entry.Name()); err != nil {
				return err
			}

			continue
		}
		if entry.Name() == s.name || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		// Symlinks are not filtered out: one leading inside the directory is
		// read and merged by the service, so the candidate must contain it. One
		// leading outside is not opened by os.Root, and Apply stops with an error,
		// since the service on such a directory will not start anyway.
		if err := copyFile(srcRoot, dstRoot, entry.Name()); err != nil {
			return err
		}
	}

	if err := s.stageLists(dstRoot, putLists, removeLists); err != nil {
		return err
	}

	if err := dstRoot.WriteFile(s.name, data, securePerm); err != nil {
		return fmt.Errorf("write candidate to %s: %w", dst, err)
	}

	return nil
}

// stageLists lays the transaction changes over the copied lists
// directory: removeLists are removed from the candidate, putLists are written. All
// other subdirectory content, nested directories and foreign files, is already
// copied as is: exactly what will land on disk is checked.
func (s *Store) stageLists(dstRoot *os.Root, put map[string][]byte, remove []string) error {
	if len(put) == 0 && len(remove) == 0 {
		return nil
	}

	if err := dstRoot.Mkdir(listsDirName, secureDirPerm); err != nil && !errors.Is(err, fs.ErrExist) {
		return fmt.Errorf("candidate list directory: %w", err)
	}

	listsRoot, err := dstRoot.OpenRoot(listsDirName)
	if err != nil {
		return fmt.Errorf("open candidate list directory: %w", err)
	}
	defer func() { _ = listsRoot.Close() }()

	for _, name := range remove {
		if err := listsRoot.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("remove list %s in the candidate: %w", name, err)
		}
	}

	for name, data := range put {
		if err := listsRoot.WriteFile(name, data, securePerm); err != nil {
			return fmt.Errorf("list %s in the candidate: %w", name, err)
		}
	}

	return nil
}

// write performs the write under an already taken mutex.
func (s *Store) write(data []byte) error {
	root, err := openRoot(s.dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, s.name, data, permOf(root, s.name))
}

func openRoot(dir string) (*os.Root, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open directory %s: %w", dir, err)
	}

	return root, nil
}

// copyTree copies a subdirectory recursively. A symlink to a file is resolved as at
// the top level: inside the directory, the target content is copied; outside,
// os.Root will not open it and the layout stops with an error.
func copyTree(src, dst *os.Root, dir string) error {
	return fs.WalkDir(src.FS(), dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("walk %s: %w", path, err)
		}

		if d.IsDir() {
			if err := dst.Mkdir(path, secureDirPerm); err != nil {
				return fmt.Errorf("directory %s in %s: %w", path, dst.Name(), err)
			}

			return nil
		}

		return copyFile(src, dst, path)
	})
}

func copyFile(src, dst *os.Root, name string) error {
	in, err := src.Open(name)
	if err != nil {
		return fmt.Errorf("open %s: %w", name, err)
	}
	defer func() { _ = in.Close() }()

	out, err := dst.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, securePerm)
	if err != nil {
		return fmt.Errorf("create %s in %s: %w", name, dst.Name(), err)
	}

	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()

		return fmt.Errorf("copy %s to %s: %w", name, dst.Name(), err)
	}

	if err := out.Close(); err != nil {
		return fmt.Errorf("close %s in %s: %w", name, dst.Name(), err)
	}

	return nil
}

// ReadState returns the saved transaction state. A missing file is a
// regular case: the daemon started from a clean slate.
func (s *Store) ReadState(ctx context.Context) ([]byte, error) {
	return s.readState(ctx, stateName)
}

// ReadPlaneState is the same for the dataplane model change transaction: it has its own file
// because it is replayed by its own owner.
func (s *Store) ReadPlaneState(ctx context.Context) ([]byte, error) {
	return s.readState(ctx, planeName)
}

func (s *Store) readState(ctx context.Context, name string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoState
	}
	if err != nil {
		return nil, fmt.Errorf("read state %s: %w", filepath.Join(s.serviceDir, name), err)
	}

	return data, nil
}

// WriteState saves the transaction state atomically. Called before writing the
// config: a power loss between the write and the timer start would otherwise leave
// the device on the new config without an automatic rollback. The service directory is created
// if absent: a daemon started not by the init script would otherwise fail the first Apply.
func (s *Store) WriteState(ctx context.Context, data []byte) error {
	return s.writeState(ctx, stateName, data)
}

// WritePlaneState saves the dataplane model change transaction state
// atomically, before the model is written to UCI.
func (s *Store) WritePlaneState(ctx context.Context, data []byte) error {
	return s.writeState(ctx, planeName, data)
}

func (s *Store) writeState(ctx context.Context, name string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, name, data, securePerm)
}

// ClearState removes the state of a finished transaction. A missing file
// is not an error: nothing to replay.
func (s *Store) ClearState(ctx context.Context) error {
	return s.clearState(ctx, stateName)
}

// ClearPlaneState removes the state of a finished dataplane model change.
func (s *Store) ClearPlaneState(ctx context.Context) error {
	return s.clearState(ctx, planeName)
}

func (s *Store) clearState(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove state %s: %w", filepath.Join(s.serviceDir, name), err)
	}

	return syncDir(root)
}

// ReadRuleSets returns the saved rule set catalog. A missing file or
// service directory is an error for which errors.Is(err, fs.ErrNotExist) holds:
// the daemon has not yet checked with the providers.
func (s *Store) ReadRuleSets(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(ruleSetsName)
	if err != nil {
		return nil, fmt.Errorf("read rule set catalog in %s: %w", s.serviceDir, err)
	}

	return data, nil
}

// WriteRuleSets saves the rule set catalog atomically. The service directory
// is created if it does not exist yet: the check may happen before the first
// apply.
func (s *Store) WriteRuleSets(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, ruleSetsName, data, securePerm)
}

// ReadDevices returns the saved device names. A missing file or
// service directory is an error for which errors.Is(err, fs.ErrNotExist) holds:
// names have not been set yet.
func (s *Store) ReadDevices(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(devicesName)
	if err != nil {
		return nil, fmt.Errorf("read device names in %s: %w", s.serviceDir, err)
	}

	return data, nil
}

// WriteDevices saves the device names atomically. The service directory
// is created if it does not exist yet: a name may be set before the first apply.
func (s *Store) WriteDevices(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, devicesName, data, securePerm)
}

// ReadAuth returns the panel password hash file. A missing file or service directory
// is an error for which errors.Is(err, fs.ErrNotExist) holds: no password was set.
func (s *Store) ReadAuth(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(authName)
	if err != nil {
		return nil, fmt.Errorf("read password file in %s: %w", s.serviceDir, err)
	}

	return data, nil
}

// WriteAuth saves the panel password hash file atomically, readable by root only. The
// service directory is created if it does not exist yet: a password may be set before
// the first apply.
func (s *Store) WriteAuth(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, authName, data, securePerm)
}

// ReadSessions returns the panel session file. A missing file or service directory is an
// error for which errors.Is(err, fs.ErrNotExist) holds: nobody has logged in yet.
func (s *Store) ReadSessions(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(sessionsName)
	if err != nil {
		return nil, fmt.Errorf("read sessions file in %s: %w", s.serviceDir, err)
	}

	return data, nil
}

// WriteSessions saves the panel session file atomically, readable by root only.
func (s *Store) WriteSessions(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, sessionsName, data, securePerm)
}

// ReadMCP returns the MCP access token hash file. A missing file or service directory is
// an error for which errors.Is(err, fs.ErrNotExist) holds: MCP was never enabled.
func (s *Store) ReadMCP(ctx context.Context) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(mcpName)
	if err != nil {
		return nil, fmt.Errorf("read MCP token file in %s: %w", s.serviceDir, err)
	}

	return data, nil
}

// WriteMCP saves the MCP access token hash file atomically, readable by root only.
func (s *Store) WriteMCP(ctx context.Context, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.serviceDir); err != nil {
		return fmt.Errorf("service directory: %w", err)
	}

	root, err := openRoot(s.serviceDir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, mcpName, data, securePerm)
}

// ReadTLS returns a panel certificate or key file by name from the tls
// subdirectory of the service directory. A missing file or directory is an error for
// which errors.Is(err, fs.ErrNotExist) holds.
func (s *Store) ReadTLS(ctx context.Context, name string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := openRoot(filepath.Join(s.serviceDir, tlsDir))
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(name)
	if err != nil {
		return nil, fmt.Errorf("read certificate file %s: %w", name, err)
	}

	return data, nil
}

// WriteTLS saves a panel certificate or key file atomically, readable by root only.
// The directory is created on the first write.
func (s *Store) WriteTLS(ctx context.Context, name string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	dir := filepath.Join(s.serviceDir, tlsDir)
	if err := ensureDir(dir); err != nil {
		return fmt.Errorf("certificate directory: %w", err)
	}

	root, err := openRoot(dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return writeAtomic(root, name, data, securePerm)
}
