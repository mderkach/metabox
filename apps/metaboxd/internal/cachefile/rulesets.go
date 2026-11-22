package cachefile

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime/debug"
	"time"

	bolt "go.etcd.io/bbolt"
)

const (
	maxSnapshotSize = 64 << 20
	snapshotRetries = 3
)

var errSnapshotChanged = errors.New("cache changed during snapshot")

// RuleSetRecord contains only the metadata retained after the snapshot is closed.
type RuleSetRecord struct {
	CheckedAt  time.Time
	Size       int64
	URLHash    []byte
	Unreadable bool
}

// ReadRuleSets reads metadata for the requested tags without locking the live cache.
// Missing records are omitted. An unrecognized record is returned as unreadable.
func ReadRuleSets(ctx context.Context, path, cacheID string, tags []string) (_ map[string]RuleSetRecord, err error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	dir, err := os.MkdirTemp("", "metabox-cache-*")
	if err != nil {
		return nil, fmt.Errorf("make cache snapshot directory: %w", err)
	}
	defer func() { err = errors.Join(err, os.RemoveAll(dir)) }()

	snapshot := filepath.Join(dir, "cache.db")
	for range snapshotRetries {
		err = writeCacheSnapshot(ctx, path, snapshot)
		if !errors.Is(err, errSnapshotChanged) {
			break
		}
	}
	if err != nil {
		return nil, err
	}

	return readRuleSetSnapshot(ctx, snapshot, cacheID, tags)
}

func writeCacheSnapshot(ctx context.Context, path, snapshot string) error {
	out, err := os.OpenFile(snapshot, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600) //nolint:gosec // G304: private snapshot directory
	if err != nil {
		return fmt.Errorf("open cache snapshot: %w", err)
	}

	copyErr := copyCurrentCache(ctx, path, out)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func copyCurrentCache(ctx context.Context, path string, out io.Writer) error {
	f, err := os.Open(path) //nolint:gosec // G304: the applied config supplies the cache path
	if err != nil {
		return fmt.Errorf("open live cache: %w", err)
	}
	defer func() { _ = f.Close() }()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Size() > maxSnapshotSize {
		return fmt.Errorf("%w: cache must be a regular file no larger than %d bytes", ErrUnreadable, maxSnapshotSize)
	}
	before, err := snapshotMeta(f)
	if err != nil {
		return err
	}

	var offset int64
	var buf [64 << 10]byte
	for offset < info.Size() {
		if err := ctx.Err(); err != nil {
			return err
		}
		chunk := buf[:min(int64(len(buf)), info.Size()-offset)]
		if _, err := f.ReadAt(chunk, offset); err != nil {
			if errors.Is(err, io.EOF) {
				return errSnapshotChanged
			}
			return err
		}
		n, err := out.Write(chunk)
		if err != nil {
			return err
		}
		if n != len(chunk) {
			return io.ErrShortWrite
		}
		offset += int64(n)
	}

	after, err := snapshotMeta(f)
	if err != nil {
		return errSnapshotChanged
	}
	current, err := os.Stat(path)
	if err != nil || !os.SameFile(info, current) || info.Size() != current.Size() || before != after {
		return errSnapshotChanged
	}
	return ctx.Err()
}

func snapshotMeta(f *os.File) ([2][pageHeader + metaSize]byte, error) {
	var pages [2][pageHeader + metaSize]byte
	first, ok := readMeta(f, 0)
	pageSize := int64(os.Getpagesize())
	if ok {
		pageSize = int64(first.pageSize)
	}
	if pageSize < pageHeader+metaSize || pageSize > maxSnapshotSize {
		return pages, ErrUnreadable
	}
	for i := range pages {
		if _, err := f.ReadAt(pages[i][:], int64(i)*pageSize); err != nil {
			return pages, fmt.Errorf("%w: read cache meta: %w", ErrUnreadable, err)
		}
	}
	return pages, nil
}

func readRuleSetSnapshot(ctx context.Context, path, cacheID string, tags []string) (_ map[string]RuleSetRecord, err error) {
	defer debug.SetPanicOnFault(debug.SetPanicOnFault(true))
	defer func() {
		if fault := recover(); fault != nil {
			err = fmt.Errorf("%w: invalid snapshot pages: %v", ErrUnreadable, fault)
		}
	}()

	if err := checkLength(path); err != nil {
		return nil, err
	}
	db, err := bolt.Open(path, 0o600, &bolt.Options{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("open cache snapshot: %w", err)
	}
	defer func() { err = errors.Join(err, db.Close()) }()

	records := make(map[string]RuleSetRecord, len(tags))
	err = db.View(func(tx *bolt.Tx) error {
		b := subscriptions(tx, cacheID)
		if b == nil {
			return nil
		}
		for _, tag := range tags {
			if err := ctx.Err(); err != nil {
				return err
			}
			if value := b.Get([]byte(tag)); value != nil {
				records[tag] = decodeRuleSetRecord(value)
			}
		}
		return nil
	})
	return records, err
}

func decodeRuleSetRecord(value []byte) RuleSetRecord {
	unreadable := RuleSetRecord{Unreadable: true}
	if len(value) == 0 || (value[0] != 1 && value[0] != 2) {
		return unreadable
	}
	version := value[0]
	value = value[1:]
	content, rest, ok := savedBinaryField(value)
	if !ok || len(rest) < 8 {
		return unreadable
	}
	prefix := bytes.TrimLeft(bytes.TrimPrefix(content, []byte{0xef, 0xbb, 0xbf}), " \t\r\n")
	if !bytes.HasPrefix(prefix, []byte("SRS")) && !bytes.HasPrefix(prefix, []byte("{")) {
		return unreadable
	}
	result := RuleSetRecord{
		Size:      int64(len(content)),
		CheckedAt: time.Unix(int64(binary.BigEndian.Uint64(rest[:8])), 0), //nolint:gosec // G115: the stored timestamp is signed
	}
	_, rest, ok = savedBinaryField(rest[8:])
	if !ok {
		return unreadable
	}
	if version == 2 {
		var hash []byte
		hash, rest, ok = savedBinaryField(rest)
		if !ok || (len(hash) != 0 && len(hash) != sha256.Size) {
			return unreadable
		}
		result.URLHash = bytes.Clone(hash)
	}
	if len(rest) != 0 {
		return unreadable
	}
	return result
}

func savedBinaryField(data []byte) (field, rest []byte, ok bool) {
	length, width := binary.Uvarint(data)
	if width <= 0 {
		return nil, nil, false
	}
	if length > uint64(len(data)-width) { //nolint:gosec // G115: Uvarint consumes at most len(data) bytes
		return nil, nil, false
	}
	end := width + int(length) //nolint:gosec // G115: the checked length fits in the remaining slice
	return data[width:end], data[end:], true
}
