package ruleset

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"testing/synctest"
	"time"
)

const (
	testInterval = 24 * time.Hour
	testRetry    = time.Hour
	listsTotal   = 4
)

func discardLog() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

type fakeStore struct {
	mu     sync.Mutex
	data   []byte
	err    error
	writes int
}

func (f *fakeStore) ReadRuleSets(context.Context) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err != nil {
		return nil, f.err
	}

	if f.data == nil {
		return nil, fs.ErrNotExist
	}

	return f.data, nil
}

func (f *fakeStore) WriteRuleSets(_ context.Context, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.data = data
	f.writes++

	return nil
}

type fakeLister struct {
	mu    sync.Mutex
	calls int
	list  func(tree Tree, etag string) (Listing, error)
}

func (f *fakeLister) List(_ context.Context, tree Tree, etag string) (Listing, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()

	return f.list(tree, etag)
}

func (f *fakeLister) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.calls
}

func listing(names ...string) func(Tree, string) (Listing, error) {
	return func(Tree, string) (Listing, error) {
		return Listing{Names: names, ETag: `W/"new"`}, nil
	}
}

func findList(t *testing.T, catalog Catalog, providerID string, kind ListKind) List {
	t.Helper()

	for _, p := range catalog.Providers {
		if p.ID != providerID {
			continue
		}

		for _, l := range p.Lists {
			if l.Kind == kind {
				return l
			}
		}
	}

	t.Fatalf("no list %s/%s in the catalog", providerID, kind)

	return List{}
}

func TestGitHubList(t *testing.T) {
	const etag = `W/"abc"`

	var gotPath, gotAgent string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAgent = r.URL.EscapedPath(), r.Header.Get("User-Agent")

		switch {
		case r.Header.Get("If-None-Match") == etag:
			w.WriteHeader(http.StatusNotModified)
		default:
			w.Header().Set("ETag", etag)
			_, _ = io.WriteString(w, `{"truncated":false,"tree":[{"path":"geoip-ru.srs","type":"blob"},{"path":"sub","type":"tree"}]}`)
		}
	}))
	t.Cleanup(srv.Close)

	github := NewGitHub(srv.URL, "metabox-test", time.Second)
	tree := Tree{Owner: "o", Repo: "r", Ref: "release", Dir: "sing-box/rule-set-geoip"}

	t.Run("returns files and ETag", func(t *testing.T) {
		got, err := github.List(t.Context(), tree, "")
		if err != nil {
			t.Fatal(err)
		}

		if !slices.Equal(got.Names, []string{"geoip-ru.srs"}) || got.ETag != etag {
			t.Errorf("got %+v", got)
		}

		if gotPath != "/repos/o/r/git/trees/release:sing-box%2Frule-set-geoip" {
			t.Errorf("request path %q", gotPath)
		}

		if gotAgent != "metabox-test" {
			t.Errorf("User-Agent %q", gotAgent)
		}
	})

	t.Run("304 means the tree did not change", func(t *testing.T) {
		got, err := github.List(t.Context(), tree, etag)
		if err != nil {
			t.Fatal(err)
		}

		if !got.NotModified || got.ETag != etag {
			t.Errorf("got %+v", got)
		}
	})
}

func TestGitHubListRejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	t.Cleanup(srv.Close)

	_, err := NewGitHub(srv.URL, "metabox-test", time.Second).List(t.Context(), Tree{Owner: "o", Repo: "r", Ref: "x"}, "")
	if err == nil {
		t.Error("403 did not become an error")
	}
}

