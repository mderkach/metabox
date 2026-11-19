## Why

A config that cuts the owner off must come back by itself: the router is the only way to the panel. The rollback is built and tested on fakes and on the test bench; it has not been tried on the device with a config that really breaks connectivity, and `docs/Verification.md` has no AC-14 row.

Issue: none yet.

## What Changes

- Add the AC-14 rows to `docs/Verification.md` for the checks that already exist (see Already built).
- Run the scenario on the device: apply a config known to break connectivity from the panel, do not confirm, see the previous config return and the panel answer again without SSH. Record it as a manual row.
- Run the same with a power cut inside the confirmation window: after the boot the previous config is in place.
- Update the Validation of `docs/adr/ADR-0002-apply-protocol-and-config-ownership.md`: it says the AC-14 checkbox waits for the UI, and the UI exists.

## Capabilities

### Modified Capabilities

- `apply`: AC-14.

## Impact

- `docs/Verification.md`, `docs/adr/ADR-0002-apply-protocol-and-config-ownership.md`.
- The device: a manual run through the panel, with the state before the run kept off the router.
- `apps/metaboxd/internal/apply`, `apps/web/src/features/Config/ConfigApply`: only if the device run finds a defect.

## Already built

One gap is known: issue #338 showed a rollback that restarts the service without checking it and reports the previous config restored while the core stays down, here because of a poisoned subscription entry in the sing-box cache file. The fix is the change [`recover-from-a-poisoned-subscription-cache`](../recover-from-a-poisoned-subscription-cache/proposal.md). Beyond it, what is missing is the device run and the Verification rows.

- The confirmation window: `Manager.await` in `apps/metaboxd/internal/apply/cycle.go` restores the previous config when no confirmation comes in time; a failed step after the write rolls back in `Manager.cycle`. Tests: `TestRollbackWithoutConfirmation` (`apply_test.go`), `TestHTTPApplyRollsBackByWindow` (`http_test.go`).
- A power cut or a daemon restart: the state is written to disk before the config and replayed at start (`Manager.Replay`). Tests: `TestHTTPApplyInterruptedAtEveryStep`, `TestHTTPApplyWindowAfterRestart` (`http_test.go`), `TestReplayRollsBackInterruptedApply`, `TestReplayRollsBackExpiredWindow`, `TestReplayRestoresLiveWindow` (`replay_test.go`).
- The healthcheck rolls back without waiting for the window when DNS through `dns-in` breaks, interception vanishes or the process is not new: AC-54 in `openspec/specs/dataplane/spec.md`, `TestBrokenDNSRollsBack`, `TestInterceptionCheck` (`probe_test.go`), `TestHealthcheckWaitsForNewProcess` (`cycle_test.go`).
- On the test bench with the real service: `TestApplyHTTPOnEphemeralBench` (`apps/metaboxd/apply_integration_test.go`) covers confirm, timeout, replay and an interrupted write; the `integration` job of `.github/workflows/ci.yml` runs it.
- The panel: `apps/web/src/features/Config/ConfigApply/ui/ConfigApplyConfirmWindow.tsx` shows the remainder and the confirm button. Tests in `ConfigApplyBar.test.tsx`: `in the confirmation window counts down the remainder and confirms by the button`, `shows the automatic rollback even without a draft: a version rollback does not create its own draft`.
- User documentation: `docs/Recovery.md`, section "What an Apply undoes on its own".
- Known limits, tested as such: a first apply has nothing to return to (`TestRollbackWithoutBackup`), a failed backup or journal stops the apply before the write (`TestBackupFailureSkipsRollback`, `TestJournalFailureSkipsRollback`).

## Out of scope

- AC-13 (Apply order and the stop on a failed `sing-box check`), AC-15 (version history and manual rollback), AC-16 (restart through procd): built, in `openspec/specs/apply/spec.md`.
- AC-53 (the same window for dataplane settings) and AC-54 (the healthcheck): built, in `openspec/specs/dataplane/spec.md`.
- A subscription update that drops most nodes (issue #254): a working config that got worse, not an Apply that cut access.
- A config changed by hand over SSH: `docs/Recovery.md` lists it as not covered by the automatic rollback.

## Open questions

- No issue names this work; open one when it is scheduled.
- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- Which config counts as "known to break connectivity" for the device run? A config that breaks the internet but leaves the panel reachable over LAN can still be confirmed by the user, and then nothing returns. Is that case inside AC-14 or only the one where the panel is lost?
- A first apply with no previous config cannot return anything. Does AC-14 need a sentence about it, or does `docs/Recovery.md` cover it?
- The device run needs the owner's go-ahead: it restarts the active sing-box on the router twice.
