// Package httpapi is the HTTP layer of the daemon: routes, the middleware chain and the single
// response format. Domain dependencies come through the constructor, the package does not
// assemble them itself.
package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"metabox/internal/apply"
	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/events"
	"metabox/internal/history"
	"metabox/internal/locale"
	"metabox/internal/route"
	"metabox/internal/ruleset"
	"metabox/internal/singbox"
)

// maxConfigBytes is the ceiling on a request body. The config comes as bytes, and without
// a limit one request takes as much memory as it sent. Four
// megabytes cover a 500-rule config with a margin.
const maxConfigBytes = 4 << 20

// maxApplyBytes is the ceiling of the apply envelope: besides the config it carries list
// files, and a large list is megabytes of domains.
const maxApplyBytes = 16 << 20

// applyJSONType is the apply envelope body type. Its own, not application/json:
// the config itself is JSON too, and by the common type the envelope cannot be told from the bare
// config bytes.
const applyJSONType = "application/vnd.metabox.apply+json"

// maxDeviceNameBytes is the ceiling of the name edit body: it holds one line of up to
// sixty-four characters.
const maxDeviceNameBytes = 4 << 10

// Applier is the apply cycle. The interface is declared here, at the consumer, and
// contains only the methods the handlers use.
type Applier interface {
	Start(ctx context.Context, cfg []byte, lists apply.Lists, base, listsBase string) (apply.Transaction, error)
	Confirm(ctx context.Context, id string) (apply.Transaction, error)
	Current() apply.Transaction
}

// Service is control of the sing-box service through the init script. The interface
// is declared here, at the consumer.
type Service interface {
	State(ctx context.Context) (singbox.State, error)
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Restart(ctx context.Context) error
}

// EventStream serves the runtime stream. Serve returns an error only before it writes
// anything: beyond its reader limit that is events.ErrTooManySubscribers.
type EventStream interface {
	Serve(w http.ResponseWriter, r *http.Request) error
}

// ConfigReader returns the applied config and its history. The interface is declared
// here, at the consumer, and contains only reading: the files are owned by
// config.Store, and the write goes by the Apply protocol.
type ConfigReader interface {
	Read(ctx context.Context) ([]byte, error)
	ReadLists(ctx context.Context) (map[string][]byte, error)
	ListSums(ctx context.Context) (map[string]string, error)
	History(ctx context.Context) ([]config.Version, []config.SkippedVersion, error)
	ReadVersion(ctx context.Context, id int) ([]byte, error)
	ReadVersionLists(ctx context.Context, id int) (map[string][]byte, error)
}

// Explainer explains the route of a connection. The interface is declared here, at the
// consumer: the layer does not know where the core data comes from.
type Explainer interface {
	Explain(ctx context.Context, id string) (route.Explanation, error)
}

