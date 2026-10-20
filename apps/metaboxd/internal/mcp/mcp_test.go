package mcp_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"metabox/internal/apply"
	"metabox/internal/auth"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/devices"
	"metabox/internal/diag"
	"metabox/internal/httpapi"
	"metabox/internal/logs"
	"metabox/internal/mcp"
	"metabox/internal/route"
)

const initializeBody = `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`

const secretConfig = `{
  // old node: "password": "commented-secret"
  "outbounds": [
    {"type": "shadowsocks", "tag": "ss", "password": "ss-secret", "method": "aes-128-gcm"},
    {"type": "wireguard", "private_key": "wg-secret", "peers": [{"pre_shared_key": "psk-secret"}]}
  ],
  "route": {"rule_set": [{"tag": "ads", "url": "https://lists.example/user:pass@x/ads.srs?token=q-secret"}]},
  "experimental": {"clash_api": {"secret": "clash-secret", "external_ui_download_url": "https://ui.example/"}}
}`

var secretValues = []string{"commented-secret", "ss-secret", "wg-secret", "psk-secret", "q-secret", "clash-secret", "user:pass"}

type memoryStore struct {
	mu   sync.Mutex
	data []byte
}

func (m *memoryStore) ReadMCP(context.Context) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.data == nil {
		return nil, fs.ErrNotExist
	}

	return m.data, nil
}

func (m *memoryStore) WriteMCP(_ context.Context, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.data = data

	return nil
}

type fakeRuntime struct {
	mu        sync.Mutex
	responses map[string]string
	requested []string
}

func (f *fakeRuntime) Snapshot(_ context.Context, path string) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.requested = append(f.requested, path)

	body, ok := f.responses[path]
	if !ok {
		return nil, errors.New("no such path")
	}

	return json.RawMessage(body), nil
}

func newRuntime() *fakeRuntime {
	return &fakeRuntime{responses: map[string]string{
		"/connections": `{"connections":[
			{"id":"c1","chains":["node-a","proxy"],"rule":"domain_suffix=[example.com] => route(proxy)",
			 "metadata":{"network":"tcp","sourceIP":"192.168.1.10","destinationIP":"93.184.216.34","destinationPort":"443","host":"www.example.com"}},
			{"id":"c2","chains":["direct"],"rule":"final",
			 "metadata":{"network":"udp","sourceIP":"192.168.1.20","destinationIP":"1.1.1.1","destinationPort":"443","host":"other.org"}}
		]}`,
		"/rules": `{"rules":[{"type":"default","payload":"domain_suffix=[example.com]","proxy":"route(proxy)"}]}`,
		"/proxies": `{"proxies":{
			"proxy":{"type":"Selector","now":"node-a","all":["node-a","node-b"],"history":[]},
			"node-a":{"type":"Shadowsocks","history":[{"time":"2026-10-20T10:00:00Z","delay":120}]},
			"node-b":{"type":"VLESS","history":[]}
		}}`,
	}}
}

type fakeConfig struct{}

func (fakeConfig) Read(context.Context) ([]byte, error) { return nil, config.ErrNoConfig }

func (fakeConfig) ReadLists(context.Context) (map[string][]byte, error) {
	return map[string][]byte{}, nil
}

func (fakeConfig) ListSums(context.Context) (map[string]string, error) {
	return map[string]string{}, nil
}

func (fakeConfig) Versions(context.Context) ([]config.Version, error) {
	return []config.Version{{ID: 2, Size: int64(len(secretConfig)), Sum: "abc"}}, nil
}

func (fakeConfig) ReadVersion(_ context.Context, id int) ([]byte, error) {
	if id != 2 {
		return nil, config.ErrNoVersion
	}

	return []byte(secretConfig), nil
}

func (fakeConfig) ReadVersionLists(context.Context, int) (map[string][]byte, error) {
	return nil, config.ErrNoVersionLists
}

type idleApplier struct{}

func (idleApplier) Start(context.Context, []byte, apply.Lists, string, string) (apply.Transaction, error) {
	return apply.Transaction{}, errors.New("not used")
}

func (idleApplier) Confirm(context.Context, string) (apply.Transaction, error) {
	return apply.Transaction{}, apply.ErrNothingToConfirm
}

func (idleApplier) Current() apply.Transaction { return apply.Transaction{} }

