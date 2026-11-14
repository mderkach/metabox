package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	box "github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/adapter"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/service"
)

// subscription is a stub provider endpoint whose answer the test switches between updates.
type subscription struct {
	mu     sync.Mutex
	status int
	body   string
}

func (s *subscription) serve(status int, tags ...string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.status = status
	s.body = ""
	if len(tags) == 0 {
		return
	}

	nodes := make([]string, len(tags))
	for i, tag := range tags {
		nodes[i] = fmt.Sprintf(`{"type":"socks","tag":%q,"server":"127.0.0.1","server_port":%d}`, tag, 1080+i)
	}
	s.body = `{"outbounds":[` + strings.Join(nodes, ",") + `]}`
}

func (s *subscription) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	w.WriteHeader(s.status)
	_, _ = w.Write([]byte(s.body))
}

// core is a running fork instance with two remote providers on one URL: "plain" takes
// every node, "filtered" only tags starting with "n".
type core struct {
	box       *box.Box
	providers adapter.ProviderManager
}

func startCore(t *testing.T, url, cachePath string) core {
	t.Helper()

	ctx := service.ContextWithDefaultRegistry(include.Context(t.Context()))
	raw := fmt.Sprintf(`{
		"log": {"disabled": true},
		"experimental": {"cache_file": {"enabled": true, "path": %q, "store_subscriptions": true}},
		"providers": [
			{"type": "remote", "tag": "plain", "url": %q, "update_interval": "24h"},
			{"type": "remote", "tag": "filtered", "url": %q, "update_interval": "24h", "include": "^n"}
		]
	}`, cachePath, url, url)

	options, err := json.UnmarshalExtendedContext[option.Options](ctx, []byte(raw))
	if err != nil {
		t.Fatalf("parse options: %v", err)
	}

	instance, err := box.New(box.Options{Context: ctx, Options: options})
	if err != nil {
		t.Fatalf("create core: %v", err)
	}
	if err := instance.Start(); err != nil {
		_ = instance.Close()
		t.Fatalf("start core: %v", err)
	}

	return core{box: instance, providers: service.FromContext[adapter.ProviderManager](ctx)}
}

func (c core) nodes(t *testing.T, tag string) int {
	t.Helper()

	p, ok := c.providers.Get(tag)
	if !ok {
		t.Fatalf("no provider %q", tag)
	}

	return len(p.Outbounds())
}

// update runs one provider fetch the way a manual update from the panel does. The fetch
// started by Start may still be running; the provider refuses a parallel one.
func (c core) update(t *testing.T, tag string) error {
	t.Helper()

	p, _ := c.providers.Get(tag)
	updater, ok := p.(adapter.ProviderUpdater)
	if !ok {
		t.Fatalf("provider %q cannot be updated", tag)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		err := updater.Update()
		if err == nil || !strings.Contains(err.Error(), "provider is updating") || time.Now().After(deadline) {
			return err
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func (c core) waitNodes(t *testing.T, tag string, want int) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for c.nodes(t, tag) != want {
		if time.Now().After(deadline) {
			t.Fatalf("provider %q has %d nodes after start, want %d", tag, c.nodes(t, tag), want)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// Pins what the fork does with a subscription that shrinks: the panel warns about it
// because the core keeps no previous set. When a fork update changes any of these
// outcomes, the warning in the panel and its decision record need a review.
func TestRemoteProviderReplacesSetWithShrunkUpdate(t *testing.T) {
	stub := &subscription{}
	stub.serve(http.StatusOK, "n1", "n2", "n3")
	srv := httptest.NewServer(stub)
	defer srv.Close()

	cachePath := filepath.Join(t.TempDir(), "cache.db")
	c := startCore(t, srv.URL, cachePath)
	closed := false
	t.Cleanup(func() {
		if !closed {
			_ = c.box.Close()
		}
	})
	c.waitNodes(t, "plain", 3)
	c.waitNodes(t, "filtered", 3)

	t.Run("empty response keeps the previous set", func(t *testing.T) {
		stub.serve(http.StatusOK)

		err := c.update(t, "plain")
		if err == nil || !strings.Contains(err.Error(), "no servers found") {
			t.Errorf("empty response: error %v, want one about no servers found", err)
		}
		if got := c.nodes(t, "plain"); got != 3 {
			t.Errorf("plain has %d nodes, want the previous 3", got)
		}
	})

	t.Run("one node replaces the set, a filter that leaves none empties it", func(t *testing.T) {
		stub.serve(http.StatusOK, "expired")

		if err := c.update(t, "plain"); err != nil {
			t.Fatalf("update plain: %v", err)
		}
		if err := c.update(t, "filtered"); err != nil {
			t.Fatalf("update filtered: %v", err)
		}
		if got := c.nodes(t, "plain"); got != 1 {
			t.Errorf("plain has %d nodes, want 1", got)
		}
		if got := c.nodes(t, "filtered"); got != 0 {
			t.Errorf("filtered has %d nodes, want 0", got)
		}
	})

	closed = true
	if err := c.box.Close(); err != nil {
		t.Fatalf("close core: %v", err)
	}

	// The restored cache is fresh against update_interval, so the restarted core does not
	// fetch: the count comes from the cache alone.
	t.Run("cache holds the shrunk set after a restart", func(t *testing.T) {
		restarted := startCore(t, srv.URL, cachePath)
		t.Cleanup(func() {
			if err := restarted.box.Close(); err != nil {
				t.Errorf("close restarted core: %v", err)
			}
		})

		if got := restarted.nodes(t, "plain"); got != 1 {
			t.Errorf("plain restored %d nodes from the cache, want the shrunk 1", got)
		}
	})
}
