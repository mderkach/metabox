// Package mcp serves the daemon state to agents over the Model Context Protocol: the
// streamable HTTP transport without sessions, behind its own Bearer token. The package
// is the only one in the daemon that imports the MCP SDK; the tools are built on the same
// services the panel handlers use.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/diag"
	"metabox/internal/locale"
	"metabox/internal/logs"
	"metabox/internal/route"
)

const serverName = "metabox"

var (
	// errInternal replaces a failure whose text may hold paths or command output: the
	// reason stays in the daemon log.
	errInternal = locale.New("internal error, the cause is in the daemon log")
	// errBadInput means a tool argument is outside its allowed values.
	errBadInput = locale.New("tool argument out of range")
)

// exposed are the failures whose text goes to the agent as is: it says what is missing,
// not where.
var exposed = []error{
	route.ErrRuntimeUnavailable,
	config.ErrNoConfig,
	config.ErrNoVersion,
	logs.ErrUnavailable,
}

// Runtime returns one-off Clash API responses of the running sing-box. The interface is
// declared here, at the consumer.
type Runtime interface {
	Snapshot(ctx context.Context, path string) (json.RawMessage, error)
}

// Explainer explains the route of a live connection.
type Explainer interface {
	Explain(ctx context.Context, id string) (route.Explanation, error)
}

// ConfigReader reads the config version history.
type ConfigReader interface {
	Versions(ctx context.Context) ([]config.Version, error)
	ReadVersion(ctx context.Context, id int) ([]byte, error)
}

// DataplaneReader reads the dataplane model section.
type DataplaneReader interface {
	Snapshot(ctx context.Context) (dataplane.Snapshot, error)
}

// DeviceLister lists the LAN devices.
type DeviceLister interface {
	List(ctx context.Context) ([]devices.Device, error)
}

// LogReader reads the sing-box log tail.
type LogReader interface {
	Tail(ctx context.Context, n int, minLevel logs.Level) (logs.Snapshot, error)
}

// Diagnoser checks the dataplane.
type Diagnoser interface {
	Run(ctx context.Context, proxy string) (diag.Report, error)
}

// ServiceReader returns the sing-box service state in the panel contract form.
type ServiceReader func(ctx context.Context) (json.RawMessage, error)

// Options are the tool dependencies. A nil dependency leaves its tool out of the server,
// except status, which reports what is missing.
type Options struct {
	// Lang is the language of the tool descriptions and errors; the zero value is English.
	Lang           locale.Lang
	Version        string
	SingboxVersion string
	SingboxTags    []string
	// SchemaVersion is the fork version the panel schemas are built from; empty means
	// the build did not inject it.
	SchemaVersion string
	Service       ServiceReader
	Runtime       Runtime
	Explain       Explainer
	Config        ConfigReader
	Dataplane     DataplaneReader
	Devices       DeviceLister
	Logs          LogReader
	Diag          Diagnoser
}

// Server is the MCP endpoint: the token and one transport handler per permission set.
type Server struct {
	*Access

	read http.Handler
}

// New builds the servers for every permission set the tokens can carry.
func New(access *Access, log *slog.Logger, opts Options) *Server {
	return &Server{
		Access: access,
		read:   handler(newServer(log, opts, []contract.MCPPermission{contract.MCPRead})),
	}
}

// Handler returns the transport for the token's permissions; nil means the token is
// wrong or MCP is disabled.
func (s *Server) Handler(token string) http.Handler {
	if slices.Equal(s.Permissions(token), []contract.MCPPermission{contract.MCPRead}) {
		return s.read
	}

	return nil
}

type remoteKey struct{}

// handler serves the server statelessly and carries the client address into the tool
// context: the SDK passes the request context values to the handlers, but not the
// request itself.
func handler(server *sdk.Server) http.Handler {
	transport := sdk.NewStreamableHTTPHandler(
		func(*http.Request) *sdk.Server { return server },
		&sdk.StreamableHTTPOptions{Stateless: true},
	)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		transport.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), remoteKey{}, r.RemoteAddr)))
	})
}

func newServer(log *slog.Logger, opts Options, permissions []contract.MCPPermission) *sdk.Server {
	server := sdk.NewServer(&sdk.Implementation{Name: serverName, Version: opts.Version}, nil)
	t := tools{opts: opts, permissions: permissions}

	if slices.Contains(permissions, contract.MCPRead) {
		t.addRead(server, log)
	}

	return server
}

// readOnly marks a tool that changes nothing on the device: no config, model or service
// action, and no latency check either.
func readOnly() *sdk.ToolAnnotations {
	return &sdk.ToolAnnotations{
		ReadOnlyHint:    true,
		DestructiveHint: new(false),
		IdempotentHint:  true,
	}
}

// addTool registers a tool through the single wrapper: a panic turns into a tool error
// and the server keeps answering; every call leaves one log line without the arguments,
// which may name the owner's devices and domains.
func addTool[In, Out any](server *sdk.Server, log *slog.Logger, lang locale.Lang, tool *sdk.Tool, run func(context.Context, In) (Out, error)) {
	tool.Annotations = readOnly()

	sdk.AddTool(server, tool, func(ctx context.Context, _ *sdk.CallToolRequest, in In) (_ *sdk.CallToolResult, out Out, err error) {
		start := time.Now()
		remote, _ := ctx.Value(remoteKey{}).(string)

		defer func() {
			attrs := []any{"tool", tool.Name, "addr", remote, "duration_ms", time.Since(start).Milliseconds()}

			if rec := recover(); rec != nil {
				var zero Out
				out, err = zero, errors.New(locale.Message(lang, errInternal))

				log.Error("MCP tool call", append(attrs, "err", fmt.Sprint(rec), "stack", string(debug.Stack()))...)

				return
			}

			if err != nil {
				log.Warn("MCP tool call", append(attrs, "err", err)...)
				err = errors.New(locale.Message(lang, toolError(err)))

				return
			}

			log.Info("MCP tool call", attrs...)
		}()

		out, err = run(ctx, in)

		return nil, out, err
	})
}

// toolError keeps the text of a known failure and hides the rest. An argument failure
// goes whole: its text is built by the tool and names the argument.
func toolError(err error) error {
	if errors.Is(err, errBadInput) {
		return err
	}

	for _, known := range exposed {
		if errors.Is(err, known) {
			return known
		}
	}

	return errInternal
}
