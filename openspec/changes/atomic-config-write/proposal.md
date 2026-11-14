## Why

A power cut during a write must not leave the router without a readable config. The write sequence is built and unit-tested; it has never been interrupted on the target file system.

Issue: #237.

## What Changes

- On the device, record how the root is mounted (`mount`, overlay or not) for the directory that holds the config.
- Interrupt the write for real: kill the daemon process during writes in a loop on the test bench, and cut the power during Apply on the device several times. After each start the config parses, is not empty and equals the old or the new version.
- Record the result in the Validation of `docs/adr/ADR-0002-apply-protocol-and-config-ownership.md` and in `apps/metaboxd/docs/guides/DeviceIO.md`.
- Add the AC-29 rows to `docs/Verification.md`.
- If a file is lost or half-written: fix `writeAtomic` and keep this change open.

## Capabilities

### Modified Capabilities

- `apply`: AC-29.

## Impact

- The device: a manual run with power cuts; the state before the run is kept off the router.
- `docs/Verification.md`, `docs/adr/ADR-0002-apply-protocol-and-config-ownership.md`, `apps/metaboxd/docs/guides/DeviceIO.md`.
- `apps/metaboxd/internal/config`: a kill-during-write test; `atomic.go` only if the run finds a defect.

## Already built

The code is complete as far as it can be checked without the device; issue #237 is the missing check.

- `writeAtomic` in `apps/metaboxd/internal/config/atomic.go`: a temporary file in the destination directory, `fsync` of the data, `rename`, `fsync` of the directory. The config, the version history and the list files go through it (`config.go`, `version.go`, `lists.go` of the same package).
- The plain `WriteFile` calls in `config.go` (`StageCandidate`, `stageLists`) write the candidate copy that `sing-box check` reads, not the live config.
- Unit tests, listed under NFR-3 in `docs/Verification.md`: `TestWriteAtomicLeavesNoLeftovers`, `TestWriteAtomicSetsPerm`, `TestSyncDir` (`atomic_test.go`), `TestFailedWriteKeepsFileIntact` (`config_test.go`). They check the result of a write, not a write that is cut.
- `TestHTTPApplyInterruptedAtEveryStep` (`apps/metaboxd/internal/apply/http_test.go`) stops the daemon between the steps of an Apply, not in the middle of a file write.
- `docs/Verification.md` already has a manual NFR-3 row for the power cut on a test device; no record says it was run. ADR-0002 lists directory `fsync` on OpenWrt overlayfs as an open risk.

## Out of scope

- NFR-3 (the write sequence itself): built, in `openspec/specs/non-functional/spec.md`.
- AC-14 (`openspec/changes/rollback-of-a-breaking-config/`): what the daemon does after the boot with a transaction left open.
- Service files of the daemon other than the config, its versions and lists (sessions, certificates): not named by AC-29.
- The UCI section of the dataplane: written by `uci`, not by `writeAtomic`.

## Open questions

- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- AC-29 and NFR-3 state the same property, and NFR-3 is recorded as built with the same manual check not run. Keep both, or fold AC-29 into NFR-3 once the device run is done?
- How many power cuts are enough to tick the criterion, and on which root layout: the owner's device only, or also a device with `/etc` on overlayfs over squashfs?
- The device run cuts the power of the router that routes the home network; it needs the owner's go-ahead and a time.
