# Tasks

## 1. Daemon

- [x] 1.1 Add the AC-68 routing setup check to the shared report and verify success, named failures, and skipped cases with `make test`. Add verification links in `docs/Verification.md`.

## 2. Panel and bench

- [x] 2.1 Localize the AC-68 row and update the mock scenario, frontend test, and verification links. Run `pnpm --filter web test`, `pnpm --filter web check:design`, and an independent Impeccable critique on the mock stand at desktop width and 375 px.
- [x] 2.2 Add a disposable OpenWrt bench scenario that removes the local route, checks the reported result, and restores the route. Verify the HTTP and MCP paths and link the checks in `docs/Verification.md`.
- [x] 2.3 Update the English and Russian documentation for AC-68 and run `pnpm spec:check` and `make trace-check`.

## Verification so far

The Diagnostics component tests, frontend build, design detector, Go race checks for the affected packages, integration test compilation, and specification checks passed. Independent mock-stand review covered 1280 px and 375 px. The full local test run passed. The disposable OpenWrt test passed over HTTP and MCP in [the PR integration run](https://github.com/mderkach/metabox/actions/runs/45046294925/job/137281533430).

## Workflow follow-up

- Synchronize the delta, archive the change, and verify the canonical spec.
