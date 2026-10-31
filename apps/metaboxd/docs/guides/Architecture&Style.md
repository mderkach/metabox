# Go architecture and style guide

The `metaboxd` daemon and the schema generator.

## Two modules

```text
apps/metaboxd/go.mod     module metabox: the daemon, the MCP SDK as the only dependency
  main.go                entry point
  cmd/contractgen/       contract generator for the panel (make schema-daemon)
  cmd/rulesetsnap/       snapshot of the rule set catalog (make rule-set-snapshot)
  internal/              all daemon code
tools/schemagen/go.mod   module metabox/tools/schemagen: the schema generator
```

The module is named `metabox` regardless of where the directory is, so imports stay in the form `metabox/internal/...`.

The modules are split on purpose: the generator pulls in the sing-box fork with its whole dependency tree ([`tools/schemagen/go.mod`](../../../../tools/schemagen/go.mod)), and none of that belongs in the delivery artifact. Daemon tests do not see the generator; `make test-schemagen` runs it with the fork's tags and `-ldflags`.

**The daemon's `go.mod` has one `require`, the MCP Go SDK, imported only by `internal/mcp` ([ADR-0055](../../../../docs/adr/ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md)).** Everything else the daemon needs is in the standard library: routing with methods and wildcards, `log/slog`, `os/exec`, `crypto/sha256`, `embed`. Every dependency is third-party code in the single delivery artifact, cross-compilation for aarch64 with `CGO_ENABLED=0`, and a duty to track updates. A new dependency in the daemon is a separate decision, not a side effect of a task.

The generator is not a style showcase: it builds the schema from third-party types by reflection and lives by the fork's rules. The rules below apply to the daemon; for the generator only the "Style" section and the tools are mandatory.

## Packages

`main.go` at the module root is thin: flag parsing, wiring dependencies, start, waiting for a signal. It has no logic and nothing to test. Development helper commands live in `cmd/<name>/`: `cmd/contractgen` prints the contract for the panel, `cmd/rulesetsnap` prints the rule set catalog snapshot; both are called by the `Makefile`. They do not get into the delivery artifact: the daemon binary is built from the module root.

`internal/` is split by subject, not by technical layer. `internal/apply`, `internal/config`, `internal/singbox`: yes; `internal/handlers`, `internal/services`, `internal/models`: no. Such a split smears one task across three packages and makes each of them depend on all the others.

A package name is a singular noun, without underscores or capitals. The name is not repeated in identifiers: `apply.Transaction`, not `apply.ApplyTransaction`. We do not create `util`, `common`, `helpers`, `base` packages: they collect everything and are never cleaned up.

We do not create a `pkg/` directory: the project ships no public library, and `internal/` gives a compiler guarantee that foreign code does not import it.

## Boundaries

These three boundaries must not be changed in code: a conflict is resolved by a decision, not by an in-place edit.

