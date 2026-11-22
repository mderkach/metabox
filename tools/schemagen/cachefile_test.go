package main

import (
	"bytes"
	"crypto/sha256"
	"flag"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	box "github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/adapter"
	"github.com/sagernet/sing-box/common/srs"
	C "github.com/sagernet/sing-box/constant"
	"github.com/sagernet/sing-box/experimental/cachefile"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/log"
	"github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing-box/parser/link"
	"github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/service"
)

// The daemon repairs a cache entry the fork wrote and then refuses to read. These tests pin
// each step of that failure on its own, so a fork bump that fixes one of them fails exactly
// the test of what it fixed.

var updateCacheFixture = flag.Bool("update-cache-fixture", false, "rewrite the daemon's cache file fixture")

// cacheFixture is the cache file the daemon tests edit: written here by the fork's own code.
const cacheFixture = "../../apps/metaboxd/internal/cachefile/testdata/cache.db"

const (
	// poisonedEntry is a cached subscription the fork cannot read back: an outbound type it
	// does not know. It fails the restore for a reason unrelated to x_padding_bytes.
	poisonedEntry = `{"outbounds":[{"type":"no-such-type","tag":"n1"}]}`
	healthyEntry  = `{"outbounds":[{"type":"socks","tag":"s1","server":"127.0.0.1","server_port":1080}]}`
	ruleSetEntry  = "rule set content"
	fixtureID     = "router"
	ruleSetSource = `{"version":3,"rules":[{"domain_suffix":["example.test"]}]}`
	ruleSetURL    = "https://example.test/remote.srs"
)

func TestForkParsesXHTTPLinkWithoutPaddingAsZero(t *testing.T) {
	outbound, err := link.ParseSubscriptionLink(
		"vless://11111111-1111-1111-1111-111111111111@127.0.0.1:443?type=xhttp&path=%2Fx&security=none#n1")
	if err != nil {
		t.Fatalf("parse link: %v", err)
	}

	options, ok := outbound.Options.(*option.VLESSOutboundOptions)
	if !ok {
		t.Fatalf("parsed options %T, want VLESS", outbound.Options)
	}
	if options.Transport == nil {
		t.Fatal("parsed outbound has no transport")
	}

	padding := options.Transport.XHTTPOptions.XPaddingBytes
	if padding.From != 0 || padding.To != 0 {
		t.Errorf("x_padding_bytes %d-%d: the fork now fills the range a link omits", padding.From, padding.To)
	}
}

func TestForkRejectsZeroXHTTPPadding(t *testing.T) {
	raw := `{"outbounds":[{"type":"vless","tag":"n1","server":"127.0.0.1","server_port":443,` +
		`"uuid":"11111111-1111-1111-1111-111111111111",` +
		`"transport":{"type":"xhttp","path":"/x","x_padding_bytes":0}}]}`

	ctx := service.ContextWithDefaultRegistry(include.Context(t.Context()))

	_, err := json.UnmarshalExtendedContext[option.Options](ctx, []byte(raw))
	if err == nil || !strings.Contains(err.Error(), "x_padding_bytes cannot be disabled") {
		t.Errorf("decode error %v: the fork now accepts a zero x_padding_bytes", err)
	}
}

func TestForkFailsStartOnUnreadableCachedSubscription(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache.db")
	writeCache(t, path, "", map[string]string{"sub": poisonedEntry}, nil)

	err := startWithCache(t, path)
	if err == nil || !strings.Contains(err.Error(), "provider/remote[sub]: restore cached outbound provider") {
		t.Errorf("start error %v: the fork no longer fails the start on an unreadable cached subscription", err)
	}
}

// The whole chain of issue 338 in one test: the link parsed the way the provider parses a
// download, the entry written the way the provider saves it, and the start that restores it.
func TestForkFailsStartOnItsOwnSavedXHTTPSubscription(t *testing.T) {
	outbound, err := link.ParseSubscriptionLink(
		"vless://11111111-1111-1111-1111-111111111111@127.0.0.1:443?type=xhttp&path=%2Fx&security=none#n1")
	if err != nil {
		t.Fatalf("parse link: %v", err)
	}

	// The provider saves json.Marshal of option.Options with the parsed outbounds.
	content, err := json.Marshal(option.Options{Outbounds: []option.Outbound{outbound}})
	if err != nil {
		t.Fatalf("encode the saved subscription: %v", err)
	}

	path := filepath.Join(t.TempDir(), "cache.db")
	writeCache(t, path, "", map[string]string{"sub": string(content)}, nil)

	err = startWithCache(t, path)
	if err == nil || !strings.Contains(err.Error(), "restore cached outbound provider") || !strings.Contains(err.Error(), "x_padding_bytes") {
		t.Errorf("start error %v: the fork now reads back the xhttp subscription it saved", err)
	}
}

