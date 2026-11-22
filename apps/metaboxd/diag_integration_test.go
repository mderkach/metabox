//go:build integration

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"metabox/internal/contract"
	"metabox/internal/diag"
)

func TestDataplaneDiagnosticsOnEphemeralBench(t *testing.T) {
	requireEphemeralBench(t)
	benchExec(t, nil, "/usr/bin/dataplane-check", "expect-up")

	readHTTP := func() diag.Report {
		var report diag.Report
		decodeBench(t, benchRequest(t, http.MethodGet, "/api/diag", nil, http.StatusOK), &report)
		return report
	}
	assertRoutingSetup(t, "initial HTTP report", readHTTP(), diag.StatusOK, "")

	var state contract.MCP
	decodeBench(t, benchRequest(t, http.MethodGet, "/api/mcp", nil, http.StatusOK), &state)
	if state.Enabled {
		t.Fatal("MCP is already enabled on the bench")
	}
	tokenBody := benchRequest(t, http.MethodPost, "/api/mcp/token", nil, http.StatusOK)
	defer benchRequest(t, http.MethodDelete, "/api/mcp/token", nil, http.StatusNoContent)
	var token contract.MCPToken
	decodeBench(t, tokenBody, &token)
	if token.Endpoint != "/mcp" || token.Token == "" {
		t.Fatal("the bench did not issue an MCP token for its local endpoint")
	}

	// This route table and the initial route are part of the disposable fixture.
	route := []string{"local", "0.0.0.0/0", "dev", "lo", "table", "100"}
	restore := func() { benchExec(t, nil, append([]string{"ip", "route", "replace"}, route...)...) }
	defer restore()
	benchExec(t, nil, append([]string{"ip", "route", "del"}, route...)...)

	assertRoutingSetup(t, "HTTP without the route", readHTTP(), diag.StatusFail, diag.ReasonLocalRouteMissing)
	assertRoutingSetup(t, "MCP without the route", readMCPDiagnostics(t, token), diag.StatusFail, diag.ReasonLocalRouteMissing)

	restore()
	assertRoutingSetup(t, "HTTP after restoration", readHTTP(), diag.StatusOK, "")
}

func assertRoutingSetup(t *testing.T, source string, report diag.Report, status diag.CheckStatus, reason diag.CheckReason) {
	t.Helper()
	for _, check := range report.Checks {
		if check.Name == diag.NameRoutingSetup {
			if check.Status != status || check.Reason != reason {
				t.Fatalf("%s: routing check %+v, want %s %s", source, check, status, reason)
			}
			return
		}
	}
	t.Fatalf("%s: routing check is missing", source)
}

func readMCPDiagnostics(t *testing.T, token contract.MCPToken) diag.Report {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	body := strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"metabox_diagnostics","arguments":{}}}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, benchURL+token.Endpoint, body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token.Token)
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("MCP-Protocol-Version", "2025-06-18")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Error(err)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("MCP response status %d, want 200", resp.StatusCode)
	}
	scanner := bufio.NewScanner(io.LimitReader(resp.Body, 128<<10))
	for scanner.Scan() {
		payload, ok := strings.CutPrefix(scanner.Text(), "data:")
		if !ok || strings.TrimSpace(payload) == "" {
			continue
		}
		var reply struct {
			ID     int             `json:"id"`
			Error  json.RawMessage `json:"error"`
			Result struct {
				IsError           bool        `json:"isError"`
				StructuredContent diag.Report `json:"structuredContent"`
			} `json:"result"`
		}
		decodeBench(t, []byte(payload), &reply)
		if reply.ID != 1 || len(reply.Error) != 0 || reply.Result.IsError {
			t.Fatalf("MCP diagnostics response did not return a report for request 1")
		}
		return reply.Result.StructuredContent
	}

	t.Fatalf("MCP diagnostics response ended before a report: %v", scanner.Err())
	return diag.Report{}
}
