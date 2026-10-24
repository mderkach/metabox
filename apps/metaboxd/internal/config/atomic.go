package config

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const (
	// The temporary file lies in the destination directory (rename is atomic only
	// within one file system) but does not end with .json: the service
	// may start in directory mode and would merge it into the config between steps.
	tempPrefix = ".metabox-"

	// Permissions of a new config file and of the daemon service files: they hold
	// user keys. An existing file keeps its permissions.
	securePerm fs.FileMode = 0o600

	// How many times to try a new random name before concluding that
	// the cause is not a collision.
	tempAttempts = 10
)

// writeAtomic writes a file so that a power failure does not leave a half-written
// result: a temporary file next to it, fsync of the data, rename,
// fsync of the directory. The order cannot be shortened: without fsync of the data rename
// after a crash gives a zero-length file, without fsync of the directory the record of the new
// name itself may not survive the crash.
func writeAtomic(root *os.Root, name string, data []byte, perm fs.FileMode) (err error) {
	tmp, tmpName, err := createTemp(root)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = root.Remove(tmpName)
		}
	}()

	// On failure paths the Close error is deliberately not checked: the write has already
	// failed, the file is deleted anyway, and replacing the failure cause makes
	// incident analysis harder.
	if _, err = tmp.Write(data); err != nil {
		_ = tmp.Close()

		return fmt.Errorf("write %s: %w", tmpName, err)
	}

	if err = tmp.Sync(); err != nil {
		_ = tmp.Close()

		return fmt.Errorf("fsync %s: %w", tmpName, err)
	}

	if err = tmp.Close(); err != nil {
		return fmt.Errorf("close %s: %w", tmpName, err)
	}

	if err = root.Chmod(tmpName, perm); err != nil {
		return fmt.Errorf("chmod %s: %w", tmpName, err)
	}

	if err = root.Rename(tmpName, name); err != nil {
		return fmt.Errorf("rename to %s: %w", name, err)
	}

	return syncDir(root)
}

// createTemp replaces os.CreateTemp, which os.Root lacks: the name is generated
// by the daemon itself and opened with O_EXCL so as not to pick up a foreign file.
func createTemp(root *os.Root) (*os.File, string, error) {
	for range tempAttempts {
		name := tempPrefix + rand.Text()

		f, err := root.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, securePerm)
		if errors.Is(err, fs.ErrExist) {
			continue
		}
		if err != nil {
			return nil, "", fmt.Errorf("temporary file in %s: %w", root.Name(), err)
		}

		return f, name, nil
	}

	return nil, "", fmt.Errorf("temporary file in %s: name taken %d times in a row", root.Name(), tempAttempts)
}

func syncDir(root *os.Root) error {
	d, err := root.Open(".")
	if err != nil {
		return fmt.Errorf("open directory %s: %w", root.Name(), err)
	}

	if err := d.Sync(); err != nil {
		_ = d.Close()

		return fmt.Errorf("fsync directory %s: %w", root.Name(), err)
	}

	if err := d.Close(); err != nil {
		return fmt.Errorf("close directory %s: %w", root.Name(), err)
	}

	return nil
}

// ensureDir creates a directory together with missing parents and fixes
// each created link with an fsync of the parent: without it a power failure may take away
// a fresh directory together with the files already synced in it.
// The path comes by a flag, not from outside, so it goes around os.Root.
func ensureDir(dir string) error {
	info, err := os.Stat(dir)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("%s is not a directory", dir)
		}

		return nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("directory %s: %w", dir, err)
	}

	parent := filepath.Dir(dir)
	if parent != dir {
		if err := ensureDir(parent); err != nil {
			return err
		}
	}

	if err := os.Mkdir(dir, secureDirPerm); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return nil
		}

		return fmt.Errorf("create directory %s: %w", dir, err)
	}

	root, err := openRoot(parent)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()

	return syncDir(root)
}

// permOf returns the permissions of an existing file, and securePerm for a new one. The permissions
// are taken from the file and not assigned by a constant: the owner could have narrowed them
// deliberately.
func permOf(root *os.Root, name string) fs.FileMode {
	info, err := root.Stat(name)
	if err != nil {
		return securePerm
	}

	return info.Mode().Perm()
}
