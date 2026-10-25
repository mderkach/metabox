# ADR-0038. Target the sing-box-extended fork schema, not upstream sing-box

- Status: Accepted. The decision was made on 2026-08-30 in section A.1 of [`../PRD.md`](../PRD.md) and moved here without changes in substance, except for the way the fork is installed
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.1 of [`../PRD.md`](../PRD.md)

## Context and problem statement

The panel edits a sing-box config and builds forms from its schema, so before the generator and the forms it has to be decided whose config it describes. Besides upstream sing-box there are forks with additional protocols. The owner's router runs the fork [shtorm-7/sing-box-extended](https://github.com/shtorm-7/sing-box-extended): on top of upstream it provides WARP, MASQUE, MTProxy, Mieru, TrustTunnel and SSH; OpenVPN and Snell moved to upstream in 1.14, and the fork switched to the upstream implementations.

The owner's answer in interview `metabox-di-001`, Round 2: "Only sing-box-extended."

In scope: which config dialect the panel schema describes. Out of scope: how the schema is extracted from the fork ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)), how the panel handles types missing from the binary build ([ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md)), and a second core, which is moved to the PRD roadmap.

## Decision drivers

- The panel understands the config that the binary on the owner's device actually runs.
- Ordinary upstream sing-box configs stay valid.
- One schema per core: there is no averaged schema of several cores (section 9 and the PRD roadmap).
- Maintenance cost across releases.

## Considered options

The transcript kept only the owner's answer; the options and arguments below are reconstructed from the text of A.1 and sections 9 and 11 of the PRD.

1. **Only sing-box-extended.** The fork is a superset of upstream, so upstream configs are valid automatically, and the fork's protocols get forms on a par with the rest. Drawback: the panel is tied to the release pace of one fork (risk R-4 in the PRD). **Chosen.**
2. **Only upstream sing-box.** WARP, MASQUE, MTProxy, Mieru, TrustTunnel and SSH nodes would be unknown to the panel, while the binary on the owner's device is the fork. **Rejected.**
3. **A common schema for several cores.** Compatibility with upstream and the fork through one schema. Such a schema would describe none of the cores exactly; the PRD roadmap directly requires a separate schema, validator and adapter for each core. **Rejected.**

## Decision outcome

The compatibility target is the sing-box-extended fork. The schema is generated only from it; upstream configs are supported as a subset of the fork, there is no separate schema for upstream.

- The fork version is pinned in the `replace` block of [`tools/schemagen/go.mod`](../../tools/schemagen/go.mod) and in the generator's `forkVersion` constant, and it goes into the generated schema as the `SCHEMA_FORK_VERSION` constant.
- The test bench installs a sing-box package of the same fork (`SINGBOX_VERSION` in [`docs/Development.md`](../Development.md), section "Test bench").
- On OpenWrt the fork is installed as an apk package from the fork's releases (`sing-box-extended_<version>_openwrt_<arch>.apk`), the same one the test bench installs ([`.devcontainer/target/Dockerfile`](../../.devcontainer/target/Dockerfile)). The daemon relies on this package's init script `/etc/init.d/sing-box` and UCI `sing-box.main`: it uses them to restart the service and, from the command of its instance, to choose the check mode ([ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md)). The installer [EikeiDev/OpenWRT-sing-box-extended](https://github.com/EikeiDev/OpenWRT-sing-box-extended), which A.1 named as the target, is acceptable in package mode, since it installs the same package; its binary mode drops a single binary without an init script, leaving the daemon nothing to restart the service with, so it is not supported.

Non-goal: a second core in v1 (section 8 of the PRD). The section 9 constraint on the shape of contracts (the core type, variant and version arrive as data) is not weakened by this decision.

## Consequences

### Positive

- Upstream sing-box configs open without a separate compatibility mode.
- The fork's protocols are edited with forms, not only as text.

### Negative

- The panel depends on the development of one fork (R-4). The cost of moving to another core is its own schema, validator and service adapter.
- The schema describes all fork types, while the binary may be built without some tags; this is covered by [ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md).

### Neutral or deferred

- A second core is a PRD roadmap item and starts with a separate ADR about the adapter boundary.

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since the start of the project and is moved from the PRD without changes in substance.

How the binary on the owner's device was installed is not recorded in the repository; an installation without the package's init script gets an apply refusal, not support.

## Validation

- `make schema` builds the schema from the pinned fork version; the version is visible in the header of `apps/web/src/shared/api/generated.ts`.
- The golden round-trip over the corpus `apps/web/src/entities/Config/__tests__/corpus/` (AC-1…AC-3) parses ordinary sing-box configs.

## Links

- [`../PRD.md`](../PRD.md): sections 8, 9, the roadmap after v1, risk R-4, section A.1 (superseded by this ADR);
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md): extracting the schema from the fork;
- [ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md): types outside the binary build;
- [shtorm-7/sing-box-extended](https://github.com/shtorm-7/sing-box-extended), [EikeiDev/OpenWRT-sing-box-extended](https://github.com/EikeiDev/OpenWRT-sing-box-extended).
