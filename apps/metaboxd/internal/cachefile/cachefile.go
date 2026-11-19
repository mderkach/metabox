// Package cachefile edits the sing-box cache file (experimental.cache_file), a bbolt database
// the core owns. It knows only the layout the fork uses for subscriptions: the bucket
// rule_set keyed by the provider tag, nested under a bucket named 0x00 + cache_id when the
// config sets one. The core holds the file lock while it runs, so the file is edited only with
// the sing-box process stopped.
package cachefile

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime/debug"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"
	bolterrors "go.etcd.io/bbolt/errors"
)

var (
	// ErrLocked means another process holds the file: the core is still running, or has not
	// let go of it yet. The file is not changed.
	ErrLocked = errors.New("cache file is locked by another process")
	// ErrNoEntry means the file has no entry for the tag: there is nothing to drop.
	ErrNoEntry = errors.New("no cached subscription entry")
	// ErrUnreadable means the file is not a bbolt database: a foreign or broken header, a
	// broken page, or a file cut short. A failure of the system to open or map a good file is
	// not one of them.
	ErrUnreadable = errors.New("cache file is not a readable database")
)

// bucket is where the fork keeps subscriptions and remote rule sets.
var bucket = []byte("rule_set")

// Editor edits cache files. LockTimeout bounds the wait for the file lock: the core may still
// be letting go of it after its process was stopped.
type Editor struct {
	LockTimeout time.Duration
}

// shortFile opens what bbolt says about a file shorter than its pages; the error has no
// variable of its own.
const shortFile = "file size too small"

// unreadable reports whether bbolt refused the file for its content.
func unreadable(err error) bool {
	return errors.Is(err, bolterrors.ErrInvalid) ||
		errors.Is(err, bolterrors.ErrChecksum) ||
		errors.Is(err, bolterrors.ErrVersionMismatch) ||
		strings.HasPrefix(err.Error(), shortFile)
}

// Drop deletes the cached subscription of tag. cacheID is experimental.cache_file.cache_id
// of the config the service runs; empty means the top-level bucket. Other keys and buckets
// stay as they are. A missing file is ErrNoEntry: opening it would create an empty database.
func (e Editor) Drop(ctx context.Context, path, cacheID, tag string) (err error) {
	if err := ctx.Err(); err != nil {
		return err
	}

	// bbolt reads the file through mmap and trusts its page numbers: a broken page the length
	// check below does not catch faults the reader, which would end the whole daemon.
	defer debug.SetPanicOnFault(debug.SetPanicOnFault(true))
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%w: %s: %v", ErrUnreadable, path, r)
		}
	}()

	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%w: no file %s", ErrNoEntry, path)
		}

		return fmt.Errorf("cache file %s: %w", path, err)
	}

	if err := checkLength(path); err != nil {
		return err
	}

	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: e.LockTimeout})
	if errors.Is(err, bolterrors.ErrTimeout) {
		return fmt.Errorf("%w: %s", ErrLocked, path)
	}
	if err != nil && unreadable(err) {
		return fmt.Errorf("%w: %s: %w", ErrUnreadable, path, err)
	}
	if err != nil {
		return fmt.Errorf("open cache file %s: %w", path, err)
	}

	updateErr := db.Update(func(tx *bolt.Tx) error {
		b := subscriptions(tx, cacheID)
		if b == nil || b.Get([]byte(tag)) == nil {
			return fmt.Errorf("%w: %q", ErrNoEntry, tag)
		}

		return b.Delete([]byte(tag))
	})

	if err := db.Close(); err != nil && updateErr == nil {
		return fmt.Errorf("close cache file %s: %w", path, err)
	}

	return updateErr
}

func subscriptions(tx *bolt.Tx, cacheID string) *bolt.Bucket {
	if cacheID == "" {
		return tx.Bucket(bucket)
	}

	parent := tx.Bucket(append([]byte{0}, cacheID...))
	if parent == nil {
		return nil
	}

	return parent.Bucket(bucket)
}

// restoreFailure is what the fork says when a cached subscription does not parse back: it
// fails the provider, and the provider fails the whole start.
const restoreFailure = "]: restore cached outbound provider"

const providerPrefix = "provider/remote["

// PoisonedProvider finds the provider tag in the crash reason of the service: the last line
// of the reason, so an earlier crash in the log does not count. ok is false for any other crash.
func PoisonedProvider(reason string) (tag string, ok bool) {
	reason = strings.TrimSpace(reason)
	if i := strings.LastIndexByte(reason, '\n'); i >= 0 {
		reason = reason[i+1:]
	}

	end := strings.Index(reason, restoreFailure)
	if end < 0 {
		return "", false
	}

	start := strings.LastIndex(reason[:end], providerPrefix)
	if start < 0 {
		return "", false
	}

	tag = reason[start+len(providerPrefix) : end]

	return tag, tag != ""
}
