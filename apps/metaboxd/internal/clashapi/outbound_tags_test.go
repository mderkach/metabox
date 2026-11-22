package clashapi_test

import (
	"context"
	"errors"
	"maps"
	"testing"

	"metabox/internal/clashapi"
)

func TestOutboundTagsFollowControllerConfigReads(t *testing.T) {
	ctx := t.Context()
	config := []byte(`{
		// Both regular outbounds and endpoints can be routing targets.
		"outbounds": [{"type": "direct", "tag": "direct"}, {"type":"block"}],
		"endpoints": [{"type": "wireguard", "tag": "tunnel"}],
	}`)
	var readErr error
	tags := clashapi.NewOutboundTags(func(context.Context) ([]byte, error) {
		return config, readErr
	})

	if _, _, err := tags.Current(ctx); err == nil {
		t.Fatal("tags are available before the first config read")
	}

	if got, err := tags.Read(ctx); err != nil || string(got) != string(config) {
		t.Fatalf("read changed the config: %q, %v", got, err)
	}

	revision, original, err := tags.Current(ctx)
	want := map[string]struct{}{"direct": {}, "tunnel": {}}
	if err != nil || revision == "" || !maps.Equal(original, want) {
		t.Fatalf("first projection: %q, %v, %v", revision, original, err)
	}

	config = []byte(`{"outbounds":[{"type":"direct","tag":"direct"}]}`)
	if _, err := tags.Read(ctx); err != nil {
		t.Fatal(err)
	}

	next, current, err := tags.Current(ctx)
	if err != nil || next == revision || !maps.Equal(current, map[string]struct{}{"direct": {}}) || !maps.Equal(original, want) {
		t.Fatalf("changed projection: %q, %v, %v; original %v", next, current, err, original)
	}

	config = []byte(`{"outbounds":[`)
	if _, err := tags.Read(ctx); err != nil {
		t.Fatalf("projection changed the read error: %v", err)
	}
	if _, _, err := tags.Current(ctx); err == nil {
		t.Fatal("an invalid config left the previous projection eligible for pruning")
	}

	readErr = errors.New("config read failure")
	if _, err := tags.Read(ctx); !errors.Is(err, readErr) {
		t.Fatalf("read: got %v, want %v", err, readErr)
	}
	if _, _, err := tags.Current(ctx); !errors.Is(err, readErr) {
		t.Fatalf("projection: got %v, want %v", err, readErr)
	}
}
