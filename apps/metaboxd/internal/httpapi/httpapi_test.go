package httpapi_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/singbox"
)

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

type testWriter struct {
	t *testing.T
}

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Log(string(p))

	return len(p), nil
}

// fakeApplier replaces the apply cycle: the cycle itself is checked in internal/apply,
// here only the response codes and the body format matter.
type fakeApplier struct {
	mu         sync.Mutex
	current    apply.Transaction
	startErr   error
	confirmErr error
	received   []byte
	lists      apply.Lists
	base       string
	listsBase  string
}

func (a *fakeApplier) Start(
	_ context.Context,
	cfg []byte,
	lists apply.Lists,
	base, listsBase string,
) (apply.Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.startErr != nil {
		return apply.Transaction{}, a.startErr
	}

	a.received = cfg
	a.lists = lists
	a.base = base
	a.listsBase = listsBase
	a.current = apply.Transaction{ID: "tx-1", Phase: apply.PhaseApplying}

	return a.current, nil
}

func (a *fakeApplier) Confirm(_ context.Context, id string) (apply.Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.confirmErr != nil {
		return apply.Transaction{}, a.confirmErr
	}
	if a.current.ID != id {
		return apply.Transaction{}, apply.ErrUnknownTransaction
	}

	a.current.Phase = apply.PhaseConfirmed

	return a.current, nil
}

func (a *fakeApplier) Current() apply.Transaction {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.current
}

func (a *fakeApplier) body() []byte {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.received
}

func (a *fakeApplier) sentBase() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.base
}

// fakeReader replaces the config file owner: reading from disk is checked in
// internal/config, here what matters is that the bytes reach the response unchanged.
type fakeReader struct {
	data  []byte
	lists map[string][]byte
	err   error
	// readErr breaks only the config read, leaving the history available.
	readErr  error
	versions []config.Version
	// skipped are the history entries the store could not read.
	skipped []config.SkippedVersion
	// byID replaces the version content; an empty map means there are no versions.
	byID map[int][]byte
	// versionLists are the version list snapshots; versions without an entry were saved without
	// a snapshot.
	versionLists map[int]map[string][]byte
	// listSums are the sums of the current list files.
	listSums map[string]string
	// listSumsErr breaks only reading the current list sums.
	listSumsErr error
	// versionListsErr breaks only reading the version list snapshots.
	versionListsErr error
}

func (r fakeReader) Read(context.Context) ([]byte, error) {
	if r.err != nil {
		return nil, r.err
	}

	if r.readErr != nil {
		return nil, r.readErr
	}

	return r.data, nil
}

func (r fakeReader) ReadLists(context.Context) (map[string][]byte, error) {
	if r.err != nil {
		return nil, r.err
	}

	return r.lists, nil
}

func (r fakeReader) ListSums(context.Context) (map[string]string, error) {
	if r.err != nil {
		return nil, r.err
	}

	if r.listSumsErr != nil {
		return nil, r.listSumsErr
	}

	return r.listSums, nil
}

func (r fakeReader) History(context.Context) ([]config.Version, []config.SkippedVersion, error) {
	if r.err != nil {
		return nil, nil, r.err
	}

	return r.versions, r.skipped, nil
}

func (r fakeReader) ReadVersion(_ context.Context, id int) ([]byte, error) {
	data, ok := r.byID[id]
	if !ok {
		return nil, config.ErrNoVersion
	}

	return data, nil
}

func (r fakeReader) ReadVersionLists(_ context.Context, id int) (map[string][]byte, error) {
	if _, ok := r.byID[id]; !ok {
		return nil, config.ErrNoVersion
	}

	if r.versionListsErr != nil {
		return nil, r.versionListsErr
	}

	files, ok := r.versionLists[id]
	if !ok {
		return nil, config.ErrNoVersionLists
	}

	return files, nil
}

func newTestServer(t *testing.T, applier httpapi.Applier, allowedOrigin string) *httptest.Server {
	t.Helper()

	return newTestServerWith(t, applier, fakeReader{}, allowedOrigin, nil)
}

func newTestServerWithSPA(t *testing.T, applier httpapi.Applier, allowedOrigin string, spa http.Handler) *httptest.Server {
	t.Helper()

	return newTestServerWith(t, applier, fakeReader{}, allowedOrigin, spa)
}