func TestGitHubListTruncated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"truncated":true,"tree":[]}`)
	}))
	t.Cleanup(srv.Close)

	_, err := NewGitHub(srv.URL, "metabox-test", time.Second).List(t.Context(), Tree{Owner: "o", Repo: "r", Ref: "x"}, "")
	if !errors.Is(err, errTruncated) {
		t.Errorf("a truncated tree gave %v", err)
	}
}

func TestCategories(t *testing.T) {
	got := categories([]string{"geosite-b.srs", "geosite-a.srs", "geosite-.srs", "geoip-c.srs", "geosite-d.json"}, "geosite-")

	if !slices.Equal(got, []string{"a", "b"}) {
		t.Errorf("got %v", got)
	}
}

func TestEmbeddedSnapshot(t *testing.T) {
	lists, err := decode(snapshot, ListSourceSnapshot)
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range providers() {
		for _, l := range p.lists {
			e, ok := lists[key(p.id, l.kind)]
			if !ok || len(e.Categories) == 0 {
				t.Errorf("no list %s in the snapshot", key(p.id, l.kind))

				continue
			}

			for _, featured := range l.featured {
				if _, found := slices.BinarySearch(e.Categories, featured); !found {
					t.Errorf("collection %s leads to category %q that the provider does not have", key(p.id, l.kind), featured)
				}
			}
		}
	}
}

func TestNewUpdater(t *testing.T) {
	t.Run("without a cache the catalog is on the snapshot", func(t *testing.T) {
		u, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		if got := findList(t, u.Catalog(), "runetfreedom", KindGeosite); got.Source != ListSourceSnapshot || len(got.Categories) == 0 {
			t.Errorf("list %+v", got.Source)
		}
	})

	t.Run("the cache overrides the snapshot", func(t *testing.T) {
		store := &fakeStore{data: []byte(`{"lists":{"v2fly/geoip":{"categories":["xx"],"updated_at":7},"gone/geoip":{"categories":["y"]}}}`)}

		u, err := NewUpdater(t.Context(), &fakeLister{}, store, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		got := findList(t, u.Catalog(), "v2fly", KindGeoip)
		if got.Source != ListSourceProvider || !slices.Equal(got.Categories, []string{"xx"}) || got.UpdatedAt != 7 {
			t.Errorf("list %+v", got)
		}
	})

	t.Run("a corrupted cache does not prevent the start", func(t *testing.T) {
		u, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{data: []byte("{")}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		if got := findList(t, u.Catalog(), "v2fly", KindGeoip); got.Source != ListSourceSnapshot {
			t.Errorf("source %q", got.Source)
		}
	})
}

func TestRefresh(t *testing.T) {
	t.Run("the verified listing replaces the snapshot and goes to the cache", func(t *testing.T) {
		store := &fakeStore{}
		lister := &fakeLister{list: listing("geosite-b.srs", "geosite-a.srs", "geoip-z.srs")}

		u, err := NewUpdater(t.Context(), lister, store, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		if err := u.refresh(t.Context()); err != nil {
			t.Fatal(err)
		}

		got := findList(t, u.Catalog(), "runetfreedom", KindGeosite)
		if got.Source != ListSourceProvider || !slices.Equal(got.Categories, []string{"a", "b"}) {
			t.Errorf("list %+v", got)
		}

		var saved file
		if err := json.Unmarshal(store.data, &saved); err != nil {
			t.Fatal(err)
		}

		if len(saved.Lists) != listsTotal || saved.Lists["runetfreedom/geosite"].ETag != `W/"new"` {
			t.Errorf("in the cache %+v", saved.Lists)
		}
	})

	t.Run("304 keeps the listing and updates the date", func(t *testing.T) {
		lister := &fakeLister{list: func(_ Tree, etag string) (Listing, error) {
			return Listing{ETag: etag, NotModified: true}, nil
		}}

		u, err := NewUpdater(t.Context(), lister, &fakeStore{}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		before := findList(t, u.Catalog(), "v2fly", KindGeosite)

		if err := u.refresh(t.Context()); err != nil {
			t.Fatal(err)
		}

		after := findList(t, u.Catalog(), "v2fly", KindGeosite)
		if !slices.Equal(before.Categories, after.Categories) || after.Source != ListSourceProvider {
			t.Errorf("the listing changed or stayed the snapshot: %q", after.Source)
		}

		if after.UpdatedAt <= before.UpdatedAt {
			t.Errorf("the check date did not grow: was %d, now %d", before.UpdatedAt, after.UpdatedAt)
		}
	})

	t.Run("a failure and an empty tree keep the previous listing", func(t *testing.T) {
		store := &fakeStore{}
		lister := &fakeLister{list: func(tree Tree, _ string) (Listing, error) {
			if tree.Repo == "sing-geoip" {
				return Listing{}, errors.New("сеть")
			}

			return Listing{Names: []string{"readme.md"}}, nil
		}}

		u, err := NewUpdater(t.Context(), lister, store, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		before := findList(t, u.Catalog(), "v2fly", KindGeoip)

		if err := u.refresh(t.Context()); err == nil {
			t.Fatal("a check failure did not return an error")
		}

		after := findList(t, u.Catalog(), "v2fly", KindGeoip)
		if !slices.Equal(before.Categories, after.Categories) || after.Source != ListSourceSnapshot {
			t.Error("the previous listing is lost")
		}

		if store.writes != 0 {
			t.Error("an unverified snapshot was written to the cache")
		}
	})
}

func TestUpdaterSchedule(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		lister := &fakeLister{list: listing("geosite-a.srs", "geoip-a.srs")}

		u, err := NewUpdater(t.Context(), lister, &fakeStore{}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		u.Start()
		t.Cleanup(u.Close)

		synctest.Wait()

		if got := lister.count(); got != listsTotal {
			t.Fatalf("the snapshot is checked immediately: requests %d", got)
		}

		time.Sleep(testInterval - time.Minute)
		synctest.Wait()

		if got := lister.count(); got != listsTotal {
			t.Fatalf("check earlier than the interval: requests %d", got)
		}

		time.Sleep(time.Minute)
		synctest.Wait()

		if got := lister.count(); got != 2*listsTotal {
			t.Errorf("check by interval: requests %d", got)
		}
	})
}

func TestUpdaterRetry(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		lister := &fakeLister{list: func(Tree, string) (Listing, error) {
			return Listing{}, errors.New("сеть ещё не поднялась")
		}}

		u, err := NewUpdater(t.Context(), lister, &fakeStore{}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		u.Start()
		t.Cleanup(u.Close)

		time.Sleep(testRetry)
		synctest.Wait()

		if got := lister.count(); got != 2*listsTotal {
			t.Errorf("a failed check is repeated after retry: requests %d", got)
		}
	})
}

func TestUpdaterDisabled(t *testing.T) {
	lister := &fakeLister{}

	u, err := NewUpdater(t.Context(), lister, &fakeStore{}, discardLog(), 0, testRetry)
	if err != nil {
		t.Fatal(err)
	}

	u.Start()
	u.Close()

	if lister.count() != 0 {
		t.Error("a zero interval went to the network")
	}
}

// cacheAt is a cache in which all lists are checked at the given moment.
func cacheAt(t *testing.T, at time.Time, skip string) []byte {
	t.Helper()

	f := file{Lists: map[string]entry{}}

	for _, p := range providers() {
		for _, l := range p.lists {
			if name := key(p.id, l.kind); name != skip {
				f.Lists[name] = entry{Categories: []string{"a"}, UpdatedAt: at.Unix()}
			}
		}
	}

	data, err := json.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}

	return data
}

func TestUntilStale(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)

	tests := []struct {
		name  string
		cache []byte
		want  time.Duration
	}{
		{"a fresh cache waits for the rest of the interval", cacheAt(t, now.Add(-23*time.Hour), ""), time.Hour},
		{"a stale cache is checked at once", cacheAt(t, now.Add(-25*time.Hour), ""), 0},
		{"a date from the future: the clock is not synchronized, check at once", cacheAt(t, now.Add(time.Hour), ""), 0},
		{"a list left on the snapshot is checked at once", cacheAt(t, now, "v2fly/geoip"), 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{data: tt.cache}, discardLog(), testInterval, testRetry)
			if err != nil {
				t.Fatal(err)
			}

			if got := u.untilStale(now); got != tt.want {
				t.Errorf("wait %s, expected %s", got, tt.want)
			}
		})
	}
}

func TestNewUpdaterRejectsShortInterval(t *testing.T) {
	if _, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{}, discardLog(), time.Minute, testRetry); err == nil {
		t.Error("an interval shorter than the retry pause accepted")
	}
}

func TestSaveSkipsUnchangedCache(t *testing.T) {
	store := &fakeStore{}
	fail := false
	lister := &fakeLister{list: func(Tree, string) (Listing, error) {
		if fail {
			return Listing{}, errors.New("сеть")
		}

		return Listing{Names: []string{"geosite-a.srs", "geoip-a.srs"}}, nil
	}}

	u, err := NewUpdater(t.Context(), lister, store, discardLog(), testInterval, testRetry)
	if err != nil {
		t.Fatal(err)
	}

	if err := u.refresh(t.Context()); err != nil {
		t.Fatal(err)
	}

	fail = true

	if err := u.refresh(t.Context()); err == nil {
		t.Fatal("a check failure did not return an error")
	}

	if store.writes != 1 {
		t.Errorf("an unchanged cache was rewritten: writes %d, expected 1", store.writes)
	}

	restarted, err := NewUpdater(t.Context(), lister, store, discardLog(), testInterval, testRetry)
	if err != nil {
		t.Fatal(err)
	}

	if err := restarted.refresh(t.Context()); err == nil {
		t.Fatal("a check failure did not return an error")
	}

	if store.writes != 1 {
		t.Errorf("after a restart the same cache was rewritten: writes %d", store.writes)
	}
}
