package cachefile_test

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	bolt "go.etcd.io/bbolt"

	"metabox/internal/cachefile"
)

var editor = cachefile.Editor{LockTimeout: 50 * time.Millisecond}

// fixture copies the cache file the pinned fork wrote (make cache-fixture): top level holds
// subscriptions sub and other and the rule set geo, the bucket of cache id router holds sub and two remote rule sets.
func fixture(t *testing.T) string {
	t.Helper()

	data, err := os.ReadFile("testdata/cache.db")
	if err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(t.TempDir(), "cache.db")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}

	return path
}

// keys lists the keys of the rule_set bucket, at the top level or under a cache id.
func keys(t *testing.T, path, cacheID string) []string {
	t.Helper()

	db, err := bolt.Open(path, 0o600, &bolt.Options{ReadOnly: true, Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	var found []string

	err = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("rule_set"))
		if cacheID != "" {
			b = tx.Bucket(append([]byte{0}, cacheID...)).Bucket([]byte("rule_set"))
		}

		return b.ForEach(func(k, _ []byte) error {
			found = append(found, string(k))

			return nil
		})
	})
	if err != nil {
		t.Fatal(err)
	}

	slices.Sort(found)

	return found
}

func TestDropDeletesOnlyTheNamedEntry(t *testing.T) {
	path := fixture(t)

	if err := editor.Drop(t.Context(), path, "", "sub"); err != nil {
		t.Fatalf("drop: %v", err)
	}

	if got, want := keys(t, path, ""), []string{"geo", "other"}; !slices.Equal(got, want) {
		t.Errorf("top level keys %v, want %v", got, want)
	}
	if got, want := keys(t, path, "router"), []string{"geo-binary", "geo-source", "sub"}; !slices.Equal(got, want) {
		t.Errorf("keys of cache id router %v, want %v: another id was touched", got, want)
	}
}

func TestDropFollowsTheCacheID(t *testing.T) {
	path := fixture(t)

	if err := editor.Drop(t.Context(), path, "router", "sub"); err != nil {
		t.Fatalf("drop: %v", err)
	}

	if got, want := keys(t, path, "router"), []string{"geo-binary", "geo-source"}; !slices.Equal(got, want) {
		t.Errorf("keys of cache id router %v, want %v", got, want)
	}
	if got, want := keys(t, path, ""), []string{"geo", "other", "sub"}; !slices.Equal(got, want) {
		t.Errorf("top level keys %v, want %v", got, want)
	}
}