func newTestServerWithReader(t *testing.T, reader httpapi.ConfigReader) *httptest.Server {
	t.Helper()

	return newTestServerWith(t, &fakeApplier{}, reader, "", nil)
}

func newTestServerWith(
	t *testing.T,
	applier httpapi.Applier,
	reader httpapi.ConfigReader,
	allowedOrigin string,
	spa http.Handler,
) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(applier, reader, testLogger(t), httpapi.Options{
		Version:        "test",
		SingboxVersion: testSingboxVersion,
		AllowedOrigin:  allowedOrigin,
		SPA:            spa,
		ConfigPath:     testConfigPath,
	}))
	t.Cleanup(srv.Close)

	return srv
}

type response struct {
	status      int
	contentType string
	header      http.Header
	body        string
}

func (r response) decode(t *testing.T, into any) {
	t.Helper()

	if err := json.Unmarshal([]byte(r.body), into); err != nil {
		t.Fatalf("parsing the response %q: %v", r.body, err)
	}
}

func request(t *testing.T, srv *httptest.Server, method, path, origin string, body []byte) response {
	t.Helper()

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(t.Context(), method, srv.URL+path, reader)
	if err != nil {
		t.Fatalf("building the request %s %s: %v", method, path, err)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("request %s %s: %v", method, path, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Errorf("closing the response body: %v", err)
		}
	}()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading the response %s %s: %v", method, path, err)
	}

	return response{
		status:      resp.StatusCode,
		contentType: resp.Header.Get("Content-Type"),
		header:      resp.Header,
		body:        string(raw),
	}
}

func TestHealth(t *testing.T) {
	got := request(t, newTestServer(t, &fakeApplier{}, ""), http.MethodGet, "/healthz", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("code %d, expected %d", got.status, http.StatusOK)
	}
	if !strings.HasPrefix(got.contentType, "application/json") {
		t.Errorf("Content-Type %q, expected application/json", got.contentType)
	}

	var health struct {
		Status  string `json:"status"`
		Version string `json:"version"`
	}
	got.decode(t, &health)

	if health.Status != "ok" || health.Version != "test" {
		t.Errorf("got %+v, expected status ok and version test", health)
	}
}

func TestConfigServedVerbatim(t *testing.T) {
	raw := []byte("{\n  \"log\":   {\"level\": \"info\"},\n  \"неизвестная_секция\": [1,2]\n}\n")

	got := request(t, newTestServerWithReader(t, fakeReader{data: raw}), http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("code %d, expected %d", got.status, http.StatusOK)
	}
	if !strings.HasPrefix(got.contentType, "application/json") {
		t.Errorf("Content-Type %q, expected application/json", got.contentType)
	}
	if got.body != string(raw) {
		t.Errorf("body %q, expected %q", got.body, raw)
	}
	if cache := got.header.Get("Cache-Control"); cache != "no-store" {
		t.Errorf("Cache-Control %q, expected no-store", cache)
	}
}

func TestConfigCarriesEtag(t *testing.T) {
	raw := []byte(rawConfig)
	digest := sha256.Sum256(raw)
	want := `"` + hex.EncodeToString(digest[:]) + `"`

	got := request(t, newTestServerWithReader(t, fakeReader{data: raw}), http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("code %d, expected %d", got.status, http.StatusOK)
	}
	if etag := got.header.Get("ETag"); etag != want {
		t.Errorf("ETag %q, expected %q: the panel has nothing to return in If-Match", etag, want)
	}
}