type fakeLogs struct {
	mu     sync.Mutex
	panics int
	level  logs.Level
	lines  int
}

func (f *fakeLogs) Tail(_ context.Context, n int, minLevel logs.Level) (logs.Snapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.panics > 0 {
		f.panics--
		panic("log reader broke")
	}

	f.level, f.lines = minLevel, n

	return logs.Snapshot{Source: logs.SourceLogread, Entries: []logs.Entry{{Level: logs.LevelWarn, Message: "dial failed"}}}, nil
}

func (f *fakeLogs) last() (logs.Level, int) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.level, f.lines
}

type fakeDiag struct {
	mu    sync.Mutex
	proxy string
}

func (f *fakeDiag) Run(_ context.Context, proxy string) (diag.Report, error) {
	f.mu.Lock()
	f.proxy = proxy
	f.mu.Unlock()

	return diag.Report{Checks: []diag.Check{{Name: diag.NameProxy, Status: diag.StatusSkipped, Reason: diag.ReasonProxyUnset}}}, nil
}

type fakeDevices struct{}

func (fakeDevices) List(context.Context) ([]devices.Device, error) {
	return []devices.Device{{IP: "192.168.1.20", MAC: "aa:bb:cc:dd:ee:ff", Name: "tv"}}, nil
}

type bench struct {
	t       *testing.T
	srv     *httptest.Server
	access  *mcp.Access
	runtime *fakeRuntime
	logs    *fakeLogs
	diag    *fakeDiag
	logBuf  *syncBuffer
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

func newBench(t *testing.T, guard httpapi.Guard, store mcp.Store) *bench {
	t.Helper()

	access, err := mcp.NewAccess(t.Context(), store)
	if err != nil {
		t.Fatalf("access: %v", err)
	}

	b := &bench{t: t, access: access, runtime: newRuntime(), logs: &fakeLogs{}, diag: &fakeDiag{proxy: "unset"}, logBuf: &syncBuffer{}}
	log := slog.New(slog.NewTextHandler(b.logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	server := mcp.New(access, log, mcp.Options{
		Version:        "test",
		SingboxVersion: "1.14.1",
		Service: func(context.Context) (json.RawMessage, error) {
			return json.RawMessage(`{"status":"running","uptime":5,"binary":"1.14.1","managed":true}`), nil
		},
		Runtime: b.runtime,
		Explain: route.NewExplainer(b.runtime),
		Config:  fakeConfig{},
		Devices: fakeDevices{},
		Logs:    b.logs,
		Diag:    b.diag,
	})

	opts := httpapi.Options{Version: "test", MCP: server}
	if guard != nil {
		opts.Auth = guard
	}

	b.srv = httptest.NewServer(httpapi.NewServer(idleApplier{}, fakeConfig{}, log, opts))
	t.Cleanup(b.srv.Close)

	return b
}

func (b *bench) enable() string {
	b.t.Helper()

	token, err := b.access.Issue(b.t.Context())
	if err != nil {
		b.t.Fatalf("issue: %v", err)
	}

	return token
}

type reply struct {
	status int
	header http.Header
	body   []byte
}

func (b *bench) post(path string, header map[string]string, body string) reply {
	b.t.Helper()

	return b.send(http.MethodPost, path, header, body)
}

func (b *bench) send(method, path string, header map[string]string, body string) reply {
	b.t.Helper()

	req, err := http.NewRequestWithContext(b.t.Context(), method, b.srv.URL+path, strings.NewReader(body))
	if err != nil {
		b.t.Fatal(err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")

	for k, v := range header {
		if k == "Host" {
			req.Host = v

			continue
		}

		req.Header.Set(k, v)
	}

	resp, err := b.srv.Client().Do(req)
	if err != nil {
		b.t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		b.t.Fatal(err)
	}

	return reply{status: resp.StatusCode, header: resp.Header, body: data}
}

type tokenTransport struct {
	token string
	next  http.RoundTripper
}

func (t tokenTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+t.token)

	return t.next.RoundTrip(r)
}

func (b *bench) session(token string) *sdk.ClientSession {
	b.t.Helper()

	client := sdk.NewClient(&sdk.Implementation{Name: "test", Version: "1"}, nil)
	session, err := client.Connect(b.t.Context(), &sdk.StreamableClientTransport{
		Endpoint:             b.srv.URL + "/mcp",
		HTTPClient:           &http.Client{Transport: tokenTransport{token: token, next: b.srv.Client().Transport}},
		DisableStandaloneSSE: true,
		MaxRetries:           -1,
	}, nil)
	if err != nil {
		b.t.Fatalf("connect: %v", err)
	}
	b.t.Cleanup(func() { _ = session.Close() })

	return session
}

func call[Out any](t *testing.T, session *sdk.ClientSession, name string, args any) Out {
	t.Helper()

	result, err := session.CallTool(t.Context(), &sdk.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}

	if result.IsError {
		t.Fatalf("%s: tool error %v", name, text(result))
	}

	raw, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}

	var out Out
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("%s: decode %s: %v", name, raw, err)
	}

	return out
}

func text(result *sdk.CallToolResult) string {
	var parts []string

	for _, c := range result.Content {
		if tc, ok := c.(*sdk.TextContent); ok {
			parts = append(parts, tc.Text)
		}
	}

	return strings.Join(parts, "\n")
}

func TestEndpointIsUnknownPathWhileOff(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})

	resp := b.send(http.MethodGet, "/mcp", nil, "")
	unknown := b.send(http.MethodGet, "/no-such-page", nil, "")

	if resp.status != unknown.status || !bytes.Equal(resp.body, unknown.body) {
		t.Errorf("/mcp answered %d %q, an unknown path %d %q", resp.status, resp.body, unknown.status, unknown.body)
	}
}

