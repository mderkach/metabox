## 1. Daemon and panel

- [x] 1.1 AC-14: an unconfirmed apply returns the previous config. Evidence: `TestRollbackWithoutConfirmation`, `TestHTTPApplyRollsBackByWindow`; `make test`.
- [x] 1.2 AC-14: the rollback survives a power cut or a daemon restart at any step and inside the window. Evidence: `TestHTTPApplyInterruptedAtEveryStep`, `TestHTTPApplyWindowAfterRestart`, `TestReplayRollsBackExpiredWindow`; `make test`.
- [x] 1.3 AC-14: the real service on the test bench returns the confirmed config after a timeout and after a daemon restart. Evidence: `TestApplyHTTPOnEphemeralBench`, `integration` job in CI.
- [x] 1.4 AC-14: the panel shows the window, the confirm button and the automatic rollback. Evidence: `ConfigApplyBar.test.tsx`, `in the confirmation window counts down the remainder and confirms by the button`, `shows the automatic rollback even without a draft: a version rollback does not create its own draft`; `pnpm --filter web test`.

## 2. Verification rows

- [ ] 2.1 AC-14: add the rows for the tests of 1.1–1.4 to `docs/Verification.md` and a scenario per row group to the spec delta. Verify: `make trace-check`.

## 3. Device run

- [ ] 3.1 AC-14: manual: on the router, with the owner's go-ahead, apply from the panel a config agreed as breaking (see Open questions), do not confirm; after the window the previous config is on disk, the service runs it and the panel answers, with no SSH used to repair. Save the state before the run to `.omc/device/`, not on the router.
- [ ] 3.2 AC-14: manual: repeat 3.1 and cut the power inside the window; after the boot the previous config is in place and the transaction reads `rolled_back`.
- [ ] 3.3 AC-14: add the two manual rows to `docs/Verification.md` and the result to the Validation of ADR-0002, replacing "unchecked until the UI appears". Verify: `make trace-check`.
- [ ] 3.4 AC-14: if 3.1 or 3.2 fails, open an issue with the label `bug` and keep this change open.

## 4. Documentation

- [ ] 4.1 AC-14: if the owner's answers change what the rollback covers, update "What an Apply undoes on its own" in `docs/Recovery.md` and `docs/Recovery.ru.md`. Verify: manual: both copies say the same.
