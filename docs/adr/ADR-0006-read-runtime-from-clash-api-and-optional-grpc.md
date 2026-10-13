# ADR-0006. Keep the Clash API as the base runtime source, connect the fork's gRPC service optionally and only from the daemon

- Status: Accepted
- Date: 2026-09-11
- Deciders: repository owner

## Context and problem statement

The dashboard needs traffic, memory, service state, groups, nodes and the connection stream (AC-10…AC-12), and the Connections screen must handle thousands of connections (AC-30) without blocking the interface (NFR-2). At the moment the only source is the Clash API: the daemon guarantees the `experimental.clash_api` section in the applied config (AC-31) and shows this intervention to the user explicitly (AC-32). The OQ-5 check confirmed that the fork returns everything AC-10…AC-12 require.

In 1.14 the fork brought a second source: the `api` service type (`service/api/server.go`, registered as `C.TypeAPI`). It is a gRPC server over HTTP/2 with h2c, with its own `secret`, optional TLS and a built-in web dashboard. It brings up the `StartedService` service from `daemon/started_service.proto`. OQ-9 recorded the question: do we need a form for this type, and do we take it instead of the Clash API or in addition to it.

Checking the sources of the fork `v1.14.0-extended-2.7.1` gives the facts the answer depends on.

**What only gRPC has.** `SubscribeConnections` returns an event stream: `ConnectionEvent` with type `NEW` / `UPDATE` / `CLOSED` and the fields `uplinkDelta`, `downlinkDelta`, and the `ConnectionEvents` envelope carries a `reset` flag on reconnect. The `Connection` message provides `fromOutbound`, `inboundType`, `ipVersion` and a structured `processInfo`. Both sources return the proxy chain the same way: both `"chains"` in the Clash API and `chainList` in gRPC read the same field `TrackerMetadata.Chain`.

**What only the Clash API has.** The ordered list of rules, `GET /rules` (`experimental/clashapi/rules.go`), mounted in `experimental/clashapi/server.go`. `daemon/started_service.proto` has no RPC and no message for rules. Nor does it have an equivalent of `GET /dns/query` (`experimental/clashapi/dns.go`), which resolves a name through sing-box itself.

**How the Clash API returns connections.** `experimental/clashapi/connections.go` sends over WebSocket a **full snapshot** of all connections every `interval`, 1000 ms by default. There are no deltas.

It follows that "gRPC instead of the Clash API" is impossible: without `/rules` there is nothing to link a connection to a config node, and that is the core of US-2. The question comes down to whether to connect gRPC in addition, who acts as its client, and whether the daemon may add one more section to the config on its own.

In scope: the set of runtime data sources, the place of the gRPC client, the degradation order, the attitude to the user's config. Out of scope: explaining the route from this data, [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md); the Apply protocol, [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md); the fate of the web dashboard built into the fork.

## Decision drivers

1. **Requirement coverage**: the source must cover AC-10…AC-12 and US-2 in full, not partially.
2. **Behaviour under load**: AC-30 and NFR-2 set up to 5000 active connections; the traffic volume between sing-box and the daemon at this limit is part of the architecture, not a detail.
3. **Minimal intervention in the user's config**: UX-3 and AC-2 require metabox not to change someone else's file without need; AC-31 and AC-32 set the bar below which intervention is unacceptable: it must be forced and visible.
4. **Panel independence from sing-box** (NFR-1): a missing source leads to a degraded screen, not a failed panel.
5. **No browser constraints**: when a browser talks to the API, connecting runs into the secret, CORS, the HTTP or HTTPS choice and the loopback address. `external_controller` listens on `127.0.0.1` by default (AC-31), so it is in principle unreachable from a browser, and the fork's gRPC service can also do TLS with its own certificate. The daemon is free of all this: it calls both APIs from the same machine.
6. **Maintenance cost**: how many surfaces have to be kept up to date when bumping the fork version.
7. **Cost of dependencies and artifact weight**: `apps/metaboxd/go.mod` has no `require` at all: the daemon rule says everything needed is in the standard library, and a new dependency needs a separate decision. The daemon ships as a single aarch64 binary and lives within the NFR-4 budget (RSS ≤ 64 MB), so breaking the rule must be justified by a measurable gain, not convenience.

## Considered options

1. **Clash API only: keep the current approach.** Pros: one surface, the decision is already verified on the device (OQ-5), the config is edited by exactly one section. Cons: a full snapshot every second at the NFR-2 limit turns into constant pumping of the whole connection list between sing-box and the daemon, and this cannot be softened on the client side: the period can only be increased, losing screen liveness; process information arrives as one flat `processPath` string, without an identifier, user and packages. **Rejected as the only source, but kept as the base one.**

