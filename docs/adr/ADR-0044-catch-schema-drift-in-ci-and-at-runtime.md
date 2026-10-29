# ADR-0044. Catch schema drift with two independent mechanisms, in CI and at runtime

- Status: Accepted. The decision was made on 2026-08-30 in section A.9 of [`../PRD.md`](../PRD.md) and moved here without changes in substance; A.9 called the schema version the daemon version, and it is compared by the panel embedded in the daemon binary ([ADR-0040](./ADR-0040-ship-the-panel-as-one-go-daemon-with-an-embedded-spa.md))
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.9 of [`../PRD.md`](../PRD.md)

## Context and problem statement

The panel schema is generated from one pinned fork version ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), [ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md)). The fork publishes releases, and the schema diverges from them in two ways: the repository keeps the old version, and on the router the owner installs a different binary than the one the panel was built on. On a newer version the panel does not know new fields; on an older one it offers a field the binary does not understand, and `sing-box check` rejects the config on Apply. This is risk R-2.

The owner's answer in interview `metabox-di-002`, Round 7: "CI watches + runtime warns."

In scope: how a divergence of the schema from fork releases and from the binary on the device becomes visible. Out of scope: how the schema is extracted ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)) and which tags went into the binary build ([ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md)).

## Decision drivers

- A fork schema change does not go unnoticed.
- The owner sees the divergence on their device rather than learning about it from an Apply refusal.
- A fork version bump stays mechanical: the generator and the schema diff.

## Considered options

The transcript kept only the owner's answer; the arguments below are reconstructed from the text of A.9 and R-2.

1. **CI only.** The repository learns about a fork release, but the binary on the device is updated independently of the panel, and the divergence on the router stays invisible. **Rejected as the only mechanism.**
2. **Runtime only.** The owner sees the divergence on the device, but the schema in the repository does not catch up with the fork by itself. **Rejected as the only mechanism.**
3. **Both mechanisms, independent of each other.** **Chosen.**

## Decision outcome

Two independent mechanisms:

- **CI** tracks sing-box-extended releases, runs the schema generator and opens a PR with the diff, so a change cannot go unnoticed.
- **Runtime** compares the version of the binary installed on the device with the schema version the panel was built on and, on a mismatch, shows a warning in the UI (AC-28).

### Scope and boundaries

The runtime mechanism works like this: the daemon reads `sing-box version` and returns it in `GET /api/status`; the schema carries the fork version as the `SCHEMA_FORK_VERSION` constant; the panel compares them (`schemaDrift` in `apps/web/src/entities/Daemon/model/Daemon.version.ts`) and shows a mark in the sidebar footer, visible from any screen, plus a details block in the configuration section under the tabs, since the divergence affects only forms. A binary newer than the schema gives a note that the forms have no new fields and they are edited in the "Text" mode; an older binary gives a warning that a field from a form will not pass the check. An unknown binary version does not count as a divergence.

The CI mechanism is `.github/workflows/fork-release-watch.yml`, run daily and on demand. `.github/scripts/fork-release-check.sh` compares the pin in the `replace` block of `tools/schemagen/go.mod` with the latest fork release. On a newer one the workflow rebuilds the `replace` block from the fork's `go.mod`, raises `forkVersion` in `tools/schemagen/main.go`, runs `make schema` ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)) and opens or updates the PR from the branch `build/bump-sing-box-extended` with the schema diff; an existing branch is never overwritten. A PR opened with the default token starts no workflows, so the required checks need the `FORK_BUMP_TOKEN` secret. `SINGBOX_VERSION` of the test bench, `install.sh` and the README version follow the binary tested on the router and are not bumped.

## Consequences

### Positive

- The owner sees that the panel forms were built on a different version than the one on the router before trying to apply a config.

### Negative

- The comparison is strict by version: any fork release, even without schema changes, produces the block in the configuration section. Newer than the schema: a note; older: a warning.
- Without the `FORK_BUMP_TOKEN` secret the workflow cannot open a PR that starts the required checks.

### Neutral or deferred

- The bump PR is reviewed and merged by a person.

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since the start of the project and is moved from the PRD without changes in substance.

## Validation

- AC-28: the `internal/httpapi` tests, the `Daemon.version` test, the Overview screen and a daemon run with a 1.14 binary.
- The CI mechanism is validated by `fork release watch` run with `dry_run` (prints the diff, pushes nothing) and by the PR with the schema diff it opens on a fork release.

## Links

- [`../PRD.md`](../PRD.md): AC-28, risk R-2, milestone M4, section A.9 (superseded by this ADR);
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), [ADR-0030](./ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md), [ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md).