// startWithCache starts a core with one remote provider sub and the cache file at path. The
// provider URL never answers: the core starts from the cache.
func startWithCache(t *testing.T, path string) error {
	t.Helper()

	ctx := service.ContextWithDefaultRegistry(include.Context(t.Context()))
	raw := fmt.Sprintf(`{
		"log": {"disabled": true},
		"experimental": {"cache_file": {"enabled": true, "path": %q, "store_subscriptions": true}},
		"providers": [{"type": "remote", "tag": "sub", "url": "http://127.0.0.1:1/", "update_interval": "24h"}]
	}`, path)

	options, err := json.UnmarshalExtendedContext[option.Options](ctx, []byte(raw))
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	instance, err := box.New(box.Options{Context: ctx, Options: options})
	if err != nil {
		t.Fatalf("create core: %v", err)
	}
	t.Cleanup(func() { _ = instance.Close() })

	return instance.Start()
}

// TestCacheFileFixture keeps the daemon's fixture equal to what the pinned fork writes. The
// entries carry an update time, so the files are compared by what the fork reads back, not
// byte for byte.
func TestCacheFileFixture(t *testing.T) {
	if *updateCacheFixture {
		if err := os.Remove(cacheFixture); err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		writeFixture(t, cacheFixture)

		return
	}

	committed, err := os.ReadFile(cacheFixture)
	if err != nil {
		t.Fatalf("read the fixture, regenerate it with make cache-fixture: %v", err)
	}

	// The fork opens the file for writing: the committed one is read from a copy.
	path := filepath.Join(t.TempDir(), "cache.db")
	if err := os.WriteFile(path, committed, 0o600); err != nil {
		t.Fatal(err)
	}

	want := map[string]map[string]string{
		"": {"sub": poisonedEntry, "other": healthyEntry, "rule:geo": ruleSetEntry},
		// The bucket of another cache id holds the same tag: the daemon must not touch it.
		fixtureID: {"sub": poisonedEntry},
	}

	for id, entries := range want {
		cache := openCache(t, path, id)

		for key, content := range entries {
			var saved *adapter.SavedBinary
			if tag, ok := strings.CutPrefix(key, "rule:"); ok {
				saved = cache.LoadRuleSet(tag)
			} else {
				saved = cache.LoadSubscription(key)
			}

			if saved == nil || !bytes.Equal(saved.Content, []byte(content)) {
				t.Errorf("cache id %q, entry %q: the fixture differs from what the fork writes; run make cache-fixture", id, key)
			}
		}

		if id == fixtureID {
			hash := sha256.Sum256([]byte(ruleSetURL))
			for tag, content := range ruleSetFormats(t) {
				saved := cache.LoadRuleSet(tag)
				if saved == nil || !bytes.Equal(saved.Content, content) || !bytes.Equal(saved.URLHash, hash[:]) ||
					saved.LastUpdated.Unix() != 100 || saved.LastEtag != `"fixture"` {
					t.Errorf("cache rule set %q: want content, check time, ETag and address hash written by the fork", tag)
				}
			}
		}

		closeCache(t, cache)
	}
}

// writeFixture writes the daemon fixture: two subscriptions and a rule set at the top level,
// and the poisoned subscription again under another cache id.
func writeFixture(t *testing.T, path string) {
	t.Helper()

	writeCache(t, path, "", map[string]string{"sub": poisonedEntry, "other": healthyEntry}, map[string]string{"geo": ruleSetEntry})
	writeCache(t, path, fixtureID, map[string]string{"sub": poisonedEntry}, nil)
	cache := openCache(t, path, fixtureID)
	defer closeCache(t, cache)
	for tag, content := range ruleSetFormats(t) {
		saveFixtureRuleSet(t, cache, tag, ruleSetURL, content)
	}
}