func TestEndpointRequiresToken(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	token := b.enable()

	tests := []struct {
		name   string
		header string
	}{
		{"no token", ""},
		{"wrong token", "Bearer " + token + "x"},
		{"other scheme", "Basic " + token},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			header := map[string]string{}
			if tt.header != "" {
				header["Authorization"] = tt.header
			}

			resp := b.post("/mcp", header, initializeBody)
			if resp.status != http.StatusUnauthorized {
				t.Fatalf("status %d, want 401", resp.status)
			}

			if got := resp.header.Get("WWW-Authenticate"); got != "Bearer" {
				t.Errorf("WWW-Authenticate %q, want Bearer", got)
			}
		})
	}
}

func TestEndpointChecksOriginAndHost(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	auth := "Bearer " + b.enable()

	tests := []struct {
		name   string
		header map[string]string
		want   int
	}{
		{"no origin is accepted", map[string]string{"Authorization": auth}, http.StatusOK},
		{"own origin is accepted", map[string]string{"Authorization": auth, "Origin": b.srv.URL}, http.StatusOK},
		{"foreign origin", map[string]string{"Authorization": auth, "Origin": "http://evil.example"}, http.StatusForbidden},
		{"foreign origin without token", map[string]string{"Origin": "http://evil.example"}, http.StatusForbidden},
		{"foreign host", map[string]string{"Authorization": auth, "Host": "evil.example"}, http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if resp := b.post("/mcp", tt.header, initializeBody); resp.status != tt.want {
				t.Errorf("status %d, want %d", resp.status, tt.want)
			}
		})
	}
}

type memoryAuthStore struct{ data []byte }

func (m *memoryAuthStore) ReadAuth(context.Context) ([]byte, error) {
	if m.data == nil {
		return nil, fs.ErrNotExist
	}

	return m.data, nil
}

func (m *memoryAuthStore) WriteAuth(_ context.Context, data []byte) error {
	m.data = data

	return nil
}

func TestTokenAndPanelSessionDoNotOpenEachOther(t *testing.T) {
	guard, err := auth.New(t.Context(), &memoryAuthStore{}, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("guard: %v", err)
	}

	session, err := guard.SetPassword(t.Context(), netip.Addr{}, "", "", "correct horse")
	if err != nil {
		t.Fatalf("password: %v", err)
	}

	b := newBench(t, guard, &memoryStore{})
	token := b.enable()

	t.Run("panel session does not open the endpoint", func(t *testing.T) {
		resp := b.post("/mcp", map[string]string{"Cookie": "metabox_session=" + session}, initializeBody)
		if resp.status != http.StatusUnauthorized {
			t.Errorf("status %d, want 401", resp.status)
		}
	})

	t.Run("token does not open the panel API", func(t *testing.T) {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, b.srv.URL+"/api/status", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := b.srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("status %d, want 401", resp.StatusCode)
		}
	})

	b.session(token)
}

