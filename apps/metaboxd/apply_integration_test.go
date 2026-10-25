//go:build integration

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"metabox/internal/apply"
)

const benchURL = "http://127.0.0.1:8080"

// This suite changes the disposable CI container's config and restarts its daemon.
// The owner's Compose project has the same name, so neither opt-in alone is enough.
func TestApplyHTTPOnEphemeralBench(t *testing.T) {
	if os.Getenv("CI") != "true" || os.Getenv("METABOX_EPHEMERAL_BENCH") != "1" {
		if os.Getenv("CI") == "true" {
			t.Fatal("CI integration run requires the explicit disposable-bench opt-in")
		}
		t.Skip("requires CI=true and METABOX_EPHEMERAL_BENCH=1 on a disposable bench")
	}

	labels := benchCommand(t, nil, "inspect", "metabox-target-1", "--format", `{{index .Config.Labels "com.docker.compose.project"}}/{{index .Config.Labels "com.docker.compose.service"}}`)
	if strings.TrimSpace(string(labels)) != "metabox/target" {
		t.Fatal("the target is not the expected metabox Compose service")
	}

	var status struct {
		ConfigPath           string             `json:"config_path"`
		ConfirmWindowSeconds int                `json:"confirm_window_seconds"`
		Transaction          *apply.Transaction `json:"transaction"`
	}
	decodeBench(t, benchRequest(t, http.MethodGet, "/api/status", nil, http.StatusOK), &status)
	if status.ConfigPath != "/etc/sing-box/config.json" || status.ConfirmWindowSeconds != 60 {
		t.Fatal("the target does not have the expected CI config path and confirmation window")
	}
	if status.Transaction != nil && status.Transaction.Active() {
		t.Fatal("the bench already has an active Apply transaction")
	}
	initScript := strings.TrimSpace(string(benchExec(t, nil, "uci", "get", "metabox.main.init_script")))
	if initScript != "/etc/init.d/metabox-singbox" {
		t.Fatal("the bench does not manage the packaged sing-box service")
	}
	baseline := benchRequest(t, http.MethodGet, "/api/config", nil, http.StatusOK)
	t.Cleanup(func() { restoreBench(t, baseline, initScript) })

	t.Log("invalid candidate: the real binary rejects it without changing the config")
	benchRequest(t, http.MethodPost, "/api/apply", []byte(`{"route":{"rules":[{"outbound":42}]}}`), http.StatusUnprocessableEntity)
	assertBenchConfig(t, baseline)
	assertBenchReachable(t)

	t.Log("confirm: HTTP Apply writes the config and restarts the real service")
	confirmed := benchCandidate(t, baseline, "apply-http-confirm.metabox.example")
	tx := startBenchApply(t, confirmed)
	waitBenchPhase(t, tx.ID, apply.PhaseAwaitingConfirm, 45*time.Second)
	assertBenchConfig(t, confirmed)
	assertBenchRuntime(t, "apply-http-confirm.metabox.example")
	benchRequest(t, http.MethodPost, "/api/apply/"+tx.ID+"/confirm", nil, http.StatusOK)
	waitBenchPhase(t, tx.ID, apply.PhaseConfirmed, 10*time.Second)
	assertBenchStateCleared(t)
	assertBenchReachable(t)

	t.Log("timeout: an unconfirmed HTTP Apply returns the confirmed config")
	tx = startBenchApply(t, benchCandidate(t, baseline, "apply-http-timeout.metabox.example"))
	waitBenchPhase(t, tx.ID, apply.PhaseAwaitingConfirm, 45*time.Second)
	waitBenchPhase(t, tx.ID, apply.PhaseRolledBack, 90*time.Second)
	assertBenchConfig(t, confirmed)
	assertBenchRuntime(t, "apply-http-confirm.metabox.example")
	assertBenchStateCleared(t)
	assertBenchReachable(t)

	t.Log("replay: restarting the daemon restores the durable confirmation window")
	replayed := benchCandidate(t, baseline, "apply-http-replay.metabox.example")
	tx = startBenchApply(t, replayed)
	waitBenchPhase(t, tx.ID, apply.PhaseAwaitingConfirm, 45*time.Second)
	assertBenchJournal(t, tx.ID, apply.PhaseAwaitingConfirm)
	benchExec(t, nil, "/etc/init.d/metaboxd", "restart")
	waitBenchReady(t)
	waitBenchPhase(t, tx.ID, apply.PhaseAwaitingConfirm, 20*time.Second)
	assertBenchConfig(t, replayed)
	benchRequest(t, http.MethodPost, "/api/apply/"+tx.ID+"/confirm", nil, http.StatusOK)
	waitBenchPhase(t, tx.ID, apply.PhaseConfirmed, 10*time.Second)
	assertBenchStateCleared(t)
	assertBenchReachable(t)

	t.Log("interruption: stopping at the restart barrier leaves a replayable write")
	installBenchBarrier(t)
	benchExec(t, nil, "uci", "set", "metabox.main.init_script=/tmp/metabox-apply-integration/metabox-singbox")
	benchExec(t, nil, "uci", "commit", "metabox")
	benchExec(t, nil, "/etc/init.d/metaboxd", "restart")
	waitBenchReady(t)
	interrupted := benchCandidate(t, baseline, "apply-http-interrupted.metabox.example")
	tx = startBenchApply(t, interrupted)
	waitBench(t, 20*time.Second, "restart barrier", func() bool {
		out := benchExec(t, nil, "sh", "-c", "if [ -f /tmp/metabox-apply-integration/entered ]; then echo entered; fi")
		return strings.TrimSpace(string(out)) == "entered"
	})
	assertBenchJournal(t, tx.ID, apply.PhaseApplying)
	assertBenchConfig(t, interrupted)
	benchExec(t, nil, "/etc/init.d/metaboxd", "stop")
	assertBenchJournal(t, tx.ID, apply.PhaseApplying)
	benchExec(t, nil, "rm", "-f", "/tmp/metabox-apply-integration/hold")
	benchExec(t, nil, "uci", "set", "metabox.main.init_script="+initScript)
	benchExec(t, nil, "uci", "commit", "metabox")
	benchExec(t, nil, "/etc/init.d/metaboxd", "start")
	waitBenchReady(t)
	waitBenchPhase(t, tx.ID, apply.PhaseRolledBack, 30*time.Second)
	assertBenchConfig(t, replayed)
	assertBenchRuntime(t, "apply-http-replay.metabox.example")
	assertBenchStateCleared(t)
	assertBenchReachable(t)
	t.Log("HTTP Apply, confirmation, timeout, replay and interrupted-write recovery passed")
}

