package ruleset

import (
	"context"
	"crypto/sha256"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"metabox/internal/cachefile"
	"metabox/internal/contract"
)

type cachedConfig []byte

func (c *cachedConfig) Read(context.Context) ([]byte, error) { return *c, nil }

func TestCachedRuleSetsStates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache.db")
	config := cachedConfig(`{"route":{"rule_set":[{"type":"remote","tag":"one","url":"https://example.test/{tag}"}]}}`)
	reader := NewCachedReader(&config, func(context.Context, string) string { return path })

	assertState := func(want contract.CachedRuleSetState) contract.CachedRuleSet {
		t.Helper()
		got, err := reader.Read(t.Context())
		if err != nil || len(got) != 1 || got[0].State != want {
			t.Fatalf("cached sets = %+v, %v; want %q", got, err, want)
		}
		return got[0]
	}
	assertState(contract.CachedRuleSetStateMemoryOnly)
	config = cachedConfig(`{"experimental":{"cache_file":{"enabled":true}},"route":{"rule_set":[{"type":"remote","tag":"one","url":"https://example.test/{tag}"}]}}`)
	assertState(contract.CachedRuleSetStateNotDownloaded)
	if err := os.WriteFile(path, []byte("cache"), 0o600); err != nil {
		t.Fatal(err)
	}
	reader.readRecords = func(context.Context, string, string, []string) (map[string]cachefile.RuleSetRecord, error) {
		return nil, errors.New("unavailable")
	}
	assertState(contract.CachedRuleSetStateCacheUnavailable)
	reader.readRecords = func(context.Context, string, string, []string) (map[string]cachefile.RuleSetRecord, error) {
		return map[string]cachefile.RuleSetRecord{"one": {Unreadable: true}}, nil
	}
	assertState(contract.CachedRuleSetStateUnreadable)
}

func TestCachedRuleSetsReusesStableSnapshotAndChecksAddress(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache.db")
	if err := os.WriteFile(path, []byte("cache"), 0o600); err != nil {
		t.Fatal(err)
	}
	config := cachedConfig(`{"experimental":{"cache_file":{"enabled":true}},"route":{"rule_set":[{"type":"remote","tag":"one","url":"https://example.test/{tag}"}]}}`)
	reader := NewCachedReader(&config, func(context.Context, string) string { return path })
	hash := sha256.Sum256([]byte("https://example.test/one"))
	var calls int
	reader.readRecords = func(context.Context, string, string, []string) (map[string]cachefile.RuleSetRecord, error) {
		calls++
		return map[string]cachefile.RuleSetRecord{"one": {
			CheckedAt: time.Unix(100, 0), Size: 32, URLHash: hash[:],
		}}, nil
	}
	for range 2 {
		got, err := reader.Read(t.Context())
		if err != nil || len(got) != 1 || got[0].OtherAddress || got[0].Size == nil || *got[0].Size != 32 ||
			got[0].CheckedAt == nil || *got[0].CheckedAt != 100 {
			t.Fatalf("cached sets = %+v, %v; want original metadata", got, err)
		}
	}
	if calls != 1 {
		t.Errorf("copied %d times; want one copy for two reads", calls)
	}
	config = cachedConfig(`{"experimental":{"cache_file":{"enabled":true}},"route":{"rule_set":[{"type":"remote","tag":"one","url":"https://mirror.test/one"}]}}`)
	got, err := reader.Read(t.Context())
	if err != nil || len(got) != 1 || !got[0].OtherAddress || calls != 2 {
		t.Fatalf("cached sets = %+v, %v, calls = %d; want fresh read and address mismatch", got, err, calls)
	}
}