2. **gRPC only.** Pros: an event stream and deltas, richer connection metadata, one transport. Cons: no rule list and no DNS query, so US-2 cannot be covered in principle (driver 1); it requires a mandatory `service` section of type `api` in every user's config, that is, a second forced intervention (driver 3); the Clash API is not deprecated in 1.14, and there is no reason to give up a working source. **Rejected.**

3. **Both sources, gRPC mandatory, the daemon adds the `service` of type `api` itself.** Pros: the better connection stream is always available, behaviour is the same for all users. Cons: a second section added to someone else's config automatically. The justification of AC-31 rests on the fact that **without** the Clash API there is no dashboard at all (section 8 of the PRD explicitly rejects a mode without it); gRPC has no such justification: a working degradation exists. The forced nature disappears, only convenience remains, and the intervention no longer meets driver 3. **Rejected.**

4. **Both sources, gRPC optional, the daemon acts as the client.** Pros: US-2 is covered through the Clash API, the load scenario is covered through gRPC where the user enabled it; the user's config gets no second automatic edit; the browser calls neither of the two APIs, so the secret, CORS and protocol choice stay inside the daemon (driver 5); bumping the fork version changes only the Go side. Cons: two surfaces instead of one, two code paths for connections and, as a consequence, two sets of screen states; the gRPC client brings the daemon its first external dependencies, `google.golang.org/grpc` and `google.golang.org/protobuf` with their tree, and stubs generated from the fork's `.proto` (driver 7). **Chosen with deferred implementation: see the condition below.**

## Decision outcome

The daemon reads the runtime from two sources and decides itself which one to use.

**The Clash API is the base source and is mandatory.** AC-31 and AC-32 do not change. It keeps: the ordered rule list (`GET /rules`), groups and nodes (`/proxies`, `/providers/proxies`), traffic and memory (`/traffic`, `/memory`), version and config (`/version`, `/configs`), the DNS query (`/dns/query`), and connections when the second source is unavailable.

**The fork's gRPC service is an additional source and is optional.** When the applied config has a working `service` of type `api`, the daemon subscribes to `SubscribeConnections` and keeps the connection list by events, not snapshots. `SubscribeStatus` is not used: traffic, memory and service state stay on the Clash API so that their shape does not depend on the source. When the service is missing, the daemon takes connections from the Clash API as snapshots. A missing gRPC is not an error and blocks no screen.

**The daemon does not add a `service` of type `api` silently.** The section appears only on an explicit user action. metabox may offer to add it and prepare a draft, but the change itself goes through the regular Apply protocol from ADR-0002 and is confirmed by the user. A form for the `api` type is needed: section 8 of the PRD excludes the service types listed there from forms, and this type is the only exception because it belongs to the panel's own scenario.

**Only the daemon is a gRPC client.** The browser does not call gRPC: gRPC-Web is not enabled, and the secret is not exposed. The frontend gets connections and status over REST and SSE, in a shape that does not depend on which source worked. This shape does not become uniform by itself: the sources differ both in the set of connections and in the format of the `rule` field, and the daemon reduces them to one model (ADR-0007).

**The active source is visible to the frontend.** The `GET /api/status` contract reports which sources are available and which one is used for connections. The screen must distinguish "a different source" from "no data"; silently swapping one source for another is forbidden: it is the same class of error as passing a prediction off as a fact in ADR-0007.

**Implementation of the gRPC branch is deferred until a measurement.** It brings the daemon its first external dependencies and therefore does not start until both conditions are met: the path through the Clash API works on the device, and a measurement on the target hardware has shown that snapshots really do not hold the NFR-2 limit. Until then the decision only fixes the boundary: the daemon–frontend contract is built so that the connection source can be replaced without touching the frontend. The rule of `apps/metaboxd/go.mod` without `require` stays in force until this measurement.

### Scope and boundaries

The decision covers `apps/metaboxd` and the contract between the daemon and the frontend. It does not change the config schema (ADR-0001) or the Apply protocol (ADR-0002). Whether and how to show the web dashboard built into the fork stays open and is decided separately.

## Consequences

### Positive

- US-2 does not depend on gRPC being present: the rule list comes from the source the daemon guarantees anyway.
- When the gRPC branch is implemented, the NFR-2 limit becomes reachable without increasing the snapshot period: where the user enabled a `service` of type `api`, the stream goes as deltas.
- The user's config gets no second automatic edit; the AC-31 bar stays an exception, not a precedent.
- The secret, CORS and the HTTP/HTTPS choice stay inside the daemon and do not turn into a connection problem on the browser side.
- Bumping the fork version touches only the Go side: the frontend contract does not depend on which API worked.