func TestDropRefusesWhatItCannotDo(t *testing.T) {
	t.Run("absent tag", func(t *testing.T) {
		err := editor.Drop(t.Context(), fixture(t), "", "missing")
		if !errors.Is(err, cachefile.ErrNoEntry) {
			t.Errorf("error %v, want ErrNoEntry", err)
		}
	})

	t.Run("absent cache id", func(t *testing.T) {
		err := editor.Drop(t.Context(), fixture(t), "other-router", "sub")
		if !errors.Is(err, cachefile.ErrNoEntry) {
			t.Errorf("error %v, want ErrNoEntry", err)
		}
	})

	t.Run("missing file is not created", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "cache.db")

		err := editor.Drop(t.Context(), path, "", "sub")
		if !errors.Is(err, cachefile.ErrNoEntry) {
			t.Errorf("error %v, want ErrNoEntry", err)
		}
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("drop created the file: %v", err)
		}
	})

	t.Run("held lock leaves the file", func(t *testing.T) {
		path := fixture(t)

		holder, err := bolt.Open(path, 0o600, nil)
		if err != nil {
			t.Fatal(err)
		}

		err = editor.Drop(t.Context(), path, "", "sub")
		_ = holder.Close()

		if !errors.Is(err, cachefile.ErrLocked) {
			t.Fatalf("error %v, want ErrLocked", err)
		}
		if got := keys(t, path, ""); !slices.Contains(got, "sub") {
			t.Errorf("keys %v: the entry went under a held lock", got)
		}
	})

	t.Run("garbage file", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "cache.db")
		if err := os.WriteFile(path, []byte("not a database, but long enough to have a header page"), 0o600); err != nil {
			t.Fatal(err)
		}

		err := editor.Drop(t.Context(), path, "", "sub")
		if !errors.Is(err, cachefile.ErrUnreadable) {
			t.Errorf("error %v, want ErrUnreadable", err)
		}
	})

	// A file cut short faults the bbolt reader in its mmap; the daemon must survive it.
	for _, size := range []string{"one page", "partial last used page"} {
		t.Run("file cut to "+size, func(t *testing.T) {
			original := fixture(t)
			db, err := bolt.Open(original, 0o600, &bolt.Options{ReadOnly: true})
			if err != nil {
				t.Fatal(err)
			}
			var cut int64
			pageSize := db.Info().PageSize
			err = db.View(func(tx *bolt.Tx) error {
				cut = tx.Size() - 1
				return nil
			})
			if closeErr := db.Close(); closeErr != nil {
				t.Fatal(closeErr)
			}
			if err != nil {
				t.Fatal(err)
			}
			if size == "one page" {
				cut = int64(pageSize)
			}
			data, err := os.ReadFile(original)
			if err != nil {
				t.Fatal(err)
			}

			path := filepath.Join(t.TempDir(), "cache.db")
			if err := os.WriteFile(path, data[:cut], 0o600); err != nil {
				t.Fatal(err)
			}

			// The second attempt must not find the file locked by the first one.
			for attempt := range 2 {
				if err := editor.Drop(t.Context(), path, "", "sub"); !errors.Is(err, cachefile.ErrUnreadable) {
					t.Errorf("attempt %d: error %v, want ErrUnreadable", attempt+1, err)
				}
			}
		})
	}

	// A file the system refuses to open is not a broken database: it is not moved aside.
	t.Run("a path the system cannot open", func(t *testing.T) {
		err := editor.Drop(t.Context(), t.TempDir(), "", "sub")
		if err == nil || errors.Is(err, cachefile.ErrUnreadable) {
			t.Errorf("error %v, want a plain open error", err)
		}
	})
}

func TestPoisonedProvider(t *testing.T) {
	tests := []struct {
		name   string
		reason string
		tag    string
		ok     bool
	}{
		{
			"crash on a cached subscription",
			"FATAL[0000] start service: start provider/remote[sub]: restore cached outbound provider: no servers found",
			"sub", true,
		},
		{
			"tag with a bracket",
			"FATAL[0000] start service: start provider/remote[a]b]: restore cached outbound provider: x",
			"a]b", true,
		},
		{
			"an earlier crash in the log does not count",
			"FATAL[0000] start service: start provider/remote[sub]: restore cached outbound provider: x\n" +
				"FATAL[0000] start service: initial rule-set: geo: timeout",
			"", false,
		},
		{"another crash", "FATAL[0000] decode config: unknown field", "", false},
		{"no reason", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tag, ok := cachefile.PoisonedProvider(tt.reason)
			if tag != tt.tag || ok != tt.ok {
				t.Errorf("got %q, %v; want %q, %v", tag, ok, tt.tag, tt.ok)
			}
		})
	}
}

func TestMoveAside(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cache.db")

	for _, content := range []string{"first", "second"} {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}

		aside, err := editor.MoveAside(t.Context(), path)
		if err != nil {
			t.Fatalf("move aside: %v", err)
		}
		if aside != path+".broken" {
			t.Errorf("moved to %s, want %s.broken", aside, path)
		}
	}

	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the file stayed in place: %v", err)
	}

	// One fixed name: the second move replaced the first.
	if got, err := os.ReadFile(path + ".broken"); err != nil || string(got) != "second" {
		t.Errorf("moved file %q, %v; want the last one", got, err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Errorf("directory holds %d files, want one moved file", len(entries))
	}
}