func TestToolsAreReadOnly(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	result, err := session.ListTools(t.Context(), nil)
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	want := []string{
		"metabox_config_version", "metabox_config_versions", "metabox_connections", "metabox_diagnostics",
		"metabox_explain_domain", "metabox_log_tail", "metabox_proxies", "metabox_status",
	}

	var names []string

	for _, tool := range result.Tools {
		names = append(names, tool.Name)

		a := tool.Annotations
		if a == nil || !a.ReadOnlyHint || a.DestructiveHint == nil || *a.DestructiveHint {
			t.Errorf("%s: annotations %+v, want read-only and not destructive", tool.Name, a)
		}
	}

	slices.Sort(names)
	if !slices.Equal(names, want) {
		t.Errorf("tools %v, want %v", names, want)
	}
}

func TestPanicInToolIsAToolError(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	b.logs.panics = 1
	session := b.session(b.enable())

	result, err := session.CallTool(t.Context(), &sdk.CallToolParams{Name: "metabox_log_tail"})
	if err != nil {
		t.Fatalf("call: %v", err)
	}

	if !result.IsError {
		t.Fatal("panicking tool did not return a tool error")
	}

	if strings.Contains(text(result), "log reader broke") {
		t.Errorf("panic value leaked to the agent: %q", text(result))
	}

	out := call[struct {
		Entries []logs.Entry `json:"entries"`
	}](t, session, "metabox_log_tail", nil)
	if len(out.Entries) != 1 {
		t.Errorf("entries after the panic %v, want one", out.Entries)
	}
}

func TestToolCallLogsOneLineWithoutArguments(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	call[map[string]any](t, session, "metabox_connections", map[string]any{"host": "private-name.example"})

	var lines []string

	for line := range strings.Lines(b.logBuf.String()) {
		if strings.Contains(line, "tool=metabox_connections") {
			lines = append(lines, line)
		}
	}

	if len(lines) != 1 {
		t.Fatalf("log lines for the call %q, want one", lines)
	}

	for _, attr := range []string{"addr=127.0.0.1:", "duration_ms="} {
		if !strings.Contains(lines[0], attr) {
			t.Errorf("log line %q has no %s", lines[0], attr)
		}
	}

	if strings.Contains(b.logBuf.String(), "private-name") {
		t.Error("tool arguments got into the log")
	}
}

func TestConfigVersionComesBackMasked(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	out := call[struct {
		ID      int    `json:"id"`
		Content string `json:"content"`
	}](t, session, "metabox_config_version", map[string]any{"id": 2})

	for _, secret := range secretValues {
		if strings.Contains(out.Content, secret) {
			t.Errorf("content holds %q:\n%s", secret, out.Content)
		}
	}

	for _, kept := range []string{`"https://lists.example/••••••"`, `"https://ui.example/"`, `"aes-128-gcm"`} {
		if !strings.Contains(out.Content, kept) {
			t.Errorf("content lacks %s:\n%s", kept, out.Content)
		}
	}

	if !json.Valid([]byte(out.Content)) {
		t.Errorf("masked content is not JSON:\n%s", out.Content)
	}
}

func TestStatusNamesPermissions(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	out := call[struct {
		DaemonVersion string                   `json:"daemon_version"`
		Service       *contract.Service        `json:"service"`
		Runtime       contract.Runtime         `json:"runtime"`
		Permissions   []contract.MCPPermission `json:"permissions"`
	}](t, session, "metabox_status", nil)

	if !slices.Equal(out.Permissions, []contract.MCPPermission{contract.MCPRead}) {
		t.Errorf("permissions %v, want [read]", out.Permissions)
	}

	if out.Service == nil || out.Service.Status != "running" || !out.Service.Managed {
		t.Errorf("service %+v, want running and managed", out.Service)
	}

	if out.DaemonVersion != "test" || out.Runtime.Connections != contract.SourceClashAPI {
		t.Errorf("status %+v", out)
	}
}

