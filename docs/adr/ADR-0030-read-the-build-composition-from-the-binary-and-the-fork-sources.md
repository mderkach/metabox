# ADR-0030. Read the build composition from the binary, and which type a tag gates from the fork sources

- Status: Accepted
- Date: 2026-09-23
- Deciders: repository owner

## Context and problem statement

AC-47: the panel shows a node type that is missing from the sing-box build on the device with a warning. It does not block building such a config, but it names the consequence — the binary will refuse to start. The build composition is taken from the binary itself, not hard-coded in the panel as a list.

Facts checked against the sources of the fork `v1.14.0-extended-2.7.1`:

- `sing-box version` prints a line `Tags: with_quic,with_utls,...` with the binary's build tags. For a build without tags this line is absent (`cmd/sing-box/cmd_version.go`).
- The binary on the BPI-R4 Pro is built without `with_ccm`, `with_ocm`, `with_cloudflared`, `with_naive_outbound`, `with_usbip`, `with_openvpn` and `with_openconnect` — measured with `sing-box version` on 2026-09-23. The fork's default tag set (`release/DEFAULT_BUILD_TAGS`) includes them, so it cannot be used to judge the binary.
- The type registry does not help tell them apart: without the tag the file `include/<x>_stub.go` registers the same type with the same options. It differs only by an error at start — "QUIC is not included in this build".
- Which tag gates which type is visible only in the `include/` sources. A file under the condition `//go:build with_x` or `!with_x` registers types directly — `inbound.Register[...](registry, C.TypeHysteria, ...)` — or through a function of the protocol package: `warp.RegisterEndpoint(registry)`.
- The schema generator already reads the fork sources via `go/parser`: the `constant` package and field descriptions.

## Decision drivers

1. Which tags the binary has is answered by the binary itself on the device.
2. Which tag gates which type is derived from the fork, not written by hand, and is updated together with the schema.
3. An unknown build composition does not turn into false warnings.
4. No new dependencies in the daemon and the panel.

## Considered options

1. **Tags from the binary via `sing-box version`, the "type → tag" table from the schema generator out of the fork's `include/`.**
   - The daemon reads the tags together with the version once at start.
   - The generator prints `BUILD_TAG_OF_TYPE` into `generated.ts`.
   - Meets all drivers.
   - **Chosen.**
2. **Check each type by asking the binary — a trial `sing-box check` on a minimal config.** Exact by definition: the stub answers with an error from the constructor, and `check` catches it. But that is dozens of process launches on the router at every daemon start for what one line of `sing-box version` shows. **Rejected.**
3. **A "type → tag" table by hand in the panel.** It will drift from the fork at the first rebuild. **Rejected.**

## Decision outcome

- `singbox.Client.Build` reads the version and tags (`apps/metaboxd/internal/singbox/singbox.go`).
- `GET /api/status` returns `singbox_build.tags`:
  - no field — the binary was not read;
  - an empty list — a build without tags.
- `tools/schemagen/gates.go` builds the "registry → type → tag" table:
  - walks `include/*.go` and takes the `with_*` tag from the build condition;
  - handles direct registrations and one step into a protocol package function — only the called function is read, neighbouring ones register types without a tag;
  - types missing from the schema do not enter the table.
- The platform part of the condition (`linux || windows` for usbip) is not taken into account: the panel manages a router on Linux.
- Panel: `findUnbuiltNodes` walks the sections `inbounds`, `outbounds`, `endpoints`, `providers`, `services`, `certificate_providers`, `dns.servers`. `ConfigBuildNotice` above the configuration section content names the nodes and the consequence. With the binary not read there is no block.

## Consequences

### Positive

- The warning follows the binary on the device: a fork rebuilt with `with_ccm` removes it without a panel change.
- The table changes together with the schema and shows up in the `generated.ts` diff.

### Negative

- Parsing `include/` relies on fork conventions: a build condition with one `with_*` tag, registration by a direct call or through a package function. If the fork changes its technique, the table becomes incomplete. `TestBuildGates` catches this, but not the completeness of the list.
- Tags are read once at daemon start: a binary replaced under a running daemon reaches the panel after the daemon restarts.
- The warning is shown only in the configuration section. The apply bar does not repeat it; `sing-box check` will stop the apply.

### Neutral or deferred

- Marking the type in the type picker when creating a node — when node creation forms appear; there are none now.

## Compatibility, migration and rollback

The `singbox_build` field is optional: without it the panel shows no warning. Rollback: remove `emitGates` from the generator and `ConfigBuildNotice` from the section layout.

## Validation

- `go test ./internal/singbox ./internal/httpapi`:
  - tags are parsed;
  - a build without tags gives an empty list, not `null`;
  - an unread binary does not return the field.
- `make test-schemagen`, `TestBuildGates`:
  - direct registration;
  - registration through a protocol package (`warp`);
  - a condition with a platform part;
  - a type that a neighbouring package function registers without a tag (inbound `naive`).
- `pnpm --filter web exec vitest run Config.build ConfigBuildNotice`.

## Links

- `docs/PRD.md`, AC-47;
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md);
- `tools/schemagen/gates.go`, `apps/metaboxd/internal/singbox/singbox.go`, `apps/web/src/entities/Config/model/Config.build.ts`.