func TestConfigMissingIsNotFound(t *testing.T) {
	got := request(t, newTestServerWithReader(t, fakeReader{err: config.ErrNoConfig}),
		http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("code %d, expected %d", got.status, http.StatusNotFound)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "config_missing" {
		t.Errorf("error code %q, expected config_missing", apiErr.Code)
	}
	if strings.Contains(got.body, "config.json") {
		t.Errorf("body %q: the config path does not go outside", got.body)
	}
}

func TestConfigReadFailureHidesDetails(t *testing.T) {
	reader := fakeReader{err: errors.New("чтение конфига /etc/sing-box/config.json: отказано в доступе")}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusInternalServerError {
		t.Fatalf("code %d, expected %d", got.status, http.StatusInternalServerError)
	}
	if strings.Contains(got.body, "/etc/sing-box") {
		t.Errorf("body %q: the path on disk does not go outside", got.body)
	}
}

func TestAPINotFound(t *testing.T) {
	got := request(t, newTestServer(t, &fakeApplier{}, ""), http.MethodGet, "/api/nope", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("code %d, expected %d", got.status, http.StatusNotFound)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "not_found" {
		t.Errorf("error code %q, expected not_found", apiErr.Code)
	}
}

func TestMutatingRequestChecksOrigin(t *testing.T) {
	const devOrigin = "http://localhost:5173"

	tests := []struct {
		name string
		// ownOrigin substitutes the address of the test server itself.
		ownOrigin     bool
		origin        string
		allowedOrigin string
		// 404 means the request passed the check and reached routing.
		want int
	}{
		{name: "own origin passes", ownOrigin: true, want: http.StatusNotFound},
		{name: "dev test bench passes by the flag", origin: devOrigin, allowedOrigin: devOrigin, want: http.StatusNotFound},
		{name: "foreign origin rejected", origin: "http://evil.example", want: http.StatusForbidden},
		{name: "no origin rejected", want: http.StatusForbidden},
		{name: "the flag does not open a foreign origin", origin: "http://evil.example", allowedOrigin: devOrigin, want: http.StatusForbidden},
		{name: "dev origin without the flag rejected", origin: devOrigin, want: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, &fakeApplier{}, tt.allowedOrigin)

			origin := tt.origin
			if tt.ownOrigin {
				origin = srv.URL
			}

			got := request(t, srv, http.MethodPost, "/api/nope", origin, nil)
			if got.status != tt.want {
				t.Errorf("origin %q: code %d, expected %d", origin, got.status, tt.want)
			}
		})
	}
}

func TestMutatingMethodsAllChecked(t *testing.T) {
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run(method, func(t *testing.T) {
			got := request(t, newTestServer(t, &fakeApplier{}, ""), method, "/api/nope", "http://evil.example", nil)
			if got.status != http.StatusForbidden {
				t.Errorf("code %d, expected %d", got.status, http.StatusForbidden)
			}
		})
	}
}

func TestReadRequestSkipsOriginCheck(t *testing.T) {
	got := request(t, newTestServer(t, &fakeApplier{}, ""), http.MethodGet, "/healthz", "http://evil.example", nil)

	if got.status != http.StatusOK {
		t.Errorf("code %d, expected %d: the origin check does not apply to reads", got.status, http.StatusOK)
	}
}

const rawConfig = `{"log":{"level":"info"}}`

// The test bench path: the daemon returns it as is, the value plays no role here.
const (
	testConfigPath     = "/tmp/metabox-test/config.json"
	testSingboxVersion = "1.14.0-extended-2.7.1"
)

// apply sends a config with its own Origin: the origin check is not the subject
// of the test here, it is covered by TestMutatingRequestChecksOrigin.
func applyRequest(t *testing.T, srv *httptest.Server, body []byte) response {
	t.Helper()

	return request(t, srv, http.MethodPost, "/api/apply", srv.URL, body)
}

func TestApplyStartsTransaction(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	got := applyRequest(t, srv, []byte(rawConfig))

	if got.status != http.StatusAccepted {
		t.Fatalf("code %d, expected %d: apply is asynchronous", got.status, http.StatusAccepted)
	}

	var tx apply.Transaction
	got.decode(t, &tx)

	if tx.ID == "" {
		t.Error("response without a transaction identifier: the client has nothing to poll")
	}
	if !bytes.Equal(applier.body(), []byte(rawConfig)) {
		t.Errorf("%q reached the apply, sent %q", applier.body(), rawConfig)
	}
}

