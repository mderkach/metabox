package cachefile

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	bolt "go.etcd.io/bbolt"
)

func TestReadRuleSetsWhileLiveCacheIsLocked(t *testing.T) {
	data, err := os.ReadFile("testdata/cache.db")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "cache.db")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	holder, err := bolt.Open(path, 0o600, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = holder.Close() }()
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)

	tags := []string{"geo-binary", "geo-source", "sub", "missing"}
	got, err := ReadRuleSets(t.Context(), path, "router", tags)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256([]byte("https://example.test/remote.srs"))
	for _, tag := range tags[:2] {
		record := got[tag]
		if record.Unreadable || record.Size == 0 || record.CheckedAt.Unix() != 100 || !bytes.Equal(record.URLHash, hash[:]) {
			t.Errorf("record %q: %+v", tag, record)
		}
	}
	if _, found := got["missing"]; found {
		t.Error("missing tag has a record")
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(data, after) {
		t.Fatalf("live cache changed: %v", err)
	}
	left, err := os.ReadDir(tmp)
	if err != nil || len(left) != 0 {
		t.Fatalf("snapshot files left: %v, error %v", left, err)
	}
}

type commitOnWrite struct {
	writer io.Writer
	commit func() error
}

func (w *commitOnWrite) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	if err != nil || w.commit == nil {
		return n, err
	}
	err = w.commit()
	w.commit = nil
	return n, err
}

func TestCacheCopyRejectsCommitBetweenMetaReads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache.db")
	db, err := bolt.Open(path, 0o600, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	out := &commitOnWrite{
		writer: io.Discard,
		commit: func() error {
			return db.Update(func(tx *bolt.Tx) error {
				_, err := tx.CreateBucket([]byte("commit"))
				return err
			})
		},
	}
	if err := copyCurrentCache(t.Context(), path, out); !errors.Is(err, errSnapshotChanged) {
		t.Fatalf("copy result = %v; want metadata change", err)
	}
	if err := copyCurrentCache(t.Context(), path, io.Discard); err != nil {
		t.Fatalf("copy after commit: %v", err)
	}
}

func TestReadRuleSetMetadataRejectsShareLink(t *testing.T) {
	for _, tc := range []struct {
		name       string
		content    string
		unreadable bool
	}{
		{"source with BOM", "\xef\xbb\xbf  {\"version\":3}", false},
		{"subscription", "vless://server", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			value := binary.AppendUvarint([]byte{1}, uint64(len(tc.content)))
			value = append(value, tc.content...)
			value = binary.BigEndian.AppendUint64(value, 100)
			value = append(value, 0)
			got := decodeRuleSetRecord(value)
			if got.Unreadable != tc.unreadable {
				t.Errorf("unreadable = %v, want %v", got.Unreadable, tc.unreadable)
			}
			if !tc.unreadable && (got.Size != int64(len(tc.content)) || !got.CheckedAt.Equal(time.Unix(100, 0)) || len(got.URLHash) != 0) {
				t.Errorf("version 1 record = %+v", got)
			}
		})
	}
}

func TestRuleSetSnapshotLimitsCacheSize(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache.db")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(path, maxSnapshotSize+1); err != nil {
		t.Fatal(err)
	}
	_, err := ReadRuleSets(t.Context(), path, "", []string{"geo"})
	if !errors.Is(err, ErrUnreadable) {
		t.Errorf("oversize cache: %v, want unreadable", err)
	}
}
