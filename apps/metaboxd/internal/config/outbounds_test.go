package config_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"metabox/internal/config"
)

func TestOutboundMetadataSurvivesRestart(t *testing.T) {
	store, stateDir := newOutboundMetadataStore(t)
	ctx := t.Context()
	registry, err := config.NewOutboundRegistry(ctx, store)
	if err != nil {
		t.Fatal(err)
	}
	const tag = "provider/edge"
	norm := 175
	if err := registry.Set(ctx, tag, config.OutboundMetadata{Label: "Home", NormMS: &norm}); err != nil {
		t.Fatal(err)
	}

	// Neither an input value nor a detached snapshot can change what was stored.
	norm = 900
	*registry.Entries()[tag].NormMS = 800
	if got := registry.ManualNorms()[tag]; got != 175 {
		t.Errorf("saved norm: %d, want 175", got)
	}

	saved := filepath.Join(stateDir, "outbounds.json")
	info, err := os.Stat(saved)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("state mode: %o, want 600", got)
	}

	reloaded, err := config.NewOutboundRegistry(ctx, store)
	if err != nil {
		t.Fatal(err)
	}
	entry := reloaded.Entries()[tag]
	if entry.Label != "Home" || entry.NormMS == nil || *entry.NormMS != 175 {
		t.Fatalf("reloaded metadata: %+v", entry)
	}
	if err := reloaded.Set(ctx, tag, config.OutboundMetadata{}); err != nil {
		t.Fatal(err)
	}

	reloaded, err = config.NewOutboundRegistry(ctx, store)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(reloaded.Entries()); got != 0 {
		t.Errorf("cleared metadata survived restart: %d entries", got)
	}
}

func TestOutboundMetadataRejectsInvalidValuesWithoutChangingState(t *testing.T) {
	store, stateDir := newOutboundMetadataStore(t)
	ctx := t.Context()
	registry, err := config.NewOutboundRegistry(ctx, store)
	if err != nil {
		t.Fatal(err)
	}
	const tag = "edge"
	maxNorm, zeroNorm, overNorm := 10000, 0, 10001
	if err := registry.Set(ctx, tag, config.OutboundMetadata{Label: strings.Repeat("🌍", 64), NormMS: &maxNorm}); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(stateDir, "outbounds.json")
	initial, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}

	for _, entry := range []config.OutboundMetadata{
		{Label: strings.Repeat("🌍", 65)}, {Label: "bad\a"}, {NormMS: &zeroNorm}, {NormMS: &overNorm},
	} {
		if err := registry.Set(ctx, tag, entry); !errors.Is(err, config.ErrOutboundMetadata) {
			t.Errorf("invalid entry %+v: %v", entry, err)
		}
	}
	if err := registry.Set(ctx, strings.Repeat("x", 1025), config.OutboundMetadata{Label: "label"}); !errors.Is(err, config.ErrOutboundMetadata) {
		t.Errorf("oversized tag: %v", err)
	}
	after, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(initial) || registry.ManualNorms()[tag] != maxNorm {
		t.Error("invalid metadata changed saved state")
	}
}

func TestOutboundMetadataLimitsSavedEntries(t *testing.T) {
	store, stateDir := newOutboundMetadataStore(t)
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		t.Fatal(err)
	}
	const limit = 4096
	initial := make(map[string]config.OutboundMetadata, limit)
	for i := range limit {
		initial[fmt.Sprintf("tag-%d", i)] = config.OutboundMetadata{Label: "Home"}
	}
	payload, err := json.Marshal(initial)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "outbounds.json"), payload, 0o600); err != nil {
		t.Fatal(err)
	}

	ctx := t.Context()
	registry, err := config.NewOutboundRegistry(ctx, store)
	if err != nil {
		t.Fatal(err)
	}
	if err := registry.Set(ctx, "new", config.OutboundMetadata{Label: "new"}); !errors.Is(err, config.ErrOutboundMetadata) {
		t.Errorf("entry above limit: %v", err)
	}
	if err := registry.Set(ctx, "tag-0", config.OutboundMetadata{Label: "renamed"}); err != nil {
		t.Fatalf("replacement at limit: %v", err)
	}
	if got := len(registry.Entries()); got != limit {
		t.Errorf("saved entries: %d, want %d", got, limit)
	}
}

func newOutboundMetadataStore(t *testing.T) (*config.Store, string) {
	t.Helper()

	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	store, err := config.NewStore(filepath.Join(dir, "config"), "config.json", stateDir)
	if err != nil {
		t.Fatal(err)
	}

	return store, stateDir
}
