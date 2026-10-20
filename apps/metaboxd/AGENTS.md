# metaboxd daemon rules

Shared repository rules are in the root [`AGENTS.md`](../../AGENTS.md). This file covers only `apps/metaboxd/`.

## When to read the guides

A guide is read by the condition from the table, **in full** and before making a change. What each document covers: [`docs/guides/README.md`](./docs/guides/README.md).

| Read in full before you                                  | Document                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| create or change daemon Go code                          | [Architecture&Style.md](./docs/guides/Architecture&Style.md): packages, boundaries, dependencies, style |
| write error handling or logging                          | [ErrorsAndLogging.md](./docs/guides/ErrorsAndLogging.md)                                                |
| write a handler, middleware, route or SPA serving        | [HTTPAPI.md](./docs/guides/HTTPAPI.md)                                                                  |
| write code that touches files, calls `sing-box` or procd | [DeviceIO.md](./docs/guides/DeviceIO.md)                                                                |
| write or edit Go tests                                   | [Testing.md](./docs/guides/Testing.md)                                                                  |
| hand in a daemon change                                  | [ReviewChecklist.md](./docs/guides/ReviewChecklist.md): go through the checklist                        |

The guides are written for the daemon. For the schema generator only the "Style" and "Tools" sections are mandatory; see [`tools/schemagen/AGENTS.md`](../../tools/schemagen/AGENTS.md).

## Changes in `apps/metaboxd/`

- The module is named `metabox`, so imports stay in the form `metabox/internal/...` regardless of the folder location.
- The entry point is `main.go` at the module root: flag parsing, dependency wiring, start, waiting for a signal. It has no logic.
- `cmd/contractgen` is the contract schema generator for the panel: it reads the `internal/*` sources and prints `apps/web/src/shared/api/daemon.generated.ts`. The artifact is committed together with the daemon change and rebuilt with `make schema-daemon`.
- `cmd/rulesetsnap` is the rule set catalog snapshot, rebuilt with `make rule-set-snapshot`. Both commands are development tools and do not get into the shipped binary.
- All daemon code is in `internal/`, split by subject, not by technical layer.
- The daemon module's `go.mod` requires only the official MCP Go SDK with its indirect modules, and only `internal/mcp` imports it ([ADR-0055](../../docs/adr/ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md)); everything else is the standard library. A new dependency is a separate decision with an ADR.
- Build, generation and lint go through `make` from the repository root: it holds the version `-ldflags`, `GOTOOLCHAIN` from `.go-version` and the fork tags for the generator. Daemon tests may also be run directly, `go test ./...` from `apps/metaboxd/` ([`CONTRIBUTING.md`](../../CONTRIBUTING.md), "Checks before committing").
