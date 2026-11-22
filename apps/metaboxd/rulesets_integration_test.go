//go:build integration

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/contract"
)

const (
	benchRuleSetTag  = "cached-rule-set-integration"
	benchRuleSetPath = "/api/rule-sets/cached"
)

func TestCachedRuleSetsOnEphemeralBench(t *testing.T) {
	baseline := prepareEphemeralBench(t)
	// JSON whitespace makes the core write a multi-megabyte cache without loading millions of rules.
	source := `{"version":3,"rules":[{"domain_suffix":["cached.metabox.example"]}]}` + strings.Repeat(" ", 8<<20)
	url := serveBenchRuleSet(t, source)
	started := time.Now()
	tx := startBenchApply(t, benchRuleSetCandidate(t, baseline, url))
	waitBenchPhase(t, tx.ID, apply.PhaseAwaitingConfirm, 45*time.Second)
	benchRequest(t, http.MethodPost, "/api/apply/"+tx.ID+"/confirm", nil, http.StatusOK)
	waitBenchPhase(t, tx.ID, apply.PhaseConfirmed, 10*time.Second)
	assertBenchRuntimeUp(t)

	before := benchDaemonRSS(t)
	readBenchCachedRuleSet(t, len(source), started)
	after := benchDaemonRSS(t)
	t.Logf("metaboxd RSS without a panel, before cache read: %d B, after cache read: %d B", before, after)
	const budget = 64_000_000
	if before > budget || after > budget {
		t.Fatalf("metaboxd RSS exceeds the %d B budget", budget)
	}

	restartBenchCoreDuringCacheReads(t, len(source), started)
	readBenchCachedRuleSet(t, len(source), started)
}

func serveBenchRuleSet(t *testing.T, source string) string {
	t.Helper()

	gateway := benchCommand(t, nil, "inspect", "metabox-target-1", "--format", `{{(index .NetworkSettings.Networks "metabox_lan").Gateway}}`)
	host := strings.TrimSpace(string(gateway))
	if net.ParseIP(host) == nil {
		t.Fatalf("read wired bridge gateway: %q", gateway)
	}
	listener, err := net.Listen("tcp4", net.JoinHostPort(host, "0"))
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /remote.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, source)
	})
	server := httptest.NewUnstartedServer(mux)
	_ = server.Listener.Close()
	server.Listener = listener
	server.Start()
	t.Cleanup(server.Close)

	url := server.URL + "/remote.json"
	benchExec(t, nil, "wget", "-q", "-T", "3", "-O", "/dev/null", url)
	return url
}

func benchRuleSetCandidate(t *testing.T, baseline []byte, url string) []byte {
	t.Helper()

	var cfg map[string]any
	decodeBench(t, baseline, &cfg)
	route, _ := cfg["route"].(map[string]any)
	experimental, _ := cfg["experimental"].(map[string]any)
	if route == nil || experimental == nil {
		t.Fatal("the CI fixture is missing route or experimental")
	}
	route["rule_set"] = []map[string]string{{
		"type": "remote", "tag": benchRuleSetTag, "format": "source", "url": url, "update_interval": "24h",
	}}
	experimental["cache_file"] = map[string]any{"enabled": true, "path": "cache.db"}
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func readBenchCachedRuleSet(t *testing.T, size int, started time.Time) {
	t.Helper()

	var rows []contract.CachedRuleSet
	decodeBench(t, benchRequest(t, http.MethodGet, benchRuleSetPath, nil, http.StatusOK), &rows)
	if len(rows) != 1 {
		t.Fatalf("cached rule sets: got %d rows, want 1", len(rows))
	}
	row := rows[0]
	if row.Tag != benchRuleSetTag || row.State != contract.CachedRuleSetStateCached || row.OtherAddress {
		t.Fatalf("unexpected cached rule set: tag %q, state %q, other address %v", row.Tag, row.State, row.OtherAddress)
	}
	if row.Size == nil {
		t.Fatal("cached rule set size missing")
	}
	if *row.Size != int64(size) {
		t.Fatalf("cached rule set size: got %d, want %d", *row.Size, size)
	}
	if row.CheckedAt == nil {
		t.Fatal("cached rule set check time missing")
	}
	if *row.CheckedAt < started.Unix() || *row.CheckedAt > time.Now().Unix() {
		t.Fatalf("cached rule set check time %d is outside the test run", *row.CheckedAt)
	}
}

func benchDaemonRSS(t *testing.T) int64 {
	t.Helper()

	out := benchExec(t, nil, "sh", "-c", `set -eu
set -- $(pidof metaboxd)
[ "$#" -eq 1 ]
awk '$1 == "VmRSS:" { print $2 }' "/proc/$1/status"`)
	rss, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
	if err != nil || rss <= 0 {
		t.Fatalf("read metaboxd VmRSS: %q", out)
	}
	return rss * 1024
}

func restartBenchCoreDuringCacheReads(t *testing.T, size int, started time.Time) {
	t.Helper()

	pid := strings.TrimSpace(string(benchExec(t, nil, "/usr/bin/dataplane-check", "singbox-pid")))
	if _, err := strconv.Atoi(pid); err != nil {
		t.Fatalf("read core PID before restart: %q", pid)
	}
	const ready = `set -eu
for i in $(seq 1 15); do
  pid=$(/usr/bin/dataplane-check singbox-pid || true)
  if [ -n "$pid" ] && [ "$pid" != "$1" ] && [ ! -e "/proc/$1" ] &&
     wget -q -T 1 -O /dev/null http://127.0.0.1:9090/version; then
    exit 0
  fi
  sleep 1
done
exit 1`

	// Invalidate the daemon's metadata memoization so this request has to copy the live file.
	benchExec(t, nil, "touch", "-m", benchCacheFile)
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	var restart sync.WaitGroup
	defer func() {
		cancel()
		restart.Wait()
	}()
	type restartResult struct {
		elapsed time.Duration
		err     error
	}
	restarted := make(chan restartResult, 1)
	restart.Go(func() {
		start := time.Now()
		err := restartBenchCore(ctx)
		if err == nil {
			out, readyErr := runBenchCommand(ctx, nil, "exec", "metabox-target-1", "sh", "-c", ready, "restart", pid)
			if readyErr != nil {
				err = fmt.Errorf("wait for the new core while reading cache: %w: %s", readyErr, out)
			}
		}
		restarted <- restartResult{time.Since(start), err}
	})

	for reads := 1; ; reads++ {
		readBenchCachedRuleSet(t, size, started)
		select {
		case result := <-restarted:
			if result.err != nil {
				t.Fatal(result.err)
			}
			t.Logf("new core answered Clash API after %s while issuing %d cache reads", result.elapsed.Round(time.Millisecond), reads)
			return
		case <-ctx.Done():
			t.Fatalf("core did not restart within the deadline while reading its cache: %v", ctx.Err())
		default:
			benchExec(t, nil, "touch", "-m", benchCacheFile)
		}
	}
}

func restartBenchCore(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, benchURL+"/api/service/restart", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Origin", benchURL)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("restart while reading cache: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		const maxResponse = 4096
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponse))
		return fmt.Errorf("restart while reading cache: HTTP %d: %s", resp.StatusCode, body)
	}
	return nil
}
