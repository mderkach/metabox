# ADR-0040. Ship the panel as one Go daemon with an embedded SPA

- Status: Accepted. The decision was made on 2026-08-30 in section A.3 of [`../PRD.md`](../PRD.md) and moved here without changes in substance
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.3 of [`../PRD.md`](../PRD.md)

## Context and problem statement

The panel on the router needs a server side: the browser cannot write `config.json` by itself, call `sing-box check`, restart the service through procd or roll the config back. It has to be decided what this part is and how the interface reaches the device together with it.

The owner's answer in interview `metabox-di-001`, Round 3: "Own Go daemon with an embedded UI." The architectural model is [daniellavrushin/b4](https://github.com/daniellavrushin/b4): a Go daemon with an embedded UI and a single JSON config (appendix B of the PRD). LuCI integration was deferred in Round 0.

In scope: what the panel runtime on the device consists of and what it does. Out of scope: the way static files are embedded ([ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md)), the apply protocol ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)), the package format ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)).

## Decision drivers

- A single delivery artifact (section 9 of the PRD): one file goes to the device.
- The panel stays alive when sing-box is stopped or broken (NFR-1).
- The full set of config and service operations on the device, without SSH (SM-3).
- Development and build cost.

## Considered options

The transcript kept only the owner's answer; the alternatives below are reconstructed from the PRD text.

1. **A LuCI application.** Integrates into the stock OpenWrt web interface. Deferred by the owner in Round 0 and listed in the roadmap as "LuCI integration"; work with the config, `check`, restart and rollback would still require its own server side on the device. **Rejected for v1.**
2. **Static files separate from the server side**: the SPA is served by the router's stock web server, the API is a separate process. Two delivery artifacts instead of one, whose versions can diverge. **Rejected.**
3. **One Go binary that serves the embedded SPA and holds the API.** **Chosen.**

## Decision outcome

One binary, `metaboxd`, runs on the device. It:

- serves the built SPA embedded in the binary (`go:embed`);
- provides a REST API for the config, rule sets and apply;
- owns `config.json`, the version history and backups;
- calls `sing-box check`;
- manages the service through procd (`/etc/init.d/sing-box`);
- proxies the sing-box Clash API for the dashboard.

The call to `sing-box rule-set compile` is removed from the original A.3 list: compiling a custom list into `.srs` on the device is cancelled, since the fork's `local` rule set reads the JSON source directly ([ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md)).

### Scope and boundaries

Details of individual responsibilities are in their own ADRs: SPA embedding in [ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md), apply and config ownership in [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), the runtime source in [ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md), the service state in [ADR-0009](./ADR-0009-read-service-state-from-procd.md), the version history in [ADR-0008](./ADR-0008-store-config-versions-as-numbered-copies.md), the package in [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md).

## Consequences

### Positive

- The interface and the API are always of the same version: they arrive in one file.
- The panel does not depend on the router's stock web server or on the state of sing-box.

### Negative

- The project is bilingual: Go and TypeScript.
- Cross-compilation for aarch64 (`make daemon-device`) is needed, and CI has to build the frontend before `go build`, because the frontend gets into the binary through `go:embed`.

### Neutral or deferred

- LuCI integration is a roadmap item after v1.

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since the start of the project and is moved from the PRD without changes in substance.

## Validation

- AC-17: `make daemon` builds a binary that starts with one command, serves the embedded UI and answers the REST API.
- `make package` builds a package with one binary at `/usr/bin/metaboxd`.

## Links

- [`../PRD.md`](../PRD.md): AC-17, NFR-1, SM-3, sections 9 and 11, appendix B, section A.3 (superseded by this ADR);
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md), [ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md), [ADR-0008](./ADR-0008-store-config-versions-as-numbered-copies.md), [ADR-0009](./ADR-0009-read-service-state-from-procd.md), [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md), [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md);
- [`../../apps/metaboxd`](../../apps/metaboxd): the implementation;
- [daniellavrushin/b4](https://github.com/daniellavrushin/b4): the architectural model.
