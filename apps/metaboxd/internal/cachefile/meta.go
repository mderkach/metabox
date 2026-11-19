package cachefile

import (
	"encoding/binary"
	"fmt"
	"hash/fnv"
	"os"
)

// The meta page of bbolt: a 16-byte page header, then the meta fields in native byte order.
// The checksum covers the fields before it.
const (
	pageHeader   = 16
	metaMagic    = 0xED0CDAED
	metaVersion  = 2
	metaSize     = 64
	metaChecksum = 56
)

type meta struct {
	pageSize uint32
	pgid     uint64
	txid     uint64
}

// readMeta parses the meta page at offset; ok is false for a page that is not a valid meta.
func readMeta(f *os.File, offset int64) (meta, bool) {
	buf := make([]byte, metaSize)
	if _, err := f.ReadAt(buf, offset+pageHeader); err != nil {
		return meta{}, false
	}

	order := binary.NativeEndian
	if order.Uint32(buf[0:]) != metaMagic || order.Uint32(buf[4:]) != metaVersion {
		return meta{}, false
	}

	h := fnv.New64a()
	_, _ = h.Write(buf[:metaChecksum])
	if h.Sum64() != order.Uint64(buf[metaChecksum:]) {
		return meta{}, false
	}

	return meta{pageSize: order.Uint32(buf[8:]), pgid: order.Uint64(buf[40:]), txid: order.Uint64(buf[48:])}, true
}

// checkLength refuses a file shorter than the pages its newest valid meta claims, before
// bbolt maps it: bbolt trusts the page numbers, faults on a page past the end, and a fault
// inside its Open leaves the file descriptor and the file lock with the daemon. A file without
// a valid meta is left to bbolt, which refuses it by its header without mapping the pages.
func checkLength(path string) error {
	f, err := os.Open(path) //nolint:gosec // G304: the path comes from the config the owner wrote, as for sing-box itself
	if err != nil {
		return nil
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return nil
	}

	// The second meta sits one page in; with the first one broken, bbolt takes the page size
	// of the system, and so does this check.
	first, firstOK := readMeta(f, 0)

	pageSize := int64(os.Getpagesize())
	if firstOK {
		pageSize = int64(first.pageSize)
	}

	second, secondOK := readMeta(f, pageSize)

	var newest meta

	switch {
	case firstOK && secondOK && second.txid > first.txid, !firstOK && secondOK:
		newest = second
	case firstOK:
		newest = first
	default:
		return nil
	}

	need := newest.pgid * uint64(newest.pageSize)
	if uint64(info.Size()) < need { //nolint:gosec // G115: a file size is never negative
		return fmt.Errorf("%w: %s: %d bytes, the database needs %d", ErrUnreadable, path, info.Size(), need)
	}

	return nil
}