func TestApplyPassesClientBase(t *testing.T) {
	tests := []struct {
		name    string
		ifMatch string
		want    string
	}{
		{"without the header the apply goes without a check", "", ""},
		{"ETag is passed without quotes", `"abc123"`, "abc123"},
		{"weak validator accepted", `W/"abc123"`, "abc123"},
		{"an asterisk means \"any base\"", "*", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			applier := &fakeApplier{}
			srv := newTestServer(t, applier, "")

			req, err := http.NewRequestWithContext(t.Context(), http.MethodPost,
				srv.URL+"/api/apply", strings.NewReader(rawConfig))
			if err != nil {
				t.Fatalf("building the request: %v", err)
			}
			req.Header.Set("Origin", srv.URL)
			if tt.ifMatch != "" {
				req.Header.Set("If-Match", tt.ifMatch)
			}

			resp, err := srv.Client().Do(req)
			if err != nil {
				t.Fatalf("apply request: %v", err)
			}
			if err := resp.Body.Close(); err != nil {
				t.Errorf("closing the response body: %v", err)
			}

			if resp.StatusCode != http.StatusAccepted {
				t.Fatalf("code %d, expected %d", resp.StatusCode, http.StatusAccepted)
			}
			if got := applier.sentBase(); got != tt.want {
				t.Errorf("base %q, expected %q", got, tt.want)
			}
		})
	}
}

// The binary output is the only exception to the rule "internal details do not
// go outside": the user fixes the config by it.
func TestApplyReturnsCheckOutputVerbatim(t *testing.T) {
	applier := &fakeApplier{startErr: &singbox.CheckError{
		Stdout:   "разбор конфига",
		Stderr:   "FATAL[0000] decode config at 12: unknown outbound type",
		ExitCode: 1,
	}}

	got := applyRequest(t, newTestServer(t, applier, ""), []byte(rawConfig))

	if got.status != http.StatusUnprocessableEntity {
		t.Fatalf("code %d, expected %d", got.status, http.StatusUnprocessableEntity)
	}

	var apiErr struct {
		Code    string `json:"code"`
		Details struct {
			Stdout   string `json:"stdout"`
			Stderr   string `json:"stderr"`
			ExitCode int    `json:"exit_code"`
		} `json:"details"`
	}
	got.decode(t, &apiErr)

	if apiErr.Code != "check_failed" {
		t.Errorf("error code %q, expected check_failed", apiErr.Code)
	}
	if apiErr.Details.Stderr != "FATAL[0000] decode config at 12: unknown outbound type" {
		t.Errorf("stderr changed: %q", apiErr.Details.Stderr)
	}
	if apiErr.Details.ExitCode != 1 {
		t.Errorf("exit code %d, expected 1", apiErr.Details.ExitCode)
	}
}

// A mismatch of the service working directory with the config directory goes as a code with
// both directories: the panel builds the service setup command from them.
func TestApplyReturnsWorkdirMismatch(t *testing.T) {
	applier := &fakeApplier{startErr: fmt.Errorf("сверка: %w", &apply.WorkdirError{
		Workdir:   "/usr/share/sing-box",
		ConfigDir: "/etc/sing-box",
	})}

	got := applyRequest(t, newTestServer(t, applier, ""), []byte(rawConfig))

	if got.status != http.StatusConflict {
		t.Fatalf("code %d, expected %d", got.status, http.StatusConflict)
	}

	var apiErr struct {
		Code    string                  `json:"code"`
		Details contract.WorkdirDetails `json:"details"`
	}
	got.decode(t, &apiErr)

	if apiErr.Code != string(contract.ErrWorkdirMismatch) {
		t.Errorf("error code %q, expected %q", apiErr.Code, contract.ErrWorkdirMismatch)
	}

	want := contract.WorkdirDetails{Workdir: "/usr/share/sing-box", ConfigDir: "/etc/sing-box"}
	if apiErr.Details != want {
		t.Errorf("details %+v, expected %+v", apiErr.Details, want)
	}
}

func TestApplyMapsDomainErrors(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		want     int
		wantCode contract.ErrorCode
	}{
		{"apply already running", apply.ErrBusy, http.StatusConflict, contract.ErrApplyInProgress},
		{"config edited from outside", apply.ErrConfigModified, http.StatusConflict, contract.ErrConfigModified},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := applyRequest(t, newTestServer(t, &fakeApplier{startErr: tt.err}, ""), []byte(rawConfig))

			if got.status != tt.want {
				t.Fatalf("code %d, expected %d", got.status, tt.want)
			}

			var apiErr contract.Error
			got.decode(t, &apiErr)

			if apiErr.Code != tt.wantCode {
				t.Errorf("error code %q, expected %q", apiErr.Code, tt.wantCode)
			}
		})
	}
}

