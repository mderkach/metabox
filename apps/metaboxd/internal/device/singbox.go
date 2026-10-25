package device

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// errNoPort means the Clash API port is unknown: without it there is nothing
// to look for the process by.
var errNoPort = errors.New("port of the Clash API not set")

// The process name in `comm` is cut to fifteen characters, "sing-box" fits
// whole.
const singboxComm = "sing-box"

// The LISTEN socket state in `/proc/net/tcp`.
const stateListen = "0A"

// Listener tables: an IPv6 socket with the address `::` accepts IPv4 too, so
// both have to be looked at.
var listenerTables = []string{"net/tcp", "net/tcp6"}

// singbox returns the readings of the process that does the routing.
//
// The process is looked up by the listener of the Clash API port, not by the daemon service: on
// the device routing may be owned by another service that starts the same binary,
// and procd knows nothing about it. The found pid
// is remembered: walking the descriptors of all processes every few seconds
// is not needed by the device.
func (r *Reader) singbox(ctx context.Context) (*Process, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.pid != 0 {
		if rss, err := r.rssOfSingbox(r.pid); err == nil {
			return &Process{PID: r.pid, RSS: rss}, nil
		}

		r.pid = 0
	}

	pid, err := r.findSingbox(ctx)
	if err != nil {
		return nil, err
	}

	rss, err := r.rssOfSingbox(pid)
	if err != nil {
		return nil, err
	}

	r.pid = pid

	return &Process{PID: pid, RSS: rss}, nil
}

// Alive reports whether the process doing the routing is running on the device.
// The daemon service gives no such answer: sing-box could have been started by a foreign
// package, and procd does not know about it.
func (r *Reader) Alive(ctx context.Context) bool {
	process, err := r.singbox(ctx)

	return err == nil && process != nil
}

// rssOfSingbox reads the process memory after making sure it is still sing-box:
// the system hands out a freed pid again.
func (r *Reader) rssOfSingbox(pid int) (int64, error) {
	id := strconv.Itoa(pid)

	comm, err := readTrimmed(filepath.Join(r.proc, id, "comm"))
	if err != nil {
		return 0, err
	}

	if comm != singboxComm {
		return 0, fmt.Errorf("process %d is no longer sing-box: %s", pid, comm)
	}

	return processRSS(r.proc, id)
}

func (r *Reader) findSingbox(ctx context.Context) (int, error) {
	if r.port == nil {
		return 0, errNoPort
	}

	port, err := r.port(ctx)
	if err != nil {
		return 0, fmt.Errorf("port of the Clash API: %w", err)
	}

	inodes, err := r.listenerInodes(port)
	if err != nil {
		return 0, err
	}

	if len(inodes) == 0 {
		return 0, fmt.Errorf("nobody listens on port %d", port)
	}

	return r.ownerOf(ctx, inodes)
}

// listenerInodes collects the inodes of sockets listening on a port. A table row is
// "sl local_address rem_address st ... inode", the addresses in it are hexadecimal.
func (r *Reader) listenerInodes(port int) (map[string]struct{}, error) {
	const (
		localField = 1
		stateField = 3
		inodeField = 9
	)

	inodes := make(map[string]struct{})
	suffix := fmt.Sprintf(":%04X", port)

	var failures []error

	for _, table := range listenerTables {
		path := filepath.Join(r.proc, table)

		data, err := os.ReadFile(path)
		if err != nil {
			// A kernel without IPv6 creates no such table: this is not a failure.
			if !errors.Is(err, os.ErrNotExist) {
				failures = append(failures, fmt.Errorf("read %s: %w", path, err))
			}

			continue
		}

		for line := range strings.Lines(string(data)) {
			fields := strings.Fields(line)
			if len(fields) <= inodeField {
				continue
			}

			if fields[stateField] != stateListen || !strings.HasSuffix(fields[localField], suffix) {
				continue
			}

			inodes[fields[inodeField]] = struct{}{}
		}
	}

	return inodes, errors.Join(failures...)
}

// ownerOf looks for the process that has one of the sockets open. There is nothing cheaper than
// a walk: the "socket to process" link in procfs is expressed only by references in `fd`.
func (r *Reader) ownerOf(ctx context.Context, inodes map[string]struct{}) (int, error) {
	entries, err := os.ReadDir(r.proc)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", r.proc, err)
	}

	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return 0, err
		}

		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}

		if r.holdsSocket(entry.Name(), inodes) {
			return pid, nil
		}
	}

	return 0, errors.New("no process with the listening socket found")
}

func (r *Reader) holdsSocket(pid string, inodes map[string]struct{}) bool {
	dir := filepath.Join(r.proc, pid, "fd")

	entries, err := os.ReadDir(dir)
	if err != nil {
		// Foreign processes under another user and processes that finished
		// between reading the directory and the descriptors are a regular case of the walk.
		return false
	}

	for _, entry := range entries {
		target, err := os.Readlink(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}

		inode, ok := strings.CutPrefix(target, "socket:[")
		if !ok {
			continue
		}

		if _, ok := inodes[strings.TrimSuffix(inode, "]")]; ok {
			return true
		}
	}

	return false
}
