# Tasks

## 1. Decision and implementation

- [ ] 1.1 AC-120. Use the create-adr skill to record the Routes-only supersession of the rule-editor placement and motion in ADR-0037 and ADR-0049. Preserve both decisions for other surfaces. Specify measured expanded row heights, stable identity and keyboard focus return. Verify the ADR format and references with `make trace-check`.
- [ ] 1.2 AC-120. Add the in-row Form and JSON editor to the Routes rule list on desktop and phone, using the current draft and validation. Keep the order, filters and scroll context, support keyboard expansion and closing, and send the whole-config link to the rule's current draft location. Add the new scenario evidence to `docs/Verification.md`. Verify cross-view edits, invalid input, lossless writes and the draft-versus-Apply boundary with `pnpm --filter web test`.

## 2. Browser acceptance and user documentation

- [ ] 2.1 AC-120. Exercise expansion, both views, the whole-config link, focus return and a long filtered list at desktop and phone widths in both themes, including reduced motion and the reserved draft bar. Verify with `pnpm --filter web test:e2e`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 2.2 AC-120. Document inline editing in English and Russian and refresh the derived Russian specification through the documentation workflow. Run strict OpenSpec validation and `make trace-check`.
