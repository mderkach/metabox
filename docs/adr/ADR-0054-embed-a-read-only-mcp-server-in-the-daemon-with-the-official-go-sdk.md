# ADR-0054. Embed a read-only MCP server in the daemon with the official Go SDK

- Status: Proposed
- Date: 2026-10-20
- Deciders: repository owner

## Context and problem statement

An agent (Claude Code or another MCP client) can work with the panel today only through the REST API or a browser. The REST contracts are written for the panel: the agent has to guess the endpoints and the shapes of the answers, and with a panel password set (AC-69) it would need the browser session cookie. The owner wants an MCP endpoint in `metaboxd`, read-only in the first phase, as the scope of `0.1.0-rc.4`.

Reference implementation: the MCP server inside the b4 daemon, files `mcp*.go` in [`src/http/handler`](https://github.com/DanielLavrushin/b4/tree/main/src/http/handler) of DanielLavrushin/b4. It uses the official `github.com/modelcontextprotocol/go-sdk`, the streamable HTTP transport without sessions on the same mux as its REST API, a Bearer token, a server built per permission set and a `recover` with a log line around every tool.

Facts the decision depends on:

- The daemon module has no dependencies, and a new one needs a separate ADR ([`../../apps/metaboxd/AGENTS.md`](../../apps/metaboxd/AGENTS.md)). The Go SDK would be the first external module of the daemon.
- Measured on 2026-10-20: `go-sdk v1.7.0` brings eight indirect modules: `github.com/google/jsonschema-go`, `github.com/segmentio/asm`, `github.com/segmentio/encoding`, `github.com/yosida95/uritemplate`, `golang.org/x/oauth2`, `golang.org/x/sync`, `golang.org/x/sys`, `golang.org/x/time`. A minimal server with one tool built for `linux/arm64` with `-trimpath -ldflags="-s -w"` is 7.7 MB against 5.5 MB for an empty server on `net/http`, `encoding/json` and `log/slog`. The daemon already links the standard library, so it grows by at most these 2.2 MB.
- The MCP specification still changes. The SDK documentation for protocol version `2026-07-28` accepts that version on the streamable HTTP transport only in stateless mode (`StreamableHTTPOptions.Stateless`).
- Weak hardware and saving flash are out of the v1 goals ([`../PRD.md`](../PRD.md), section 8 and the "Support for mips / weak hardware" row of section 4).
- All routes of the daemon pass one middleware chain in `apps/metaboxd/internal/httpapi/middleware.go`: `recoverPanic`, `logRequests`, `checkHost`, `checkOrigin`, `requireSession`. `checkOrigin` rejects a mutating request without `Origin`, and MCP clients outside a browser do not send one. `requireSession` answers 401 without the panel cookie when a password is set ([ADR-0052](./ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md)).
- The daemon service directory `/etc/metabox` is 0700, its files are written atomically with mode 0600 and kept across sysupgrade; the panel password hash lives there in `auth.json` so that a change restarts neither sing-box nor the daemon ([ADR-0052](./ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md)).
- A failed Clash API latency check of a node erases its delay history, and a group then stops selecting it (observed on sing-box 1.13, not yet checked on the 1.14 fork). Running a latency check is not a pure read.

In scope: the transport, the library, access to the endpoint, the read-only tool set of phase 1 and how it is built. Out of scope: any write through MCP (phase 2, below), a field reference for agents, MCP over stdio, access from outside the LAN.

## Decision drivers

- An agent gets typed tools with schemas instead of guessing REST contracts.
- Access to MCP does not depend on the optional panel password and does not weaken it: a router with a password stays closed, a router without one does not open MCP by default.
- The endpoint does not widen what a device in the `listen_interface` networks can read without a token, and keeps the `Host` protection against DNS rebinding.
- Secrets do not leave the daemon through MCP in a form the panel would mask.
- Following the MCP specification costs as little maintenance as possible: the specification still changes.
- A broken tool does not take the daemon down and leaves a trace in the log.
- Phase 2 (write) adds tools without changing the access model.

## Considered options

### How the protocol is implemented

1. **The official Go SDK `github.com/modelcontextprotocol/go-sdk`, embedded in the daemon.** The protocol, the transport and protocol version negotiation are done by the SDK; input and output JSON schemas are derived from Go types; new revisions of the specification arrive with an SDK update. Drawbacks: the first external module of the daemon, eight indirect modules, up to 2.2 MB of binary, and SDK updates become a recurring task with their own `GODEBUG` compatibility switches. **Chosen**: the cost in size is outside the v1 constraints, and the cost of tracking the specification by hand is not.
2. **A hand-written subset: `initialize`, `tools/list`, `tools/call` over JSON-RPC without sessions.** No dependencies. Estimated at 400–600 lines plus a JSON schema per tool written by hand and kept in sync with the Go types; every revision of the specification, such as the stateless requirement of `2026-07-28`, is caught up by hand, and a client on a newer protocol version may refuse the server. **Rejected**: the saving is 2 MB of flash, which v1 does not optimise, against a protocol the project does not own.
3. **A separate MCP bridge on the agent's machine that calls the REST API.** The daemon does not change. Drawbacks: a second artifact to build, ship and version against the daemon; the bridge has to log in with the panel password and hold the cookie, so MCP access is the full panel access; the tools follow the REST contracts made for the panel. **Rejected.**
4. **Another Go MCP library**, for example the community `github.com/mark3labs/mcp-go`. Not measured. It is a third-party implementation of the same specification, while the official SDK is maintained by the MCP organisation and already used by the reference implementation. **Rejected** without a measurement; it can be revisited if the official SDK turns out heavier in maintenance.

### Keep the current approach

The agent goes through REST or a browser. No dependency, but no tool schemas, and with a panel password the agent needs the panel session. **Rejected**: it is the problem the decision solves.

### How access is granted

1. **The panel session cookie.** One secret for the panel and MCP. An MCP client is not a browser and has no login form; without a password it would be open to the whole LAN. **Rejected.**
2. **A separate Bearer token, independent of the panel password.** **Chosen.**

## Decision outcome

The daemon serves MCP at `/mcp` on the same listener and mux as the REST API, with the official Go SDK, streamable HTTP transport, `Stateless: true`. Phase 1 is read-only.

- **Off by default.** Without MCP settings the route answers 404, as an unknown path. MCP is enabled and disabled in the panel; enabling generates a token. MCP cannot be enabled without a token.
- **Token.** 32 random bytes from `crypto/rand`, shown to the owner once on generation and stored as a SHA-256 hash in a file in the daemon service directory, next to `auth.json`, with the same atomic write and mode 0600. A request carries `Authorization: Bearer <token>`; the daemon hashes it and compares the hashes with `crypto/subtle.ConstantTimeCompare`. A missing or wrong token gets 401. Regenerating the token invalidates the old one; removing the file and restarting the daemon disables MCP, which is the SSH reset. Changing MCP settings restarts neither sing-box nor the daemon.
- **Independent of the panel password.** `/mcp` does not accept the panel session cookie, and the panel API does not accept the MCP token. `requireSession` does not apply to `/mcp`: the token replaces it whether or not a panel password is set.
- **Filter in front of the endpoint.** `checkHost` from `middleware.go` applies to `/mcp` unchanged. For the origin, `originAllowed` is reused with one difference: a request without `Origin` is accepted on `/mcp`, because a page in the owner's browser cannot attach the `Authorization` header to a cross-origin request without a CORS preflight, and the daemon sends no CORS headers. A request with a foreign `Origin` gets 403. `recoverPanic` and `logRequests` wrap `/mcp` as every other route.
- **Server per permission set.** The MCP server is built for the permissions of the token. Phase 1 has one permission, read. A write tool is registered only for a token that carries a write permission, so without it the tool does not exist in `tools/list` rather than being refused on call. The status tool tells the agent which permissions it has.
- **Phase 1 tools**, all with the `ReadOnlyHint` annotation:
  - service and daemon status: sing-box state and owner (AC-36), versions of the daemon, the binary and the schema, routing mode, available runtime sources, MCP permissions;
  - route explanation by domain: the explanation of AC-34 for live connections whose host matches the domain; without such a connection the tool says so and does not compute a guess;
  - connections with a filter by host, device, rule, chain and network, with a row limit;
  - proxy groups, nodes and the last known latency; the tool does not run a latency check, since that can erase the node's delay history;
  - config version history: the list and the content of one version;
  - the tail of the sing-box log with a level filter and a line limit;
  - dataplane diagnostics of AC-68.
- **Secrets.** Every config fragment in a tool result passes the masking rules of AC-66 (the key list and the rule for `url` and `download_url`). MCP has no reveal button: a masked value stays masked.
- **Tool wrapper.** Every tool is registered through one wrapper over the SDK registration: a `recover` that turns a panic into a tool error, and one log line per call with the tool name, the remote address, the duration and the error reason. Tool arguments are not logged.
- **Tests** go through an SDK client session against the server, without a network.
- **Dependencies.** Allowed: `github.com/modelcontextprotocol/go-sdk` and its indirect modules, versions pinned in `go.mod` and `go.sum`. The SDK is imported only by the package that builds the MCP server; other daemon packages stay on the standard library.

### Phase 2, not decided here

Write through MCP is a separate ADR with its own security review. The direction from the evaluation of 2026-10-20: an edit goes to the draft by an allow-list of config paths, not a deny-list, so a new field is closed to the agent until opened explicitly; closed are the dataplane and the ACL, the panel address and port, `experimental.clash_api`, the MCP settings and secrets; the agent gets the diff and the value read back; applying goes through Apply with the confirmation window; undo is a rollback to a version from history, without a separate undo journal; a write is refused if the draft or the applied version changed since the agent read it. Write tools carry `DestructiveHint`.

### Scope and boundaries

- `apps/metaboxd/go.mod`, `go.sum`: the first `require`.
- `apps/metaboxd/internal/httpapi`: the `/mcp` route and its filter.
- A new package under `apps/metaboxd/internal/` that builds the MCP server and the tools on top of the same services the REST handlers use.
- The panel: enabling MCP and generating the token.

## Consequences

### Positive

- The agent reads the router state through typed tools with schemas, without the panel session.
- Following the MCP specification is an SDK update, not a rewrite of the protocol.
- A token leak exposes only what the read tools return, with secrets masked; it does not give the panel.
- Phase 2 adds tools to the same server without changing the access model.

### Negative

- The daemon module stops being standard library only: nine modules in `go.sum`, their updates and their vulnerabilities become the project's concern.
- The binary grows by up to 2.2 MB.
- The rule "a mutating request without `Origin` is rejected" (AC-19) gets an exception for `/mcp`; it rests on the token and on the absence of CORS headers.
- A second secret next to the panel password: the owner keeps the token in the agent's config, and the daemon keeps a hash of it.
- The route explanation by domain covers only domains with a live connection.

### Neutral or deferred

- Write tools: phase 2, a separate ADR.
- A field reference for agents (meaning of zero values, units, real defaults), generated from the fork schema with manual notes.
- MCP over stdio and access from outside the LAN.

## Risks and mitigations

| Risk                                                                      | Likelihood and impact                       | Mitigation                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The token leaks from the agent's config                                   | medium likelihood, read access to the state | read-only in phase 1, secrets masked, the token is regenerated in the panel and disabled over SSH            |
| A secret leaks through a tool result that bypasses masking                | medium likelihood, high impact              | masking in one place for all config fragments; a test per tool that returns config with a known secret value |
| A secret leaks through the sing-box log tail                              | low likelihood, high impact                 | the log is the same text the panel log screen shows; documented as not masked                                |
| An SDK update changes behaviour, as the `GODEBUG` switches of `v1.7.0` do | high likelihood, low impact                 | the version is pinned exactly; an update is a separate change with the SDK client tests run                  |
| DNS rebinding to `/mcp`                                                   | low likelihood, high impact                 | `checkHost` on `/mcp` as on every route                                                                      |

## Compatibility, migration and rollback

Backward compatible: MCP is off by default, the panel API and its middleware do not change for existing routes. Nothing to migrate. Rollback is disabling MCP in the panel or removing its settings file over SSH; removing the feature is reverting the change and the dependency in `go.mod`.

## Validation

- `cd apps/metaboxd && go test ./...`: tests through an SDK client session for every tool; a request without a token or with a wrong one gets 401; with MCP disabled `/mcp` gets 404; a foreign `Origin` gets 403; a foreign `Host` is rejected; a panel session cookie does not open `/mcp`, and the MCP token does not open `/api/*`; with a read-only token `tools/list` has no tool without `ReadOnlyHint`; a panicking tool returns a tool error and the server keeps answering; a config fragment with a known secret comes back masked.
- `make lint` and the daemon build for `linux/arm64`: the size of the stripped binary grows by no more than 2.2 MB.
- Manual: Claude Code connected to `/mcp` with the token on the test bench and on the router lists the phase 1 tools and calls each of them.

## Links

- [`../PRD.md`](../PRD.md): sections 4 and 5 (MCP criteria), AC-19, AC-34, AC-36, AC-66, AC-68, AC-69, section 8, the roadmap after v1;
- [ADR-0041](./ADR-0041-run-v1-without-authentication-behind-network-and-origin-checks.md): the `Origin` and `Host` checks;
- [ADR-0052](./ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md): the optional panel password and the daemon service directory;
- [`../../apps/metaboxd/internal/httpapi/middleware.go`](../../apps/metaboxd/internal/httpapi/middleware.go): `checkHost`, `checkOrigin`, `originAllowed`;
- [`../../apps/metaboxd/AGENTS.md`](../../apps/metaboxd/AGENTS.md): a new dependency needs an ADR;
- [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk): `StreamableHTTPOptions.Stateless`, `ToolAnnotations`;
- [DanielLavrushin/b4, `src/http/handler`](https://github.com/DanielLavrushin/b4/tree/main/src/http/handler): the reference implementation, files `mcp*.go`.
