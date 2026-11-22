# Tasks

## 1. Technical design

- [ ] 1.1 AC-124. Define the server source and group reference resolver, including provider refresh, duplicate or renamed tags, nested groups, incomplete runtime data and proof of absence. Resolve the proposal's open question and record an ADR if a new cross-layer contract is needed. Verify references with `make trace-check` and validate the updated OpenSpec change in strict mode.

## 2. Product behavior

- [ ] 2.1 AC-123. Present configured group behavior, retain manual selection for selectors and remove conversion or switch controls from automatic groups. Check both group types and retain the existing probe controls. Add scenario checks to `docs/Verification.md`. Verify with `pnpm --filter web test` and `pnpm --filter web test:e2e`.
- [ ] 2.2 AC-124. Add the source inventory, known memberships and configured group references with the accepted resolver. Check incomplete evidence and confirm that current latency, the compact norm editor and REALITY diagnosis still work. Add scenario checks to `docs/Verification.md`. Verify with `pnpm --filter web test` and `pnpm --filter web test:e2e`.

## 3. Acceptance and documentation

- [ ] 3.1 AC-123 and AC-124. Check group and source actions and reserved geometry on desktop and phone in both themes, including keyboard access. Run `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 3.2 AC-123 and AC-124. Update English and Russian user documentation and the derived Russian specification. Verify with strict OpenSpec validation and `make trace-check`.