func ruleSetFormats(t *testing.T) map[string][]byte {
	t.Helper()
	var source option.PlainRuleSetCompat
	if err := json.Unmarshal([]byte(ruleSetSource), &source); err != nil {
		t.Fatal(err)
	}
	rules, err := source.Upgrade()
	if err != nil {
		t.Fatal(err)
	}
	var binary bytes.Buffer
	if err := srs.Write(&binary, rules, C.RuleSetVersionCurrent); err != nil {
		t.Fatal(err)
	}
	return map[string][]byte{"geo-binary": binary.Bytes(), "geo-source": []byte(ruleSetSource)}
}

func saveFixtureRuleSet(t *testing.T, cache openedCache, tag, address string, content []byte) {
	t.Helper()
	hash := sha256.Sum256([]byte(address))
	if err := cache.SaveRuleSet(tag, &adapter.SavedBinary{
		Content: content, LastUpdated: time.Unix(100, 0), LastEtag: `"fixture"`, URLHash: hash[:],
	}); err != nil {
		t.Fatalf("save rule set %q: %v", tag, err)
	}
}

type ruleSetCheckLog chan struct{}

func (checked ruleSetCheckLog) WriteMessage(_ log.Level, message string) {
	if strings.Contains(message, "update rule-set remote: not modified") {
		select {
		case checked <- struct{}{}:
		default:
		}
	}
}

func TestNotModifiedMovesRuleSetCheckTime(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Header.Get("If-None-Match") != `"fixture"` {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNotModified)
	}))
	defer server.Close()
	path := filepath.Join(t.TempDir(), "cache.db")
	cache := openCache(t, path, "")
	saveFixtureRuleSet(t, cache, "remote", server.URL, []byte(ruleSetSource))
	closeCache(t, cache)

	ctx := service.ContextWithDefaultRegistry(include.Context(t.Context()))
	raw := fmt.Sprintf(`{
		"log": {"level": "info"},
		"experimental": {"cache_file": {"enabled": true, "path": %q}},
		"route": {"rule_set": [{"type": "remote", "tag": "remote", "format": "source", "url": %q}]}
	}`, path, server.URL)
	options, err := json.UnmarshalExtendedContext[option.Options](ctx, []byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	checked := make(ruleSetCheckLog, 1)
	instance, err := box.New(box.Options{Context: ctx, Options: options, PlatformLogWriter: checked})
	if err != nil {
		t.Fatal(err)
	}
	closed := false
	t.Cleanup(func() {
		if !closed {
			_ = instance.Close()
		}
	})
	if err := instance.Start(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-checked:
	case <-time.After(5 * time.Second):
		t.Fatal("core did not finish the conditional check")
	}
	err = instance.Close()
	closed = true
	if err != nil {
		t.Fatal(err)
	}

	cache = openCache(t, path, "")
	defer closeCache(t, cache)
	got := cache.LoadRuleSet("remote")
	if got == nil || !got.LastUpdated.After(time.Unix(100, 0)) || string(got.Content) != ruleSetSource {
		t.Fatal("a 304 response must update the check time while preserving the rule set")
	}

}

func writeCache(t *testing.T, path, cacheID string, subscriptions, ruleSets map[string]string) {
	t.Helper()

	cache := openCache(t, path, cacheID)

	for tag, content := range subscriptions {
		if err := cache.SaveSubscription(tag, &adapter.SavedBinary{Content: []byte(content), LastUpdated: time.Now()}); err != nil {
			t.Fatalf("save subscription %q: %v", tag, err)
		}
	}

	for tag, content := range ruleSets {
		if err := cache.SaveRuleSet(tag, &adapter.SavedBinary{Content: []byte(content), LastUpdated: time.Now()}); err != nil {
			t.Fatalf("save rule set %q: %v", tag, err)
		}
	}

	closeCache(t, cache)
}

type openedCache struct {
	*cachefile.CacheFile
	scope *adapter.Scope
}

func openCache(t *testing.T, path, cacheID string) openedCache {
	t.Helper()

	ctx := t.Context()
	logger := log.NewNOPFactory().Logger()
	cache := cachefile.New(ctx, logger, option.CacheFileOptions{
		Enabled: true, Path: path, CacheID: cacheID, StoreSubscriptions: true,
	})

	scope := adapter.NewScope(ctx, logger)
	if err := cache.Start(adapter.StartStateInitialize, scope); err != nil {
		t.Fatalf("open cache file: %v", err)
	}

	return openedCache{CacheFile: cache, scope: scope}
}

func closeCache(t *testing.T, cache openedCache) {
	t.Helper()

	if err := cache.scope.Close(); err != nil {
		t.Fatalf("close cache file: %v", err)
	}
}