// Without a limit one request takes as much memory as it sent.
func TestApplyRejectsOversizedBody(t *testing.T) {
	got := applyRequest(t, newTestServer(t, &fakeApplier{}, ""), bytes.Repeat([]byte("щ"), 8<<20))

	if got.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("code %d, expected %d", got.status, http.StatusRequestEntityTooLarge)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "config_too_large" {
		t.Errorf("error code %q, expected config_too_large", apiErr.Code)
	}
}

func TestApplyStateAndConfirm(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	var started apply.Transaction
	applyRequest(t, srv, []byte(rawConfig)).decode(t, &started)

	state := request(t, srv, http.MethodGet, "/api/apply/"+started.ID, "", nil)
	if state.status != http.StatusOK {
		t.Fatalf("transaction state: code %d", state.status)
	}

	unknown := request(t, srv, http.MethodGet, "/api/apply/чужая", "", nil)
	if unknown.status != http.StatusNotFound {
		t.Errorf("foreign identifier: code %d, expected %d", unknown.status, http.StatusNotFound)
	}

	confirm := request(t, srv, http.MethodPost, "/api/apply/"+started.ID+"/confirm", srv.URL, nil)
	if confirm.status != http.StatusOK {
		t.Fatalf("confirm: code %d", confirm.status)
	}

	var confirmed apply.Transaction
	confirm.decode(t, &confirmed)

	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("phase %q, expected confirmation", confirmed.Phase)
	}
}

func TestConfirmNothingToConfirm(t *testing.T) {
	applier := &fakeApplier{confirmErr: apply.ErrNothingToConfirm}
	srv := newTestServer(t, applier, "")

	got := request(t, srv, http.MethodPost, "/api/apply/tx-1/confirm", srv.URL, nil)
	if got.status != http.StatusConflict {
		t.Fatalf("code %d, expected %d", got.status, http.StatusConflict)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "nothing_to_confirm" {
		t.Errorf("error code %q, expected nothing_to_confirm", apiErr.Code)
	}
}

// The panel forms are built by the schema of one fork version: without the device version
// a mismatch with the schema is not visible at all.
func TestStatusReportsSingboxVersion(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	var status struct {
		SingboxVersion string `json:"singbox_version"`
	}
	request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

	if status.SingboxVersion != testSingboxVersion {
		t.Errorf("version %q, expected %q", status.SingboxVersion, testSingboxVersion)
	}
}

// Without the build composition the panel cannot tell "no such type in the binary" from "the binary was not
// read", so the second is expressed by a missing field and not an empty list.
func TestStatusReportsSingboxBuild(t *testing.T) {
	tests := []struct {
		name string
		tags []string
		want *[]string
	}{
		{"tags read", []string{"with_quic"}, &[]string{"with_quic"}},
		{"build without tags", []string{}, &[]string{}},
		{"binary not read", nil, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, nil, testLogger(t), httpapi.Options{
				Version:     "test",
				SingboxTags: tt.tags,
			}))
			t.Cleanup(srv.Close)

			var status struct {
				SingboxBuild *struct {
					Tags []string `json:"tags"`
				} `json:"singbox_build"`
			}
			request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

			if tt.want == nil {
				if status.SingboxBuild != nil {
					t.Errorf("build composition %v, expected the field to be absent", status.SingboxBuild)
				}
				return
			}
			if status.SingboxBuild == nil || !slices.Equal(status.SingboxBuild.Tags, *tt.want) {
				t.Errorf("build composition %v, expected tags %v", status.SingboxBuild, *tt.want)
			}
			if status.SingboxBuild.Tags == nil {
				t.Error("an empty tag list went out as null")
			}
		})
	}
}

// The config path is set by start flags, so the panel must get it
// from the daemon and not keep a constant of its own.
func TestStatusReportsConfigPath(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	var status struct {
		ConfigPath string `json:"config_path"`
	}
	request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

	if status.ConfigPath != testConfigPath {
		t.Errorf("path %q, expected %q", status.ConfigPath, testConfigPath)
	}
}

