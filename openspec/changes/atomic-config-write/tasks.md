## 1. Write sequence

- [x] 1.1 AC-29, NFR-3: the config is written through a temporary file, `fsync`, `rename` and a directory `fsync`, and a refused write keeps the old file. Evidence: `apps/metaboxd/internal/config/atomic.go`; `TestWriteAtomicLeavesNoLeftovers`, `TestSyncDir`, `TestFailedWriteKeepsFileIntact`; `make test`.

## 2. Interrupted process

- [ ] 2.1 AC-29: a Go test starts a helper process that writes the config in a loop, kills it with SIGKILL at random moments and checks after each kill that the file parses and equals one of the two versions and that leftover temporary files do not end with `.json`. Verify: `make test`.
- [ ] 2.2 AC-29: add the row of 2.1 to `docs/Verification.md` and the scenario "A killed process leaves a whole file" to the spec delta. Verify: `make trace-check`.

## 3. Power loss on the device

- [ ] 3.1 AC-29: manual: record `mount` output for the config directory on the device (overlay or not) in `apps/metaboxd/docs/guides/DeviceIO.md`.
- [ ] 3.2 AC-29: manual: with the owner's go-ahead, apply two alternating configs in a loop and cut the power during the write, the number of times agreed in Open questions; after each boot `config.json` parses, is not empty and equals the old or the new version. Keep the state before the run in `.omc/device/`, not on the router.
- [ ] 3.3 AC-29: write the result into the Validation of ADR-0002 and into `DeviceIO.md`; add the manual AC-29 row to `docs/Verification.md` with the date, the device and the root layout. Verify: `make trace-check`.
- [ ] 3.4 AC-29: if a file is lost, fix `writeAtomic`, repeat 3.2 and leave issue #237 open until it passes.
