# ADR-0077. Describe the managed core as data in the status contract

- Status: Accepted
- Date: 2026-11-14
- Deciders: repository owner

## Summary

The daemon status (`GET /api/status`) and the status tool of the MCP (Model Context Protocol) server now describe the managed core with one object, `core: { type, variant, version, build }`: `type` is the core family (`sing-box`), `variant` the build line (`extended` for the sing-box-extended fork), `version` and `build` what the binary printed. The panel and the MCP tool read this object. The old fields `singbox_version` and `singbox_build` (and `singbox_version`, `singbox_tags` in the MCP tool) stay, marked deprecated, and are removed in the first release after the one that added `core`. Rejected: renaming the old fields in place, which breaks outside clients at once, and keeping them as they are, which leaves the core's name in the contract shape. For the owner: nothing changes on the device or in the interface; scripts or agents that read `singbox_version` have one release to switch to `core.version`.

## Context and problem statement

Section 9 of the [PRD](../PRD.md) requires that daemon and frontend contracts do not assume the runtime is always sing-box-extended: the core type, variant and version arrive as data, not in type and field names. The status contract broke this: `contract.Status` had `singbox_version` and `singbox_build` (type `SingboxBuild`), and the MCP status tool returned `singbox_version` and `singbox_tags`. Roadmap item 1 (a second core) builds on a contract that names the core by value.

In scope: the shape of `GET /api/status` and of the `metabox_status` MCP tool, and the panel adapter that reads them. Out of scope: names on the device (the `metabox-singbox` service, the `metabox.dataplane` UCI section, `/etc/metabox/sing-box/`), whose rename needs a migration of installed routers, and interface texts. The panel's own model (`DaemonStatus.singboxVersion`, `singboxTags`) is not a wire contract and keeps its names.

## Decision drivers

- Compliance with section 9 of the PRD: the core is described by values.
- Backward compatibility for clients outside the panel: MCP agents and scripts reading the status.
- A minimal change: the panel ships in the same binary as the daemon and needs no transition period itself.
- Testability: the shape is checked by Go tests and the generated Zod schema.

## Considered options

1. **Add a `core` object, keep the old fields as deprecated for one release**: clients switch at their pace, the shape already matches the PRD, the panel reads only `core`. Drawback: two copies of the same data for a release. **Chosen.**
2. **Rename the fields in place** (`singbox_version` to `core.version` with no copy): the cleanest contract. Drawback: an MCP agent or a script reading the old field silently gets nothing after an update. **Rejected**: the MCP server is a public interface, and a silent break there costs more than one release of duplicate fields.
3. **Keep the current fields**: no change. Drawback: the contract keeps contradicting section 9, and the second core would have to add `xray_version`-style fields. **Rejected.**

## Decision outcome

- `contract.Status` has a required `core` field of type `contract.Core` with `type` (always set), `variant`, `version` and `build` (each absent when unknown). `build` keeps the earlier rule: absent means the binary was not read, an empty `tags` list means a build without tags.
- The build composition type is `contract.CoreBuild`; `SingboxBuild` is gone as a type name. The deprecated `singbox_build` field has this type.
- `type` is `singbox.CoreType`; `variant` comes from `singbox.Variant(version)`: `extended` when the version has the `-extended-` part of the fork's version scheme, empty otherwise.
- `singbox_version` and `singbox_build` in the HTTP status, `singbox_version` and `singbox_tags` in the MCP status keep their values and carry a `Deprecated:` godoc paragraph with the removal condition.
- The panel adapter (`toDaemonStatus`) reads `core.version` and `core.build.tags` only.

## Consequences

### Positive

- The status contract no longer names the core in field or type names; another core fills the same object.
- Agents get the core variant without parsing the version string.

### Negative

- For one release the status carries the version and tags twice.
- `variant` is derived from the version string, so a fork that changes its version scheme yields an empty variant until `singbox.Variant` learns it.

### Neutral or deferred

- Other contract shapes that mention sing-box by name in field values or descriptions, the domain model in PRD appendix C and on-device names are not touched; on-device names go with the adapter boundary of roadmap item 1.

## Compatibility, migration and rollback

The change is additive for clients: every old field keeps its value. Removal: in the first release after the one that added `core`, the deprecated fields are deleted from `contract.Status` and the MCP `statusOut`, and `make schema-daemon` regenerates the panel schema. Rollback is reverting the commit; the panel and daemon ship together, so no mixed versions exist on a device.

## Validation

- `make test`: `TestStatusReportsCore` in `apps/metaboxd/internal/httpapi/httpapi_test.go` checks the object for the fork, an upstream version and an unread binary, and that the deprecated fields agree with it; `TestStatusNamesPermissions` in `apps/metaboxd/internal/mcp/mcp_test.go` checks the MCP tool; the panel adapter test in `apps/web/src/entities/Daemon/__tests__/Daemon.adapter.test.ts` reads the object.
- `make schema-daemon` leaves `apps/web/src/shared/api/daemon.generated.ts` unchanged.
- Governed files: `apps/metaboxd/internal/contract/contract.go`, `apps/metaboxd/internal/httpapi/httpapi.go`, `apps/metaboxd/internal/mcp/tools.go`, `apps/metaboxd/internal/singbox/singbox.go`, `apps/web/src/entities/Daemon/model/Daemon.adapter.ts`.

## Links

- [PRD](../PRD.md), section 9 "Constraints" and roadmap item 1.
- [ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md): the adapter layer between the UI and the fork schema.
- [ADR-0055](./ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md): the MCP server whose status tool changes.