func benchCandidate(t *testing.T, baseline []byte, domain string) []byte {
	t.Helper()
	var cfg map[string]any
	decodeBench(t, baseline, &cfg)
	route, ok := cfg["route"].(map[string]any)
	if !ok {
		t.Fatal("the CI fixture has no route object")
	}
	rules, ok := route["rules"].([]any)
	if !ok {
		t.Fatal("the CI fixture has no route rules")
	}
	route["rules"] = append(rules, map[string]any{"domain_suffix": []string{domain}, "outbound": "direct"})
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return append(data, '\n')
}

func startBenchApply(t *testing.T, candidate []byte) apply.Transaction {
	t.Helper()
	var tx apply.Transaction
	decodeBench(t, benchRequest(t, http.MethodPost, "/api/apply", candidate, http.StatusAccepted), &tx)
	if tx.ID == "" {
		t.Fatal("Apply returned an empty transaction ID")
	}
	return tx
}

func waitBenchPhase(t *testing.T, id string, phase apply.Phase, ceiling time.Duration) {
	t.Helper()
	var tx apply.Transaction
	waitBench(t, ceiling, "transaction phase "+string(phase), func() bool {
		decodeBench(t, benchRequest(t, http.MethodGet, "/api/apply/"+id, nil, http.StatusOK), &tx)
		if tx.Phase == apply.PhaseFailed || tx.Phase == apply.PhaseRolledBack && phase != apply.PhaseRolledBack {
			t.Fatalf("unexpected transaction phase %s: %s", tx.Phase, tx.ReasonCode)
		}
		return tx.Phase == phase
	})
}