### Negative

- Two ways of getting connections mean two sets of states and two places where behaviour can diverge. This needs a common connection model in the daemon and tests on both branches.
- A user without a `service` of type `api` gets worse screen liveness at large volumes. This is a deliberate trade-off in favour of keeping their config untouched.
- The fork returns the Clash API `rulePayload` field empty (`experimental/clashapi/connections.go`), so parsing the rule conditions falls on metabox; see ADR-0007.
- The sources return different sets of connections: the Clash API drops connections with `outbound_type = dns` (`experimental/clashapi/connections.go`), gRPC returns all of them. The daemon must bring the sets to one filtering rule, otherwise switching the source looks to the user like a jump in the number of connections.
- When the gRPC branch is implemented, the daemon stops being a module without dependencies: `google.golang.org/grpc`, `google.golang.org/protobuf` and generated stubs appear, and with them binary weight, memory under NFR-4 and the duty of tracking their versions. This ADR satisfies the `apps/metaboxd/AGENTS.md` rule on new dependencies but does not revoke it: the deviation is targeted and only for the gRPC client. The generated client pulls in the whole `started_service.proto`: 42 RPCs and 102 messages, including Tailscale, USB/IP, OpenVPN and Taildrop, which the panel does not need. The growth of binary size and RSS is measured before implementation; if it exceeds NFR-4, generation is limited to the messages in use.

### Neutral or deferred

- The fate of the dashboard built into the fork (external link, embedding or dropping it) is not decided here.
- The threshold at which enabling gRPC should be suggested is not set: it comes from a measurement, not by assignment.
- The measurement that unlocks the gRPC branch implementation has not been done: the device has no runtime screen working on real data rather than mocks. Until then the decision acts only as a constraint on the shape of the contract.

## Risks and mitigations

| Risk                                                                                    | Likelihood and impact | Mitigation                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The two ways of getting connections diverge in behaviour                                | Medium, medium impact | Both branches are reduced to one connection model in the daemon; contract tests run on both                                                                                                                                                                                        |
| The gRPC subscription drops after a sing-box restart                                    | High, medium impact   | The fork provides the `reset` flag in `ConnectionEvents`; the daemon resubscribes and rebuilds the list, and the frontend sees the source state                                                                                                                                    |
| The `service` of type `api` listens on a non-loopback address or serves self-signed TLS | Medium, medium impact | Parameters are read from the applied config, not guessed. The daemon does not treat a non-loopback address as a config error, but does not fix it either; an untrusted certificate is a reason to stay on the Clash API with an explicit message, not to silently weaken the check |
| The fork changes the protocol between versions                                          | Low, medium impact    | The generated Go client breaks at build time, not at runtime; the binary version is already checked per AC-28                                                                                                                                                                      |

## Compatibility, migration and rollback

No migration is needed: the Clash API stays the same source as now, and behaviour without a `service` of type `api` does not change. Existing configs keep working without edits.

Rollback: remove the gRPC branch from the daemon. The contract with the frontend does not change: it does not depend on the source; screens lose only the deltas and metadata available only in gRPC.

## Validation

- A config without a `service` of type `api`: the panel opens, the Connections screen is live, `GET /api/status` reports that connections come from the Clash API.
- A config with a `service` of type `api`: `GET /api/status` reports gRPC as the active source; stopping and starting sing-box leads to resubscription and a rebuild of the list without a page reload.
- The daemon is running, the config has a `service` of type `api`, but the port is closed: the panel works, the connection source is the Clash API, and the reason for the failed connection is visible.
- `make apply-check` passes unchanged: the Apply protocol is not affected by the decision.
- The number of connections on the screen does not jump when the source changes: the sets are brought to one filtering rule, and DNS connections are either in both or in neither.
- A measurement on the target hardware is recorded before the first `require` appears in `apps/metaboxd/go.mod`.
- The `service` section of type `api` does not appear in the config in any scenario except an explicit user action.

## Links

- [PRD](../PRD.md): US-2, AC-10…AC-12, AC-30…AC-32, NFR-1, NFR-2, section 8, closed questions OQ-5 and OQ-9;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): the Apply protocol and config ownership;
- [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md): explaining the route from this data;
- [sing-box-extended](https://github.com/shtorm-7/sing-box-extended): the fork, version `v1.14.0-extended-2.7.1`: `service/api/server.go`, `daemon/started_service.proto`, `experimental/clashapi/server.go`, `experimental/clashapi/rules.go`, `experimental/clashapi/connections.go`, `experimental/clashapi/dns.go`;
- [sing-box Service API](https://sing-box.sagernet.org/configuration/service/api/): documentation of the `api` service type.