func TestConnectionsFilter(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	tests := []struct {
		name string
		args map[string]any
		want []string
	}{
		{"no filter", nil, []string{"c1", "c2"}},
		{"host", map[string]any{"host": "EXAMPLE"}, []string{"c1"}},
		{"device by name", map[string]any{"device": "tv"}, []string{"c2"}},
		{"device by address", map[string]any{"device": "192.168.1.10"}, []string{"c1"}},
		{"rule", map[string]any{"rule": "example.com"}, []string{"c1"}},
		{"final", map[string]any{"rule": "final"}, []string{"c2"}},
		{"chain", map[string]any{"chain": "node-a"}, []string{"c1"}},
		{"network", map[string]any{"network": "udp"}, []string{"c2"}},
		{"limit", map[string]any{"limit": 1}, []string{"c1"}},
		{"nothing matches", map[string]any{"host": "absent.example"}, []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := call[struct {
				Total       int `json:"total"`
				Connections []struct {
					ID string `json:"id"`
				} `json:"connections"`
			}](t, session, "metabox_connections", tt.args)

			ids := []string{}
			for _, c := range out.Connections {
				ids = append(ids, c.ID)
			}

			if !slices.Equal(ids, tt.want) {
				t.Errorf("connections %v, want %v", ids, tt.want)
			}
		})
	}
}

func TestExplainDomain(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	type explained struct {
		Found  bool `json:"found"`
		Routes []struct {
			ConnectionID string      `json:"connection_id"`
			Match        route.Match `json:"match"`
			Chain        route.Chain `json:"chain"`
		} `json:"routes"`
	}

	t.Run("live connection", func(t *testing.T) {
		out := call[explained](t, session, "metabox_explain_domain", map[string]any{"domain": "example.com"})

		if !out.Found || len(out.Routes) != 1 {
			t.Fatalf("explanation %+v, want one route", out)
		}

		got := out.Routes[0]
		if got.ConnectionID != "c1" || got.Match.Kind != route.KindRule || got.Match.Index == nil || *got.Match.Index != 0 {
			t.Errorf("route %+v, want rule 0 for c1", got)
		}

		if !slices.Equal(got.Chain.Nodes, []string{"node-a", "proxy"}) {
			t.Errorf("chain %v", got.Chain.Nodes)
		}
	})

	t.Run("no live connection is not a guess", func(t *testing.T) {
		out := call[explained](t, session, "metabox_explain_domain", map[string]any{"domain": "example.net"})

		if out.Found || len(out.Routes) != 0 {
			t.Errorf("explanation %+v, want not found", out)
		}
	})
}

func TestProxiesDoNotRunLatencyCheck(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	out := call[struct {
		Groups []struct {
			Name    string   `json:"name"`
			Now     string   `json:"now"`
			Members []string `json:"members"`
		} `json:"groups"`
		Nodes []struct {
			Name        string `json:"name"`
			LastDelayMS *int   `json:"last_delay_ms"`
		} `json:"nodes"`
	}](t, session, "metabox_proxies", nil)

	if len(out.Groups) != 1 || out.Groups[0].Now != "node-a" || len(out.Groups[0].Members) != 2 {
		t.Errorf("groups %+v", out.Groups)
	}

	if len(out.Nodes) != 2 || out.Nodes[0].LastDelayMS == nil || *out.Nodes[0].LastDelayMS != 120 || out.Nodes[1].LastDelayMS != nil {
		t.Errorf("nodes %+v", out.Nodes)
	}

	b.runtime.mu.Lock()
	requested := slices.Clone(b.runtime.requested)
	b.runtime.mu.Unlock()

	for _, path := range requested {
		if strings.Contains(path, "delay") {
			t.Errorf("latency check requested: %s", path)
		}
	}
}

func TestVersionsLogAndDiagnostics(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	session := b.session(b.enable())

	versions := call[struct {
		Versions []config.Version `json:"versions"`
	}](t, session, "metabox_config_versions", nil)
	if len(versions.Versions) != 1 || versions.Versions[0].ID != 2 {
		t.Errorf("versions %+v", versions.Versions)
	}

	call[map[string]any](t, session, "metabox_log_tail", map[string]any{"level": "WARN", "lines": 5000})
	if level, lines := b.logs.last(); level != logs.LevelWarn || lines != logs.MaxLines {
		t.Errorf("tail level %q lines %d, want warn and %d", level, lines, logs.MaxLines)
	}

	result, err := session.CallTool(t.Context(), &sdk.CallToolParams{Name: "metabox_log_tail", Arguments: map[string]any{"level": "loud"}})
	if err != nil || !result.IsError {
		t.Errorf("unknown level: result %+v, err %v; want a tool error", result, err)
	}

	report := call[diag.Report](t, session, "metabox_diagnostics", nil)

	b.diag.mu.Lock()
	proxy := b.diag.proxy
	b.diag.mu.Unlock()

	if proxy != "" || len(report.Checks) != 1 {
		t.Errorf("diagnostics ran with node %q, report %+v", proxy, report)
	}
}

