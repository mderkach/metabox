## 1. Requirements

- [x] 1.1 AC-18, AC-69, AC-74, AC-10, AC-71, AC-53, AC-67: MODIFIED deltas state what the code and its tests do; each new scenario names a case a row of `docs/Verification.md` confirms. Verified by `pnpm spec:check`.
- [x] 1.2 AC-69, AC-74, AC-67: rows for the existing tests that confirm the new scenarios added to `docs/Verification.md`; the AC-67 manual row of the router switch removed. Verified by `make trace-check`.

## 2. Missing checks

- [x] 2.1 AC-74: the root file is not served with the owner's certificate pair, `TestRootCertificateIsNotServedWithTheOwnerPair` in `apps/metaboxd/internal/httpapi/tls_test.go`, with its row in `docs/Verification.md`. Verified by `make test`.
- [x] 2.2 AC-74: `https`, `https_cert` and `https_key` set in UCI reach the daemon flags through the init script, in `.github/scripts/package-smoke.sh`, with its row in `docs/Verification.md` and the description in `docs/Maintaining.md` and `docs/Maintaining.ru.md`. Verified by the CI job `package`.
