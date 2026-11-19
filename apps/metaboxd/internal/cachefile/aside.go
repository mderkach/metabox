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

	aside := path + ".broken"
	if err := os.Rename(path, aside); err != nil {
		return "", fmt.Errorf("move cache file aside: %w", err)
	}

	if err := syncDir(filepath.Dir(path)); err != nil {
		return aside, err
	}

	return aside, nil
}

func syncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return fmt.Errorf("open %s: %w", dir, err)
	}

	syncErr := d.Sync()
	closeErr := d.Close()

	if syncErr != nil {
		return fmt.Errorf("fsync %s: %w", dir, syncErr)
	}

	return closeErr
}