| Boundary                                                 | What it means in code                                                                                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The daemon does not model config contents                | The request body stays `[]byte`; typed config reads are limited to the [bounded read-only projections](#bounded-read-only-config-projections) below. The only edit is ensuring `experimental.clash_api` by byte edits |
| Config validation is a `sing-box` call, not our own code | There are no own checks of the contents; the binary's output is passed on verbatim                                                                                                                                    |
| The schema lives on the frontend                         | We do not write a config model in Go: there will be no second schema implementation in the project                                                                                                                    |

### Bounded read-only config projections

`internal/clashapi` may decode only these fields into narrow, local typed projections for daemon operations:

| Reader           | Config fields                                                                          | Purpose                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Read`           | `experimental.clash_api.external_controller`, `experimental.clash_api.secret`          | Reach the runtime API and perform health checks                                            |
| `LogOutput`      | `log.disabled`, `log.output`                                                           | Select the file log source for log reading and service failure diagnosis                   |
| `ReadDNSInbound` | `inbounds[].type`, `inbounds[].listen`, `inbounds[].listen_port`, `inbounds[].network` | Find the first `direct` inbound matching the configured DNS port and address the DNS probe |

These reads preserve the original config bytes: projections are never serialized back into the config. They do not authorize a general Go config model, parsing into `map[string]any`, or custom config validation; `sing-box` remains the validator.

Extending this list requires a concrete daemon operational need, the smallest field set in `internal/clashapi`, an update to this list, and tests for the read behavior and preservation of the original bytes. This exception does not permit config models elsewhere in the daemon.

## Dependencies inside the daemon

Dependencies are passed explicitly through the constructor; there are no global variables and no `init()`. The `internal/httpapi` package receives ready interfaces and does not build them itself:

```go
type Applier interface {
	Start(ctx context.Context, cfg []byte) (apply.Transaction, error)
	Confirm(ctx context.Context, id string) error
}

type Server struct {
	applier Applier
	log     *slog.Logger
}

func NewServer(applier Applier, log *slog.Logger) *Server { ... }
```

An interface is declared on the consumer side and contains only the methods used. Functions return concrete types, not interfaces: the caller decides what to narrow to.

We do not use DI containers or wiring generators: the daemon's dependency graph is about ten objects, wired in `main` in thirty lines.

## Style

`context.Context` goes first in the argument list and is not stored in structs. A function that touches the disk, a process or the network takes `ctx` and respects cancellation.

Export the minimum. Names follow the Go standard: `MixedCaps`, abbreviations entirely in one case (`serveHTTP`, `apiURL`, `id`), getters without `Get`.

Errors are a return value, not a panic. `panic` is allowed only for an impossible state inside the process; it must not appear in a request handler or in the apply loop.

Comments follow the "Placement of technical knowledge" rule in [AGENTS.md](../../../../AGENTS.md): godoc does not retell the implementation, it describes what is not visible from the signature. Example from existing code: [`apps/metaboxd/main.go:1`](../../main.go).

There is one package comment, in the file named after the package or in `doc.go`, and it starts with `Package <name>`.

## Concurrency

One owner per resource. The config file, the backup and the transaction state are owned by one object; outside parallel access is closed off by its methods, not by a mutex on the caller's side. A second apply during an active transaction is a contract error, not a race for the file.

A goroutine is started only with answers to three questions: who stops it, where its error goes, who waits for it to finish. `go func()` without an owner is a leak on a device that is not rebooted for months.

Cancellation goes through `ctx`; a timer that must survive a restart lives in the transaction state on disk, not only in memory.

## Flags and configuration

The daemon is configured with `flag` flags. We do not add environment variables: the procd script passes arguments on the command line ([`package/etc/init.d/metaboxd`](../../package/etc/init.d/metaboxd)), and one way to configure is simpler than two.

Defaults are device values (`127.0.0.1:8080`, directories in `/etc`): the daemon started on the router without arguments works. The test bench and tests pass their values explicitly.

Flags set everything the daemon knows about the device: address, config directory and name, service directory, paths to the binary and `ubus`, the Clash API port, apply windows, log level and the operator's language ([`apps/metaboxd/main.go`](../../main.go)). The sing-box service is not a flag: the daemon manages only [`metabox-singbox`](../../package/etc/init.d/metabox-singbox) from the panel's package, instance `sing-box` ([ADR-0069](../../../../docs/adr/ADR-0069-manage-only-the-metabox-singbox-service.md)); device values are set by the init script [`apps/metaboxd/package/etc/init.d/metaboxd`](../../package/etc/init.d/metaboxd), and its settings by the `metabox` UCI section.

## Tools

| What            | Command                                        | Where else                                                                           |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Format          | `gofmt -w`                                     | the pre-commit hook checks `gofmt -l`                                                |
| Static analysis | `make lint` (golangci-lint v2, `govet` inside) | CI, step `Go lint` (both modules); the pre-commit hook runs `go vet` in both modules |
| Tests           | `make test`                                    | pre-push hook. In CI the same runs are separate steps                                |
| Schema          | `make schema`                                  | the artifact is committed together with the generator                                |

The linter set and all exclusions: [`.golangci.yml`](../../../../.golangci.yml). An exclusion is added with a comment explaining why the rule does not apply here; otherwise in half a year nobody will recover the reason.

In Go 1.26 `go fix` got a set of modernizers and can rewrite code for new APIs. Do not run it over the whole repository: that is exactly an unrelated refactor. On your own diff, selectively, it is fine.

The Go version is in `.go-version`; the `Makefile` exports `GOTOOLCHAIN` from it, CI reads the same file. The `go` directive in both `go.mod` files declares the same version but does not pin it from below, so build and lint go through `make`, while a direct `go test ./...` runs on the installed Go, whose version must match `.go-version`. Device build: `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=arm64`, `-ldflags "-s -w -X metabox/internal/version.Version=..."` ([`Makefile`](../../../../Makefile)).