// Options are the layer settings that come into the daemon as flags.
type Options struct {
	Version string
	// Lang is the language of the texts in error answers; the zero value is English.
	Lang locale.Lang
	// SingboxVersion is the binary version on the device: the panel forms are built for
	// one fork version, and a mismatch with the binary is visible only from here. An empty
	// string means the version could not be read.
	SingboxVersion string
	// SingboxTags are the binary build tags. nil means the build composition was not
	// read, an empty list means the binary is built without tags.
	SingboxTags []string
	// AllowedOrigin is an allowed Origin beyond the match with Host. An empty
	// string means no relaxations: the origin check rule applies
	// in pure form.
	AllowedOrigin string
	// SPA serves the embedded interface. nil means the binary is built without
	// the frontend: the API keeps working, and the panel explains what is missing.
	SPA http.Handler
	// Service controls the sing-box service. nil means control
	// is unavailable: the panel opens, but the service card does not show.
	Service Service
	// Events is the single runtime stream to the panel. nil means the
	// stream is not assembled: the screens stay on the Clash API proxy.
	Events EventStream
	// Clash proxies the sing-box runtime under the clashapi.Prefix branch. nil
	// means the proxy is not assembled: the panel opens, but the runtime screens
	// degrade.
	Clash http.Handler
	// Explain explains the route of a connection. nil means
	// there is no runtime source: the connections screen stays without an explanation.
	Explain Explainer
	// Hits returns the rule hit count. nil means nobody
	// keeps it: the rule list stays without a hits column.
	Hits HitsReader
	// History returns the traffic history accumulated by the daemon. nil means
	// nobody accumulates it: a chart deeper than a minute is not shown.
	History HistoryReader
	// RuleSets returns the catalog of ready rule sets. nil means there is no catalog:
	// the rule set connection form stays with its own address.
	RuleSets RuleSetsReader
	// Runtime reports whether a sing-box process is running on the device. nil
	// means there is nothing to observe with: the service state is then read only from
	// procd, and the panel will not see a foreign process.
	Runtime RuntimeObserver
	// Devices returns the LAN devices and stores their own names. nil means the
	// list is not assembled: the panel labels connection sources with addresses.
	Devices DeviceRegistry
	// Dataplane reads the dataplane model. nil means there is nothing to read it
	// with: there is no dataplane handler.
	Dataplane DataplaneReader
	// Plane changes the dataplane model by the apply protocol. nil means the
	// model is only read: there is no write handler.
	Plane PlaneApplier
	// Logs reads the sing-box log. nil means there is nothing to read it with: there are no
	// log handlers.
	Logs LogReader
	// Diag checks the dataplane. nil means there is nothing to check with: there is no
	// diagnostics handler.
	Diag Diagnoser
	// Auth guards the panel with an optional password. nil means there is no guard: the
	// API is open and there are no login handlers.
	Auth Guard
	// MCP serves agents at /mcp behind its own token. nil means there is no MCP: the
	// endpoint answers as an unknown path and there are no settings handlers.
	MCP MCP
	// HTTPS reports that the listeners serve TLS: a plain request is redirected to the
	// same address over https, and the session cookie carries Secure. The health check
	// and the root certificate stay reachable over plain http.
	HTTPS bool
	// CA returns the panel root certificate in PEM, served at /metabox-ca.crt for the
	// owner to install on their devices. nil means there is no file to serve.
	CA func() []byte
	// ConfigPath is the path of the file the daemon owns. The panel shows it
	// as a fact about the device, and it is set by the flags `-config-dir` and
	// `-config-name`: without this field the interface would show the default
	// value regardless of how the daemon is started.
	ConfigPath string
	// ConfirmWindow is how long an apply waits for confirmation before the
	// rollback, set by the `-confirm-window` flag. The panel names it before the
	// apply starts, when there is no transaction to read the deadline from.
	ConfirmWindow time.Duration
}

// HitsReader returns the rule hit count. The interface is declared here, at the
// consumer.
type HitsReader interface {
	Hits(ctx context.Context) (route.Hits, error)
}

// HistoryReader returns the accumulated traffic history. The interface is declared here,
// at the consumer.
type HistoryReader interface {
	Points() []history.Point
	Recent() []history.Point
	Connections() []int
	Device() []history.DevicePoint
	Step() int
	DeviceStep() int
}

// RuleSetsReader returns the catalog of ready rule sets. The interface is declared here, at the
// consumer.
type RuleSetsReader interface {
	Catalog() ruleset.Catalog
}

// DeviceRegistry returns the LAN devices and changes their own names. The interface
// is declared here, at the consumer.
type DeviceRegistry interface {
	List(ctx context.Context) ([]devices.Device, error)
	Rename(ctx context.Context, mac, name string) error
}

// DataplaneReader reads the dataplane section and the flag that it is applied.
// The interface is declared here, at the consumer.
type DataplaneReader interface {
	Snapshot(ctx context.Context) (dataplane.Snapshot, error)
	Applied(ctx context.Context) (bool, dataplane.AppliedReason, error)
}

// RuntimeObserver reports whether a sing-box process is running on the device.
// The interface is declared here, at the consumer.
type RuntimeObserver func(ctx context.Context) bool

