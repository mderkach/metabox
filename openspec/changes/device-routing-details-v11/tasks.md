# Tasks

## 1. Technical design

- [ ] 1.1 AC-121 and AC-122. Resolve the shared device-match predicate for the detail and the Routes facet in #327, including overlapping, inverted, mixed and unknown source conditions. Define route provenance and a bounded interface for connection details, and record an ADR if a new cross-layer contract is needed. Resolve the proposal's open question before code. Verify references with `make trace-check` and validate the updated OpenSpec change in strict mode.

## 2. Product behavior

- [ ] 2.1 AC-121. Add the device row disclosure, associated rules, connection route summary and link to the full Connections view. Cover loading, confirmed empty and unavailable states, keyboard focus return and unchanged device-name precedence. Add scenario checks to `docs/Verification.md`. Verify with `pnpm --filter web test` and `pnpm --filter web test:e2e`.
- [ ] 2.2 AC-122. Open the existing Simple Routes form from the device detail with the device selected. Verify address warning, draft staging, no live Apply on submit and no changes on cancellation. Add scenario checks to `docs/Verification.md`. Verify with `pnpm --filter web test` and `pnpm --filter web test:e2e`.

## 3. Acceptance and documentation

- [ ] 3.1 AC-121 and AC-122. Check expansion, navigation and draft staging on desktop and phone in both themes and with reduced motion. Run `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 3.2 AC-121 and AC-122. Update English and Russian user documentation and the derived Russian specification. Verify with strict OpenSpec validation and `make trace-check`.
