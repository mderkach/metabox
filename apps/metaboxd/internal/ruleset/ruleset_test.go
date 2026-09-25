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

	t.Fatalf("в каталоге нет списка %s/%s", providerID, kind)

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

	t.Run("отдаёт файлы и ETag", func(t *testing.T) {
		got, err := github.List(t.Context(), tree, "")
		if err != nil {
			t.Fatal(err)
		}

		if !slices.Equal(got.Names, []string{"geoip-ru.srs"}) || got.ETag != etag {
			t.Errorf("получили %+v", got)
		}

		if gotPath != "/repos/o/r/git/trees/release:sing-box%2Frule-set-geoip" {
			t.Errorf("путь запроса %q", gotPath)
		}

		if gotAgent != "metabox-test" {
			t.Errorf("User-Agent %q", gotAgent)
		}
	})

	t.Run("304 — дерево не менялось", func(t *testing.T) {
		got, err := github.List(t.Context(), tree, etag)
		if err != nil {
			t.Fatal(err)
		}

		if !got.NotModified || got.ETag != etag {
			t.Errorf("получили %+v", got)
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
		t.Error("403 не стал ошибкой")
	}
}

func TestGitHubListTruncated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"truncated":true,"tree":[]}`)
	}))
	t.Cleanup(srv.Close)

	_, err := NewGitHub(srv.URL, "metabox-test", time.Second).List(t.Context(), Tree{Owner: "o", Repo: "r", Ref: "x"}, "")
	if !errors.Is(err, errTruncated) {
		t.Errorf("урезанное дерево дало %v", err)
	}
}

func TestCategories(t *testing.T) {
	got := categories([]string{"geosite-b.srs", "geosite-a.srs", "geosite-.srs", "geoip-c.srs", "geosite-d.json"}, "geosite-")

	if !slices.Equal(got, []string{"a", "b"}) {
		t.Errorf("получили %v", got)
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
				t.Errorf("в снимке нет списка %s", key(p.id, l.kind))

				continue
			}

			for _, featured := range l.featured {
				if _, found := slices.BinarySearch(e.Categories, featured); !found {
					t.Errorf("подборка %s ведёт на категорию %q, которой у поставщика нет", key(p.id, l.kind), featured)
				}
			}
		}
	}
}

func TestNewUpdater(t *testing.T) {
	t.Run("без кэша каталог на снимке", func(t *testing.T) {
		u, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		if got := findList(t, u.Catalog(), "runetfreedom", KindGeosite); got.Source != ListSourceSnapshot || len(got.Categories) == 0 {
			t.Errorf("список %+v", got.Source)
		}
	})

	t.Run("кэш перекрывает снимок", func(t *testing.T) {
		store := &fakeStore{data: []byte(`{"lists":{"v2fly/geoip":{"categories":["xx"],"updated_at":7},"gone/geoip":{"categories":["y"]}}}`)}

		u, err := NewUpdater(t.Context(), &fakeLister{}, store, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		got := findList(t, u.Catalog(), "v2fly", KindGeoip)
		if got.Source != ListSourceProvider || !slices.Equal(got.Categories, []string{"xx"}) || got.UpdatedAt != 7 {
			t.Errorf("список %+v", got)
		}
	})

	t.Run("испорченный кэш не мешает запуску", func(t *testing.T) {
		u, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{data: []byte("{")}, discardLog(), testInterval, testRetry)
		if err != nil {
			t.Fatal(err)
		}

		if got := findList(t, u.Catalog(), "v2fly", KindGeoip); got.Source != ListSourceSnapshot {
			t.Errorf("источник %q", got.Source)
		}
	})
}

func TestRefresh(t *testing.T) {
	t.Run("сверенный перечень заменяет снимок и уходит в кэш", func(t *testing.T) {
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
			t.Errorf("список %+v", got)
		}

		var saved file
		if err := json.Unmarshal(store.data, &saved); err != nil {
			t.Fatal(err)
		}

		if len(saved.Lists) != listsTotal || saved.Lists["runetfreedom/geosite"].ETag != `W/"new"` {
			t.Errorf("в кэше %+v", saved.Lists)
		}
	})

	t.Run("304 сохраняет перечень и обновляет дату", func(t *testing.T) {
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
			t.Errorf("перечень изменился или остался снимком: %q", after.Source)
		}

		if after.UpdatedAt <= before.UpdatedAt {
			t.Errorf("дата сверки не выросла: было %d, стало %d", before.UpdatedAt, after.UpdatedAt)
		}
	})

	t.Run("отказ и пустое дерево оставляют прежний перечень", func(t *testing.T) {
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
			t.Fatal("отказ сверки не вернул ошибку")
		}

		after := findList(t, u.Catalog(), "v2fly", KindGeoip)
		if !slices.Equal(before.Categories, after.Categories) || after.Source != ListSourceSnapshot {
			t.Error("прежний перечень потерян")
		}

		if store.writes != 0 {
			t.Error("несверенный снимок записан в кэш")
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
			t.Fatalf("снимок сверяется сразу: запросов %d", got)
		}

		time.Sleep(testInterval - time.Minute)
		synctest.Wait()

		if got := lister.count(); got != listsTotal {
			t.Fatalf("сверка раньше интервала: запросов %d", got)
		}

		time.Sleep(time.Minute)
		synctest.Wait()

		if got := lister.count(); got != 2*listsTotal {
			t.Errorf("сверка по интервалу: запросов %d", got)
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
			t.Errorf("неудачная сверка повторяется через retry: запросов %d", got)
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
		t.Error("нулевой интервал сходил в сеть")
	}
}

// cacheAt — кэш, в котором все списки сверены в указанный момент.
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
		{"свежий кэш ждёт остаток интервала", cacheAt(t, now.Add(-23*time.Hour), ""), time.Hour},
		{"устаревший кэш сверяется сразу", cacheAt(t, now.Add(-25*time.Hour), ""), 0},
		{"дата из будущего — часы не синхронизованы, сверка сразу", cacheAt(t, now.Add(time.Hour), ""), 0},
		{"список, оставшийся на снимке, сверяется сразу", cacheAt(t, now, "v2fly/geoip"), 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{data: tt.cache}, discardLog(), testInterval, testRetry)
			if err != nil {
				t.Fatal(err)
			}

			if got := u.untilStale(now); got != tt.want {
				t.Errorf("ждать %s, ожидали %s", got, tt.want)
			}
		})
	}
}

func TestNewUpdaterRejectsShortInterval(t *testing.T) {
	if _, err := NewUpdater(t.Context(), &fakeLister{}, &fakeStore{}, discardLog(), time.Minute, testRetry); err == nil {
		t.Error("интервал короче паузы повтора принят")
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
		t.Fatal("отказ сверки не вернул ошибку")
	}

	if store.writes != 1 {
		t.Errorf("неизменный кэш переписан: записей %d, ожидали 1", store.writes)
	}

	restarted, err := NewUpdater(t.Context(), lister, store, discardLog(), testInterval, testRetry)
	if err != nil {
		t.Fatal(err)
	}

	if err := restarted.refresh(t.Context()); err == nil {
		t.Fatal("отказ сверки не вернул ошибку")
	}

	if store.writes != 1 {
		t.Errorf("после перезапуска тот же кэш переписан: записей %d", store.writes)
	}
}