// Server holds the handler dependencies and the assembled middleware chain.
type Server struct {
	applier        Applier
	reader         ConfigReader
	log            *slog.Logger
	version        string
	singboxVersion string
	singboxTags    []string
	allowedOrigin  string
	spa            http.Handler
	service        Service
	events         EventStream
	clash          http.Handler
	explain        Explainer
	hits           HitsReader
	history        HistoryReader
	ruleSets       RuleSetsReader
	runtime        RuntimeObserver
	devices        DeviceRegistry
	dataplane      DataplaneReader
	plane          PlaneApplier
	logs           LogReader
	diag           Diagnoser
	auth           Guard
	mcp            MCP
	lang           locale.Lang
	https          bool
	ca             func() []byte
	configPath     string
	confirmWindow  time.Duration
	handler        http.Handler
}

// NewServer assembles the layer together with the middleware chain. The logger is required:
// the package creates none of its own.
func NewServer(applier Applier, reader ConfigReader, log *slog.Logger, opts Options) *Server {
	s := &Server{
		applier:        applier,
		reader:         reader,
		log:            log,
		version:        opts.Version,
		singboxVersion: opts.SingboxVersion,
		singboxTags:    opts.SingboxTags,
		allowedOrigin:  opts.AllowedOrigin,
		spa:            opts.SPA,
		service:        opts.Service,
		events:         opts.Events,
		clash:          opts.Clash,
		explain:        opts.Explain,
		hits:           opts.Hits,
		history:        opts.History,
		ruleSets:       opts.RuleSets,
		runtime:        opts.Runtime,
		devices:        opts.Devices,
		dataplane:      opts.Dataplane,
		plane:          opts.Plane,
		logs:           opts.Logs,
		diag:           opts.Diag,
		auth:           opts.Auth,
		mcp:            opts.MCP,
		lang:           opts.Lang,
		https:          opts.HTTPS,
		ca:             opts.CA,
		configPath:     opts.ConfigPath,
		confirmWindow:  opts.ConfirmWindow,
	}
	s.handler = s.routes()

	return s
}