func TestRegenerateInvalidatesOldToken(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	old := b.enable()
	fresh := b.enable()

	if resp := b.post("/mcp", map[string]string{"Authorization": "Bearer " + old}, initializeBody); resp.status != http.StatusUnauthorized {
		t.Errorf("old token: status %d, want 401", resp.status)
	}

	if resp := b.post("/mcp", map[string]string{"Authorization": "Bearer " + fresh}, initializeBody); resp.status != http.StatusOK {
		t.Errorf("new token: status %d, want 200", resp.status)
	}
}

func TestTokenFileHoldsOnlyHash(t *testing.T) {
	stateDir := filepath.Join(t.TempDir(), "metabox")

	store, err := config.NewStore(t.TempDir(), "config.json", stateDir)
	if err != nil {
		t.Fatalf("store: %v", err)
	}

	access, err := mcp.NewAccess(t.Context(), store)
	if err != nil {
		t.Fatalf("access: %v", err)
	}

	token, err := access.Issue(t.Context())
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	path := filepath.Join(stateDir, "mcp.json")

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("mode %o, want 600", perm)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(string(data), token) {
		t.Error("token file holds the token itself")
	}

	var rec struct {
		Hash []byte `json:"hash"`
	}
	if err := json.Unmarshal(data, &rec); err != nil {
		t.Fatalf("token file: %v", err)
	}

	if sum := sha256.Sum256([]byte(token)); !bytes.Equal(rec.Hash, sum[:]) {
		t.Error("token file does not hold the token sha256")
	}

	reread, err := mcp.NewAccess(t.Context(), store)
	if err != nil {
		t.Fatalf("reread: %v", err)
	}

	if reread.Permissions(token) == nil {
		t.Error("token does not survive a daemon restart")
	}
}

func TestPanelEndpointsManageToken(t *testing.T) {
	b := newBench(t, nil, &memoryStore{})
	origin := map[string]string{"Origin": b.srv.URL}

	state := func() contract.MCP {
		t.Helper()

		resp, err := b.srv.Client().Get(b.srv.URL + "/api/mcp")
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = resp.Body.Close() }()

		var body contract.MCP
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}

		return body
	}

	if got := state(); got.Enabled || got.Endpoint != "/mcp" {
		t.Errorf("initial state %+v, want disabled at /mcp", got)
	}

	if resp := b.post("/api/mcp/token", nil, ""); resp.status != http.StatusForbidden {
		t.Errorf("token without Origin: status %d, want 403", resp.status)
	}

	resp := b.post("/api/mcp/token", origin, "")
	if resp.status != http.StatusOK {
		t.Fatalf("issue: status %d", resp.status)
	}

	if cache := resp.header.Get("Cache-Control"); cache != "no-store" {
		t.Errorf("Cache-Control %q, want no-store", cache)
	}

	var issued contract.MCPToken
	if err := json.Unmarshal(resp.body, &issued); err != nil {
		t.Fatal(err)
	}

	if issued.Token == "" || !slices.Equal(issued.Permissions, []contract.MCPPermission{contract.MCPRead}) {
		t.Errorf("issued %+v", issued)
	}

	if got := state(); !got.Enabled {
		t.Error("MCP not enabled after issuing a token")
	}

	b.session(issued.Token)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodDelete, b.srv.URL+"/api/mcp/token", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", b.srv.URL)

	del, err := b.srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = del.Body.Close()

	if del.StatusCode != http.StatusNoContent {
		t.Fatalf("disable: status %d, want 204", del.StatusCode)
	}

	resp = b.send(http.MethodGet, "/mcp", map[string]string{"Authorization": "Bearer " + issued.Token}, "")
	if unknown := b.send(http.MethodGet, "/no-such-page", nil, ""); resp.status != unknown.status {
		t.Errorf("after disable: status %d, an unknown path %d", resp.status, unknown.status)
	}
}
