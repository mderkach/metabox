package cachefile

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// MoveAside renames the file to <path>.broken in the same directory, replacing an earlier one,
// and returns the new path. One fixed name keeps repeated moves from filling the flash.
func (Editor) MoveAside(ctx context.Context, path string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return "", fmt.Errorf("open cache directory: %w", err)
	}
	defer func() { _ = root.Close() }()

	name := filepath.Base(path)
	if err := root.Rename(name, name+".broken"); err != nil {
		return "", fmt.Errorf("move cache file aside: %w", err)
	}

	aside := path + ".broken"

	d, err := root.Open(".")
	if err != nil {
		return aside, fmt.Errorf("open cache directory: %w", err)
	}

	syncErr := d.Sync()
	closeErr := d.Close()

	if syncErr != nil {
		return aside, fmt.Errorf("fsync cache directory: %w", syncErr)
	}

	return aside, closeErr
}