// ServeHTTP passes the request to the chain assembled in NewServer.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)

	if s.ca != nil {
		mux.HandleFunc("GET "+caPath, s.handleCA)
	}

	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("GET /api/config/rule-sets", s.handleConfigLists)
	mux.HandleFunc("GET /api/config/versions", s.handleVersions)
	mux.HandleFunc("GET /api/config/versions/{id}", s.handleVersion)
	mux.HandleFunc("POST /api/config/versions/{id}/restore", s.handleVersionRestore)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("GET /api/apply/{id}", s.handleApplyState)
	mux.HandleFunc("POST /api/apply/{id}/confirm", s.handleApplyConfirm)

	if s.explain != nil {
		mux.HandleFunc("GET /api/connections/{id}/route", s.handleExplain)
	}

	if s.hits != nil {
		mux.HandleFunc("GET /api/rules/hits", s.handleHits)
	}

	if s.history != nil {
		mux.HandleFunc("GET /api/history", s.handleHistory)
	}

	if s.ruleSets != nil {
		mux.HandleFunc("GET /api/rule-sets/catalog", s.handleRuleSets)
	}

	if s.devices != nil {
		mux.HandleFunc("GET /api/devices", s.handleDevices)
		mux.HandleFunc("PUT /api/devices/{mac}", s.handleDeviceName)
	}

	if s.dataplane != nil {
		mux.HandleFunc("GET /api/dataplane", s.handleDataplane)
	}

	if s.plane != nil {
		mux.HandleFunc("PUT /api/dataplane", s.handleDataplaneChange)
		mux.HandleFunc("GET /api/dataplane/apply/{id}", s.handleDataplaneState)
		mux.HandleFunc("POST /api/dataplane/apply/{id}/confirm", s.handleDataplaneConfirm)
	}

	if s.logs != nil {
		mux.HandleFunc("GET /api/logs", s.handleLogs)
		mux.HandleFunc("GET /api/logs/stream", s.handleLogStream)
		mux.HandleFunc("POST /api/logs/clear", s.handleLogsClear)
	}

	if s.diag != nil {
		mux.HandleFunc("GET /api/diag", s.handleDiag)
	}

	if s.auth != nil {
		mux.HandleFunc("GET /api/auth", noStore(s.handleAuth))
		mux.HandleFunc("POST /api/auth/login", noStore(s.handleLogin))
		mux.HandleFunc("POST /api/auth/logout", noStore(s.handleLogout))
		mux.HandleFunc("PUT /api/auth/password", noStore(s.handlePassword))
	}

	mux.HandleFunc(mcpPath, s.handleMCP)

	if s.mcp != nil {
		mux.HandleFunc("GET /api/mcp", noStore(s.handleMCPState))
		mux.HandleFunc("POST /api/mcp/token", noStore(s.handleMCPToken))
		mux.HandleFunc("DELETE /api/mcp/token", noStore(s.handleMCPDisable))
	}

	if s.service != nil {
		mux.HandleFunc("GET /api/service", s.handleServiceState)
		mux.HandleFunc("POST /api/service/{action}", s.handleServiceAction)
	}

	if s.events != nil {
		mux.HandleFunc("GET /api/events", s.handleEvents)
	}

	if s.clash != nil {
		mux.Handle(clashapi.Prefix+"/", s.noUpgrade(s.clash))
	}

	mux.HandleFunc("/api/", s.handleAPINotFound)
	// After a 401 on /mcp some clients look for OAuth metadata here; the panel page with 200
	// would be read as broken metadata instead of a wrong token.
	mux.HandleFunc("/.well-known/", s.handleAPINotFound)
	mux.Handle("/", s.spaHandler())

	return s.middleware(mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, contract.Health{Status: "ok", Version: s.version})
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	body := contract.Status{
		Version:        s.version,
		SingboxVersion: s.singboxVersion,
		ConfigPath:     s.configPath,
		Runtime:        s.runtimeSources(),
		// Rounded up: a window shown shorter than it is rushes the owner for nothing.
		ConfirmWindowSeconds: int(math.Ceil(s.confirmWindow.Seconds())),
	}

	if s.singboxTags != nil {
		body.SingboxBuild = &contract.SingboxBuild{Tags: s.singboxTags}
	}

	if tx := s.applier.Current(); tx.ID != "" {
		body.Transaction = &tx
		body.TransactionHref = "/api/apply/" + tx.ID
	}

	if s.plane != nil {
		if tx := s.plane.Current(); tx.ID != "" {
			body.DataplaneTransaction = &tx
			body.DataplaneTransactionHref = "/api/dataplane/apply/" + tx.ID
		}
	}

	writeJSON(s.log, w, http.StatusOK, body)
}

// runtimeSources assembles the source composition by what was passed to the daemon:
// the stream reads the runtime from the Clash API, the proxy returns its handlers as is. There is
// nothing yet to choose the connections source from: the gRPC branch is not implemented.
func (s *Server) runtimeSources() contract.Runtime {
	// An empty slice, not nil: nil goes to JSON as null, and the panel would parse the
	// source list as not an array.
	out := contract.Runtime{Sources: []contract.RuntimeSource{}}

	if s.events != nil || s.clash != nil {
		out.Sources = append(out.Sources, contract.SourceClashAPI)
	}

	if s.events != nil {
		out.Connections = contract.SourceClashAPI
	}

	return out
}

// handleEvents turns a refused stream into a contract error: the panel reads a refusal by
// its code.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	err := s.events.Serve(w, r)
	if err == nil {
		return
	}

	if errors.Is(err, events.ErrTooManySubscribers) {
		w.Header().Set("Retry-After", events.RetryAfter)
	}

	fail(s.log, w, r, err)
}

