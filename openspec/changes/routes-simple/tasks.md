# Tasks

## 1. Simple view and shared draft

- [ ] 1.1 AC-115. Connect Simple, Editor, and JSON to one draft. Verify view switching, the four sections, and continued access to the existing draft diff and Apply. Add component and browser checks and their rows in `docs/Verification.md`. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` on the mock stand, and `pnpm --filter web check:design`. Record independent Impeccable critique.
- [ ] 1.2 AC-115. Connect contextual forms, the empty editable configuration, short help, the expandable route explanation, and version history to the existing controls. Test context and focus return, staged outbounds, and cancellation on the mock stand. Add verification rows and run `pnpm --filter web test:e2e` and `pnpm --filter web check:design`. Record independent Impeccable critique.

## 2. Rules and catalog addition

- [ ] 2.1 AC-116. Implement the filtered and ordered views, supported service and custom rule forms, device exception placement, and catalog source and usage disclosure. Cover deep links, effective positions, preservation of advanced rules, proven overlap, and unknown overlap. Add verification rows, run `pnpm --filter web test`, `pnpm --filter web test:e2e` on the mock stand, and `pnpm --filter web check:design`. Record independent Impeccable critique.
- [ ] 2.2 AC-116 and AC-117. Record and validate the rule-to-DNS mapping for direct, proxied, and outbound-specific scopes with schema fixtures and supported core validation on the disposable stand. Cover a compatible existing rule, an incompatible imported rule, and no eligible resolver. Define which pairs can be staged without modifying unrelated rules or inventing fallback behavior. Add verification rows for the mapping and run `make trace-check`.
- [ ] 2.3 AC-116. Wire catalog addition to stage the verified route and DNS pair together and show both edits in the diff. Verify blocked mappings leave the draft intact, including unsupported imported cases. Add component and browser checks with verification rows. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` on the mock stand, and `pnpm --filter web check:design`. Record independent Impeccable critique.

## 3. DNS and interception

- [ ] 3.1 AC-117. Implement the resolver inventory and supported per-path assignments once the mapping in 2.2 is verified. Cover unassigned entries, reassignment, confirmed diagnostics from #392 when available, and imported settings preservation. Add checks and verification rows. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` on the mock stand, and `pnpm --filter web check:design`. Record independent Impeccable critique.
- [ ] 3.2 AC-117. Add supported sequential backup ordering, IPv6 options, and static DNS entries. Verify editable sequential chains, unavailable editing, and lossless preservation of imported strategies. Add component and browser checks and verification rows. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` on the mock stand, and `pnpm --filter web check:design`. Record independent Impeccable critique.
- [ ] 3.3 AC-118. Connect the managed device selection and read-only or verified application proxy states to the existing dataplane. Cover explicit all-device and selected-device scope, unsupported and imported states, and preservation of unrelated settings. Exercise confirmation and rollback on the disposable stand. Add verification rows and run `pnpm --filter web test`, `pnpm --filter web test:e2e`, and `pnpm --filter web check:design`. Record independent Impeccable critique.

## 4. Connection import

- [ ] 4.1 AC-119. Connect the shared server and subscription flow to the draft. Cover recognized and invalid links, warnings without credentials, ambiguous and duplicate input, supported grouping, refresh, and User-Agent options. Verify no fetch is triggered by staging a subscription. Add component and browser checks and verification rows. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` on the mock stand, and `pnpm --filter web check:design`. Record independent Impeccable critique.

## 5. Integrated verification and documentation

- [ ] 5.1 AC-115 through AC-119. Verify the complete Simple workflow at a narrow and desktop width, in both themes, including keyboard operation, reduced motion, shared draft, failed validation, and existing confirmation and rollback. Run `pnpm --filter web test:e2e` on the mock stand and `make trace-check`. Record the integration results and corresponding verification rows.
- [ ] 5.2 AC-115 through AC-119. Update the English and Russian user documentation and refresh the corresponding derived Russian spec through its normal generation workflow. Run `pnpm spec:check` and `make trace-check` to verify the final docs and requirement references.
