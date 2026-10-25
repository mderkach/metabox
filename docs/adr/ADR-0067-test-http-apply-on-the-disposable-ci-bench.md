# ADR-0067. Test HTTP Apply on the disposable CI bench

- Status: Proposed
- Date: 2026-10-25
- Deciders: repository owner

## Context and problem statement

The independent `apply-cycle-check` script validates a candidate, copies it and restarts sing-box itself. It verifies the environment but never calls the daemon's HTTP Apply endpoints. Unit tests replace the service and binary check, so neither level verifies the assembled HTTP → daemon → Store → sing-box/procd path. The existing CI integration job already creates a disposable OpenWrt target with the packaged daemon and sing-box.

The local Compose project has fixed names, ports and networks and can hold the owner's config. Separate source worktrees do not isolate it. Interruption tests therefore need a distinct execution boundary. In scope are confirmation, rejection, timeout rollback and daemon-lifetime recovery; physical power loss, target-filesystem behavior and production router access are outside it.

## Decision drivers

- Verify the real assembled protocol without product-only fault-injection flags.
- Preserve the independent environment check and ordinary host tests.
- Keep interruption timing reproducible and all external waits bounded.
- Protect the owner's bench and retain failure evidence before restoration.

## Considered options

1. **Integration-tagged Go tests on the CI host against its target. Chosen.** Reuses the standard-library HTTP client, transaction types and testing diagnostics. The real service stays under procd. A test-only init-script wrapper can synchronize an interruption at restart after the journal and config are durable. It costs a real confirmation-window wait and a Docker dependency in the tagged suite.
2. **Extend the shell environment check to call HTTP. Rejected.** Reuses the current script but couples its independent checks to a running daemon and needs a second set of HTTP/JSON assertions and timeout handling in shell.
3. **Keep unit tests and manual bench recovery checks only. Rejected.** Cheapest to maintain, but regressions in the assembled Apply path would continue to pass CI.

## Decision outcome

Add `apply_integration_test.go` at the daemon module root under `//go:build integration`. The CI host runs it against its already-created target. Both `CI=true` and `METABOX_EPHEMERAL_BENCH=1` are required; the suite checks the Compose target identity, standard config path, service and confirmation window before mutation. It refuses a pre-existing active transaction. Ordinary `make test` excludes it.

The suite sends real HTTP requests and compares persisted bytes, the sing-box runtime rule and panel reachability from LAN and guest clients. A restart during the confirmation window must restore that window. For a deterministic interruption, a temporary wrapper with the managed service's basename blocks its restart after the write. The daemon is stopped through its init script; the wrapper is released, the original init path restored, and a new daemon lifetime must replay the journal and restore the confirmed config. This is a graceful interrupted transaction, not a crash or power-loss simulation.

HTTP calls, Docker commands, readiness checks and phase polling have deadlines. Failure logs are collected before cleanup. Cleanup restores the original config and init-script setting, removes the test journal and wrapper, and starts the packaged services. No dependency, API, storage format or production code changes are needed.

## Consequences

### Positive

- CI verifies daemon wiring, real validation, persistence, service restart and recovery as one protocol.
- A restart barrier observes a specific durable boundary instead of racing a fast write.
- The owner's bench is excluded by default, and failed tests restore disposable fixtures.

### Negative

- The integration job waits through the real 60-second confirmation window.
- The harness knows the CI fixture's paths, Compose identity and fixed addresses; changes to that fixture need matching test updates.
- The test-only restart wrapper and cleanup add infrastructure code to maintain.

### Neutral or deferred

- The environment check remains independent of the daemon.
- Abrupt process death, interruption at every file-system syscall and physical power loss remain separate validation work. AC-14 and AC-29 are not marked complete by this suite.

## Risks and mitigations

| Risk                                       | Likelihood and impact            | Mitigation                                                                                          |
| ------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Running against an owner's Compose project | Low likelihood, high impact      | Explicit dual opt-in, target/fixture checks and CI-only invocation; no local Make target enables it |
| Interruption hangs the check               | Medium likelihood, medium impact | Real restart barrier, command deadlines, bounded polling and workflow/test timeouts                 |
| Cleanup hides the original failure         | Medium likelihood, medium impact | Collect diagnostics before cleanup; report restoration failures as test failures                    |

## Compatibility, migration and rollback

No product migration: only tests and CI change. Rollback removes the integration step and tagged test, leaving the independent shell check and existing unit tests intact.

## Validation

- `cd apps/metaboxd && go test -tags integration -run TestApplyHTTPOnEphemeralBench -v .` outside CI compiles the suite and skips before Docker access.
- A CI run without the disposable-bench opt-in fails before mutation.
- The `HTTP Apply integration` step runs the live scenarios with `-count=1`, then the existing reachability and dataplane checks must pass against the restored fixture.
- Ordinary daemon tests and `make lint` remain green; the tagged suite also receives explicit vet/lint validation.

## Links

- [PRD](../PRD.md): AC-13, AC-14, AC-22, AC-29.
- [Apply ownership and protocol](./ADR-0002-apply-protocol-and-config-ownership.md).
- [Bench base](./ADR-0023-build-the-bench-from-the-device-firmware.md).
- [HTTP integration test](../../apps/metaboxd/apply_integration_test.go).
- [CI integration job](../../.github/workflows/ci.yml).
- [Testing guide](../../apps/metaboxd/docs/guides/Testing.md).