// handleConfig returns the config with exactly the bytes it lies on disk with:
// the daemon neither parses nor reformats it, otherwise a round trip
// of a handwritten config would lose formatting.
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	data, err := s.reader.Read(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// The config changes outside client requests (apply, rollback, an edit over
	// SSH), so the response is not cached.
	w.Header().Set("Cache-Control", "no-store")
	// The fingerprint of the returned bytes: the panel returns it in the If-Match of the apply,
	// and an edit of the file between the read and Apply is not silently overwritten.
	digest := sha256.Sum256(data)
	w.Header().Set("ETag", `"`+hex.EncodeToString(digest[:])+`"`)
	w.WriteHeader(http.StatusOK)

	if _, err := w.Write(data); err != nil {
		// The status has already gone to the client, there is nowhere to return the error.
		s.log.Error("config not fully written to the response", "err", err)
	}
}

// handleConfigLists returns the own list files from the rule-sets subdirectory together
// with the set fingerprint: the panel returns it in lists_base of the apply, and an edit
// of a file between the read and Apply is not silently overwritten.
func (s *Server) handleConfigLists(w http.ResponseWriter, r *http.Request) {
	files, err := s.reader.ReadLists(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	out := contract.RuleSetFiles{Files: make(map[string]string, len(files))}
	sums := make(map[string]string, len(files))

	for name, data := range files {
		out.Files[name] = string(data)
		sums[name] = config.Sum(data)
	}

	out.Etag = config.ListsEtag(sums)

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(s.log, w, http.StatusOK, out)
}

func (s *Server) handleVersions(w http.ResponseWriter, r *http.Request) {
	versions, skipped, err := s.reader.History(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	for _, v := range skipped {
		s.log.Warn("version skipped in the history", "version_id", v.ID, "err", v.Err)
	}

	out := contract.Versions{Versions: versions}

	data, err := s.reader.Read(r.Context())
	switch {
	case errors.Is(err, config.ErrNoConfig):
	case err != nil:
		fail(s.log, w, r, err)

		return
	default:
		out.CurrentSum = config.Sum(data)
	}

	sums, err := s.reader.ListSums(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	out.CurrentListsSum = config.ListsEtag(sums)

	writeJSON(s.log, w, http.StatusOK, out)
}

// handleVersion returns a version with the same bytes it was applied with:
// the history stores the document whole, not a parse.
func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	data, err := s.readVersion(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	// gosec tracks the flow from the version number in the URL to the write into the response and counts it as
	// XSS. Only an integer comes from the request: the content is read from the
	// daemon service directory, the response type is JSON, there is no HTML here.
	if _, err := w.Write(data); err != nil { //nolint:gosec // G705: the body is from a daemon file, not from the request
		// The status has already gone to the client, there is nowhere to return the error.
		s.log.Error("version not fully written to the response", "err", err)
	}
}

// handleVersionRestore returns a version by an ordinary apply: there is no separate write
// bypassing the protocol, otherwise a rollback to a broken version would cut off access without
// the binary check, restart and confirmation window.
func (s *Server) handleVersionRestore(w http.ResponseWriter, r *http.Request) {
	data, err := s.readVersion(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	lists, err := s.versionLists(r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	// Restoring a version is a deliberate rollback to its bytes, not an edit
	// over the current file: it has no base to check against.
	tx, err := s.applier.Start(r.Context(), data, lists, "", "")
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

// versionLists builds the list file changes that return them to the version
// snapshot. A version without a snapshot was saved by a daemon that did not take lists,
// and its restore does not touch the lists, as before.
func (s *Server) versionLists(r *http.Request) (apply.Lists, error) {
	id, err := pathVersionID(r)
	if err != nil {
		return apply.Lists{}, err
	}

	snapshot, err := s.reader.ReadVersionLists(r.Context(), id)
	if errors.Is(err, config.ErrNoVersionLists) {
		return apply.Lists{}, nil
	}
	if err != nil {
		return apply.Lists{}, err
	}

	current, err := s.reader.ListSums(r.Context())
	if err != nil {
		return apply.Lists{}, err
	}

	return apply.SnapshotLists(snapshot, current), nil
}

func (s *Server) readVersion(r *http.Request) ([]byte, error) {
	id, err := pathVersionID(r)
	if err != nil {
		return nil, err
	}

	return s.reader.ReadVersion(r.Context(), id)
}

func pathVersionID(r *http.Request) (int, error) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		return 0, config.ErrNoVersion
	}

	return id, nil
}

// handleApply accepts the config and starts the apply. The body is either bare
// config bytes or an envelope with list files under its own Content-Type. The response
// comes after the binary check but before the end of the cycle: the apply is asynchronous and
// lives longer than the request.
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	cfg, lists, listsBase, err := readApplyBody(w, r)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	tx, err := s.applier.Start(r.Context(), cfg, lists, baseSum(r.Header.Get("If-Match")), listsBase)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

func readApplyBody(w http.ResponseWriter, r *http.Request) ([]byte, apply.Lists, string, error) {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))

	if mediaType != applyJSONType {
		cfg, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxConfigBytes))

		return cfg, apply.Lists{}, "", err
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxApplyBytes))
	if err != nil {
		return nil, apply.Lists{}, "", err
	}

	var envelope contract.ApplyEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, apply.Lists{}, "", errors.Join(errBadApplyEnvelope, err)
	}

	lists := apply.Lists{Remove: envelope.RemoveLists}

	if len(envelope.Lists) > 0 {
		lists.Put = make(map[string][]byte, len(envelope.Lists))
		for name, content := range envelope.Lists {
			lists.Put[name] = []byte(content)
		}
	}

	return []byte(envelope.Config), lists, envelope.ListsBase, nil
}

