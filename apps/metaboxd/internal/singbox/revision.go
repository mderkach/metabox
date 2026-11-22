package singbox

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"metabox/internal/procd"
)

const maxSnapshotBytes = 4 << 20

var errUnverifiedRevision = errors.New("managed core revision could not be verified")

// RevisionIdentity binds the startup config bytes to a managed process on this boot.
type RevisionIdentity struct {
	PID    int
	Start  uint64
	SHA256 string
}

// LoadedRevision checks the config snapshot the running process was given by
// the packaged launcher. The caller checks which process owns the controller socket.
func (c *Client) LoadedRevision(ctx context.Context) (RevisionIdentity, error) {
	return c.loadedRevision(ctx, "/proc", "/var/run/metabox-core")
}

func (c *Client) loadedRevision(ctx context.Context, procDir, snapshotDir string) (RevisionIdentity, error) {
	pid, err := c.PID(ctx)
	if err != nil {
		return RevisionIdentity{}, err
	}

	if pid <= 0 {
		return RevisionIdentity{}, errUnverifiedRevision
	}

	start, err := procd.ProcessStart(ctx, procDir, pid)
	if err != nil {
		return RevisionIdentity{}, fmt.Errorf("read managed core start: %w", err)
	}

	proc := filepath.Join(procDir, strconv.Itoa(pid))
	name, digest, err := c.snapshotFromProcess(proc, snapshotDir, pid, start)
	if err != nil {
		return RevisionIdentity{}, err
	}

	if err := verifySnapshot(snapshotDir, name, digest); err != nil {
		return RevisionIdentity{}, err
	}

	current, err := procd.ProcessStart(ctx, procDir, pid)
	if err != nil || current != start {
		return RevisionIdentity{}, errUnverifiedRevision
	}

	return RevisionIdentity{PID: pid, Start: start, SHA256: digest}, nil
}

func (c *Client) snapshotFromProcess(proc, snapshotDir string, pid int, start uint64) (string, string, error) {
	exe, err := os.Stat(filepath.Join(proc, "exe"))
	if err != nil {
		return "", "", fmt.Errorf("read managed core executable: %w", err)
	}

	binary, err := os.Stat(c.binary)
	if err != nil || !os.SameFile(exe, binary) {
		return "", "", errUnverifiedRevision
	}

	root, err := os.OpenRoot(proc)
	if err != nil {
		return "", "", fmt.Errorf("open managed core process: %w", err)
	}
	defer func() { _ = root.Close() }()

	cmdline, err := root.ReadFile("cmdline")
	if err != nil {
		return "", "", fmt.Errorf("read managed core command: %w", err)
	}

	args := strings.Split(strings.TrimSuffix(string(cmdline), "\x00"), "\x00")
	if len(args) != 6 || args[0] != c.binary || args[1] != "run" || args[2] != "-c" ||
		args[4] != "-D" || !filepath.IsAbs(args[5]) {
		return "", "", errUnverifiedRevision
	}

	name := filepath.Base(args[3])
	prefix := strconv.Itoa(pid) + "-" + strconv.FormatUint(start, 10) + "-"
	digest, ok := strings.CutPrefix(strings.TrimSuffix(name, ".json"), prefix)
	if !ok || len(digest) != sha256.Size*2 || name != prefix+digest+".json" || args[3] != filepath.Join(snapshotDir, name) {
		return "", "", errUnverifiedRevision
	}

	return name, digest, nil
}

func verifySnapshot(dir, name, digest string) error {
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || !privateMode(info, 0700) {
		return errUnverifiedRevision
	}

	root, err := os.OpenRoot(dir)
	if err != nil {
		return fmt.Errorf("open core snapshot directory: %w", err)
	}
	defer func() { _ = root.Close() }()

	opened, err := root.Stat(".")
	if err != nil || !os.SameFile(info, opened) {
		return errUnverifiedRevision
	}

	info, err = root.Lstat(name)
	if err != nil || !info.Mode().IsRegular() || !privateMode(info, 0400) || info.Size() > maxSnapshotBytes {
		return errUnverifiedRevision
	}

	file, err := root.OpenFile(name, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return fmt.Errorf("open core snapshot: %w", err)
	}
	defer func() { _ = file.Close() }()

	opened, err = file.Stat()
	if err != nil || !os.SameFile(info, opened) || !privateMode(opened, 0400) {
		return errUnverifiedRevision
	}

	hash := sha256.New()
	if read, err := io.Copy(hash, io.LimitReader(file, maxSnapshotBytes+1)); err != nil {
		return fmt.Errorf("digest core snapshot: %w", err)
	} else if read > maxSnapshotBytes || hex.EncodeToString(hash.Sum(nil)) != digest {
		return errUnverifiedRevision
	}

	return nil
}

func privateMode(info os.FileInfo, mode os.FileMode) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)

	return ok && int(stat.Uid) == os.Geteuid() && info.Mode().Perm() == mode
}