func waitBench(t *testing.T, ceiling time.Duration, description string, ready func() bool) {
	t.Helper()
	deadline := time.Now().Add(ceiling)
	for time.Now().Before(deadline) {
		if ready() {
			return
		}
		// External processes and the real daemon clock are outside a synctest bubble.
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", description)
}

func waitBenchReady(t *testing.T) {
	t.Helper()
	waitBench(t, 30*time.Second, "daemon readiness", func() bool {
		ctx, cancel := context.WithTimeout(t.Context(), time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, benchURL+"/healthz", nil)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return false
		}
		defer func() {
			if err := resp.Body.Close(); err != nil {
				t.Error(err)
			}
		}()
		return resp.StatusCode == http.StatusOK
	})
}

func benchRequest(t *testing.T, method, path string, body []byte, status int) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, benchURL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if method != http.MethodGet {
		req.Header.Set("Origin", benchURL)
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Error(err)
		}
	}()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != status {
		t.Fatalf("%s %s: status %d, want %d", method, path, resp.StatusCode, status)
	}
	return data
}

func assertBenchConfig(t *testing.T, want []byte) {
	t.Helper()
	for _, got := range [][]byte{
		benchExec(t, nil, "cat", "/etc/sing-box/config.json"),
		benchRequest(t, http.MethodGet, "/api/config", nil, http.StatusOK),
	} {
		if !bytes.Equal(got, want) {
			t.Fatalf("config sha256 %x, want %x", sha256.Sum256(got), sha256.Sum256(want))
		}
	}
}

func assertBenchJournal(t *testing.T, id string, phase apply.Phase) {
	t.Helper()
	waitBench(t, 10*time.Second, "durable journal phase "+string(phase), func() bool {
		var tx apply.Transaction
		decodeBench(t, benchExec(t, nil, "cat", "/etc/metabox/apply.json"), &tx)
		return tx.ID == id && tx.Phase == phase
	})
}

func assertBenchStateCleared(t *testing.T) {
	t.Helper()
	waitBench(t, 10*time.Second, "transaction journal removal", func() bool {
		out := benchExec(t, nil, "sh", "-c", "if [ -e /etc/metabox/apply.json ]; then echo present; else echo absent; fi")
		switch strings.TrimSpace(string(out)) {
		case "present":
			return false
		case "absent":
			return true
		default:
			t.Fatalf("unexpected journal probe output: %q", out)
			return false
		}
	})
}

func assertBenchRuntime(t *testing.T, domain string) {
	t.Helper()
	if !bytes.Contains(benchRequest(t, http.MethodGet, "/api/clash/rules", nil, http.StatusOK), []byte(domain)) {
		t.Fatal("the applied rule is missing from the real sing-box runtime")
	}
}

func assertBenchReachable(t *testing.T) {
	t.Helper()
	for _, network := range []struct{ name, address string }{{"lan", "192.168.210.2"}, {"guest", "192.168.220.2"}} {
		benchCommand(t, nil, "run", "--rm", "--network", "metabox_"+network.name,
			"alpine:3", "wget", "-q", "-T", "3", "-O", "/dev/null", "http://"+network.address+":8080/healthz")
	}
}

func decodeBench(t *testing.T, data []byte, value any) {
	t.Helper()
	if err := json.Unmarshal(data, value); err != nil {
		t.Fatal(err)
	}
}

