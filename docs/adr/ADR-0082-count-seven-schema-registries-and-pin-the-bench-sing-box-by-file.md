# ADR-0082. Count seven schema registries and pin the bench sing-box by file

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner
- Supersedes (as to the number of registries, six): [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)
- Supersedes (as to `SINGBOX_VERSION` as the pin of the bench sing-box): [ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md), [ADR-0058](./ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md)

## Context and problem statement

An audit of the decision records against the code on 2026-11-15 (issue #336) found two statements that the code no longer follows and that no later record corrects:

- ADR-0001 says the generator runs the fork's string constants through six registries: inbound, outbound, endpoint, provider, DNS transports, service. `tools/schemagen/main.go` and `tools/schemagen/gates.go` have seven: the fork's certificate providers (`adapter/certificate`, the `certificate_provider` group) were added after ADR-0001.
- ADR-0038 and ADR-0058 say the sing-box version of the test bench is the variable `SINGBOX_VERSION`. The pin is the file `sing-box-extended.sha256` at the repository root, described in [`docs/Development.md`](../Development.md); `.devcontainer/target/Dockerfile` reads it, and `SINGBOX_VERSION` exists only as a literal in `install.sh`.

Out of scope: the reflection method, build tags and everything else decided in ADR-0001, and the install flow of ADR-0058. They stay in force.

## Decision drivers

- A reader of an accepted ADR must not be misled about the code.
- An accepted ADR is not rewritten after the fact; a correction is a new record.
- The numbers stated by a record should be checkable by a command or a test.

## Considered options

1. **Edit ADR-0001, ADR-0038 and ADR-0058 in place.** Smallest diff, but it rewrites the meaning of accepted records. **Rejected**: the repository rule allows only editorial changes there.
2. **A new record that supersedes the stale statements, with back-links in the headers.** **Chosen.**
3. **Do nothing.** The statements stay wrong. **Rejected.**

## Decision outcome

- The generator reads the fork's constants through seven registries: inbound, outbound, endpoint, provider, DNS transports, service and certificate provider. Wherever ADR-0001 says "six registries", read seven. A new registry in the fork is added to `registryPackages` in `tools/schemagen/gates.go` and to the `shadows` and `names` maps in `tools/schemagen/main.go`.
- The sing-box-extended release the bench installs is pinned by the version and the per-architecture sha256 in `sing-box-extended.sha256`. `install.sh` carries the same version and the router hash as literals, and `make singbox-pin-check` fails when they differ from the file. Wherever ADR-0038 or ADR-0058 name `SINGBOX_VERSION` as the bench pin, read this file; a fork upgrade changes the file and the literals in one commit.

## Consequences

### Positive

- The records match the code; the back-links in the headers lead a reader of the old record to the correction.

### Negative

- A reader has to follow one more link to get the full picture of ADR-0001, ADR-0038 and ADR-0058.

### Neutral or deferred

- The count of registries is not checked by a test; a new registry still depends on someone updating the three places named above.

## Compatibility, migration and rollback

Not applicable: documentation only, no code or data changes.

## Validation

- `tools/schemagen/gates.go` (`registryPackages`) and `tools/schemagen/main.go` (`shadows`, `names`) list the same seven groups.
- `make singbox-pin-check` compares `sing-box-extended.sha256` with `install.sh`; `make trace-check` checks the links of this record.

## Links

- Issue #336, the audit of decision records against the code;
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), [ADR-0038](./ADR-0038-target-the-sing-box-extended-fork-schema-only.md), [ADR-0058](./ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md);
- [`../Development.md`](../Development.md), section "Test bench";
- [`../../sing-box-extended.sha256`](../../sing-box-extended.sha256), [`../../tools/schemagen/gates.go`](../../tools/schemagen/gates.go).