// A page reload must not lose a running apply: its identifier
// lived only in the response to POST.
func TestStatusLinksActiveTransaction(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	empty := request(t, srv, http.MethodGet, "/api/status", "", nil)

	var before struct {
		Version         string             `json:"version"`
		Transaction     *apply.Transaction `json:"transaction"`
		TransactionHref string             `json:"transaction_href"`
	}
	empty.decode(t, &before)

	if before.Transaction != nil {
		t.Errorf("before the apply the status carries the transaction %+v", before.Transaction)
	}
	if before.Version != "test" {
		t.Errorf("version %q, expected test", before.Version)
	}

	var started apply.Transaction
	applyRequest(t, srv, []byte(rawConfig)).decode(t, &started)

	after := request(t, srv, http.MethodGet, "/api/status", "", nil)

	var status struct {
		Transaction     *apply.Transaction `json:"transaction"`
		TransactionHref string             `json:"transaction_href"`
	}
	after.decode(t, &status)

	if status.Transaction == nil || status.Transaction.ID != started.ID {
		t.Fatalf("the status did not return the running transaction: %+v", status.Transaction)
	}
	if status.TransactionHref != "/api/apply/"+started.ID {
		t.Errorf("link %q, expected /api/apply/%s", status.TransactionHref, started.ID)
	}

	// The link must lead to a live handler and not be a string for show.
	followed := request(t, srv, http.MethodGet, status.TransactionHref, "", nil)
	if followed.status != http.StatusOK {
		t.Errorf("following the link gave %d", followed.status)
	}
}

// SPA routing is client-side: everything not under /api/ goes to the interface.
func TestUnknownPathGoesToSPA(t *testing.T) {
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("оболочка"))
	})
	srv := newTestServerWithSPA(t, &fakeApplier{}, "", spa)

	for _, path := range []string{"/", "/connections", "/config/outbounds/2"} {
		t.Run(path, func(t *testing.T) {
			got := request(t, srv, http.MethodGet, path, "", nil)

			if got.status != http.StatusOK || got.body != "оболочка" {
				t.Errorf("code %d, body %q: expected the SPA shell", got.status, got.body)
			}
		})
	}
}

// Under /api/ it is still JSON and not index.html: otherwise the frontend would get HTML instead of
// a parseable response.
func TestAPIPathNeverReachesSPA(t *testing.T) {
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("оболочка"))
	})

	got := request(t, newTestServerWithSPA(t, &fakeApplier{}, "", spa), http.MethodGet, "/api/нет", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("code %d, expected %d", got.status, http.StatusNotFound)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "not_found" {
		t.Errorf("error code %q, expected not_found", apiErr.Code)
	}
}

// An MCP client probes OAuth metadata after a 401; the panel page there would look like a
// broken metadata document.
func TestWellKnownPathNeverReachesSPA(t *testing.T) {
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("оболочка"))
	})
	srv := newTestServerWithSPA(t, &fakeApplier{}, "", spa)

	for _, path := range []string{"/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server/mcp"} {
		t.Run(path, func(t *testing.T) {
			got := request(t, srv, http.MethodGet, path, "", nil)

			if got.status != http.StatusNotFound {
				t.Fatalf("code %d, expected %d", got.status, http.StatusNotFound)
			}

			var apiErr contract.Error
			got.decode(t, &apiErr)

			if apiErr.Code != "not_found" {
				t.Errorf("error code %q, expected not_found", apiErr.Code)
			}
		})
	}
}

// A daemon built without the frontend must come up and serve the API: the panel
// explains what is missing and does not stay silent with a 404.
func TestDaemonWithoutSPAStillServesAPI(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	root := request(t, srv, http.MethodGet, "/", "", nil)
	if root.status != http.StatusServiceUnavailable {
		t.Errorf("code %d, expected %d", root.status, http.StatusServiceUnavailable)
	}
	if !strings.Contains(root.body, "make daemon") {
		t.Errorf("body %q does not explain how to build the interface", root.body)
	}

	if got := request(t, srv, http.MethodGet, "/healthz", "", nil); got.status != http.StatusOK {
		t.Errorf("API does not work without the frontend: code %d", got.status)
	}
}