// baseSum extracts the sha256 base from If-Match: the value comes as the same ETag that
// GET /api/config returned. An empty value and "*" mean an apply without
// a check, the same as a request without the header.
func baseSum(header string) string {
	value := strings.TrimSpace(header)
	value = strings.TrimPrefix(value, "W/")
	value = strings.Trim(value, `"`)

	if value == "*" {
		return ""
	}

	return value
}

func (s *Server) handleApplyState(w http.ResponseWriter, r *http.Request) {
	tx := s.applier.Current()
	if tx.ID != r.PathValue("id") {
		fail(s.log, w, r, apply.ErrUnknownTransaction)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

func (s *Server) handleApplyConfirm(w http.ResponseWriter, r *http.Request) {
	tx, err := s.applier.Confirm(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

// handleExplain explains the route of a connection: the matched rule, its index
// in route.rules and the chain. Each statement carries an origin, and the handler never has
// answers without it.
func (s *Server) handleExplain(w http.ResponseWriter, r *http.Request) {
	explanation, err := s.explain.Explain(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, explanation)
}

func (s *Server) handleHits(w http.ResponseWriter, r *http.Request) {
	hits, err := s.hits.Hits(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, hits)
}

func (s *Server) handleRuleSets(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, s.ruleSets.Catalog())
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	list, err := s.devices.List(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, contract.Devices{Devices: list})
}

// handleDeviceName sets the own name and returns the whole list: the device label
// depends on all sources at once, and the panel has nothing to compute it from.
func (s *Server) handleDeviceName(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxDeviceNameBytes))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	var req contract.DeviceName
	if err := json.Unmarshal(body, &req); err != nil {
		fail(s.log, w, r, errors.Join(errBadDeviceBody, err))

		return
	}

	if err := s.devices.Rename(r.Context(), r.PathValue("mac"), req.Name); err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.handleDevices(w, r)
}

// handleDataplane returns the model and the section fingerprint in ETag: the model is parsed
// from the same snapshot, otherwise an edit between two UCI reads would give the fingerprint
// of a model other than the one that went to the client.
func (s *Server) handleDataplane(w http.ResponseWriter, r *http.Request) {
	snap, err := s.dataplane.Snapshot(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	model, err := snap.Model()
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	applied, reason, err := s.dataplane.Applied(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	w.Header().Set("ETag", `"`+snap.Sum()+`"`)
	writeJSON(s.log, w, http.StatusOK, contract.Dataplane{
		Model: model, Applied: applied, AppliedReason: reason,
	})
}

// ServiceState brings the service state to the response form. Exported
// because the same body goes to the event stream: the panel must get one
// format regardless of whether it came from a handler or a stream.
//
// The observed argument says whether a live sing-box process was found on the device. It matters
// when the daemon service is stopped: sing-box may have been started outside it,
// and without this flag the panel would show "stopped" while traffic flows.
func ServiceState(state singbox.State, binary string, err error, observed bool, lang locale.Lang) any {
	body := contract.Service{Status: "stopped", Binary: binary}

	if err != nil {
		body.LastError = locale.T(lang, "service state not read")
		body.LastErrorCode = contract.ServiceStateUnread

		return body
	}

	switch {
	case state.Running:
		body.Status = "running"
		body.Uptime = int(state.Uptime.Seconds())
		body.Managed = true
	case observed:
		// The process exists but was started not by the daemon service: procd does not
		// know its age, and the panel shows the age as a dash.
		body.Status = "running"
	case state.Failed:
		body.Status = "failed"
		body.LastError = state.LastError
	}

	return body
}

// observeRuntime answers the question "is a sing-box process alive at all". Without
// an observer the answer is negative: the same as before it appeared.
func (s *Server) observeRuntime(ctx context.Context) bool {
	return s.runtime != nil && s.runtime(ctx)
}

// handleHistory returns the traffic history: points go in sequence with the response step.
func (s *Server) handleHistory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(s.log, w, http.StatusOK, contract.History{
		StepSeconds:       s.history.Step(),
		Points:            s.history.Points(),
		DeviceStepSeconds: s.history.DeviceStep(),
		Device:            s.history.Device(),
		Recent:            s.history.Recent(),
		Connections:       s.history.Connections(),
	})
}

// handleServiceState returns the service state. A poll error is not a panel
// failure: the screen must open with an unavailable service too.
func (s *Server) handleServiceState(w http.ResponseWriter, r *http.Request) {
	state, err := s.service.State(r.Context())
	if err != nil {
		s.log.Warn("service state not read", "err", err)
	}

	writeJSON(s.log, w, http.StatusOK, ServiceState(state, s.singboxVersion, err, s.observeRuntime(r.Context()), s.lang))
}

// handleServiceAction performs the action and returns the new state: the panel must not
// guess by the response code.
func (s *Server) handleServiceAction(w http.ResponseWriter, r *http.Request) {
	var run func(context.Context) error

	switch r.PathValue("action") {
	case "start":
		run = s.service.Start
	case "stop":
		run = s.service.Stop
	case "restart":
		run = s.service.Restart
	default:
		fail(s.log, w, r, errNotFound)

		return
	}

	if err := run(r.Context()); err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.handleServiceState(w, r)
}

// noUpgrade closes the upgrade to WebSocket on the proxy branch.
//
// The runtime goes to the panel as a single `GET /api/events` stream, and there must be no second
// path to the same data: the proxy stays for request-response
// handlers. The refusal is explicit, because a silently removed header would turn
// the upgrade into another response of the same address.
func (s *Server) noUpgrade(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") != "" {
			fail(s.log, w, r, errUpgradeUnsupported)

			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleAPINotFound closes everything unknown under /api/ with a JSON error: returning
// index.html here would return HTML to the frontend instead of a parseable response.
func (s *Server) handleAPINotFound(w http.ResponseWriter, r *http.Request) {
	fail(s.log, w, r, errNotFound)
}

// spaHandler serves the embedded interface, and without it an explanation. The daemon
// must come up and serve the API even when the frontend did not get into the binary.
func (s *Server) spaHandler() http.Handler {
	if s.spa != nil {
		return s.spa
	}

	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("interface not built: build the daemon with `make daemon`\n"))
	})
}