func benchExec(t *testing.T, input []byte, args ...string) []byte {
	t.Helper()
	return benchCommand(t, input, append([]string{"exec", "-i", "metabox-target-1"}, args...)...)
}

func benchCommand(t *testing.T, input []byte, args ...string) []byte {
	t.Helper()
	out, err := runBenchCommand(t.Context(), input, args...)
	if err != nil {
		t.Fatalf("docker %s: %v: %s", strings.Join(args, " "), err, out)
	}
	return out
}

func runBenchCommand(ctx context.Context, input []byte, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.WaitDelay = 2 * time.Second
	cmd.Stdin = bytes.NewReader(input)
	return cmd.CombinedOutput()
}

func installBenchBarrier(t *testing.T) {
	t.Helper()
	benchExec(t, nil, "mkdir", "/tmp/metabox-apply-integration")
	const script = `#!/bin/sh
if [ "$1" = restart ] && [ -e /tmp/metabox-apply-integration/hold ]; then
  touch /tmp/metabox-apply-integration/entered
  while [ -e /tmp/metabox-apply-integration/hold ]; do sleep 1; done
fi
exec /etc/init.d/metabox-singbox "$@"
`
	benchExec(t, []byte(script), "sh", "-c", "cat > /tmp/metabox-apply-integration/metabox-singbox; chmod 700 /tmp/metabox-apply-integration/metabox-singbox")
	benchExec(t, nil, "touch", "/tmp/metabox-apply-integration/hold")
}

func restoreBench(t *testing.T, baseline []byte, initScript string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if t.Failed() {
		out, err := runBenchCommand(ctx, nil, "exec", "metabox-target-1", "logread", "-l", "100")
		t.Logf("target diagnostics before restore: %s (%v)", out, err)
	}
	commands := []struct {
		input []byte
		args  []string
	}{
		{nil, []string{"rm", "-f", "/tmp/metabox-apply-integration/hold"}},
		{nil, []string{"/etc/init.d/metaboxd", "stop"}},
		{nil, []string{"uci", "set", "metabox.main.init_script=" + initScript}},
		{nil, []string{"uci", "commit", "metabox"}},
		{baseline, []string{"sh", "-c", "cat > /etc/sing-box/config.json"}},
		{nil, []string{"rm", "-f", "/etc/metabox/apply.json"}},
		{nil, []string{"/etc/init.d/metabox-singbox", "restart"}},
		{nil, []string{"/etc/init.d/metaboxd", "start"}},
		{nil, []string{"rm", "-rf", "/tmp/metabox-apply-integration"}},
	}
	for _, command := range commands {
		args := append([]string{"exec", "-i", "metabox-target-1"}, command.args...)
		if out, err := runBenchCommand(ctx, command.input, args...); err != nil {
			t.Errorf("restore bench: %v: %s", err, out)
		}
	}
	const ready = `for i in $(seq 1 20); do
  if wget -q -T 1 -O /dev/null http://192.168.210.2:8080/healthz &&
     wget -q -T 1 -O /dev/null http://127.0.0.1:9090/version; then exit 0; fi
  sleep 1
done
exit 1`
	if out, err := runBenchCommand(ctx, nil, "exec", "metabox-target-1", "sh", "-c", ready); err != nil {
		t.Errorf("restored services did not become ready: %v: %s", err, out)
		return
	}
	for _, args := range [][]string{
		{"cat", "/etc/sing-box/config.json"},
		{"wget", "-q", "-T", "3", "-O", "-", "http://192.168.210.2:8080/api/config"},
	} {
		out, err := runBenchCommand(ctx, nil, append([]string{"exec", "metabox-target-1"}, args...)...)
		if err != nil {
			t.Errorf("read restored config: %v", err)
		} else if !bytes.Equal(out, baseline) {
			t.Errorf("restored config sha256 %x, want %x", sha256.Sum256(out), sha256.Sum256(baseline))
		}
	}
}
