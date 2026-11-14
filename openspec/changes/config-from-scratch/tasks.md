## 1. Scenario

- [x] 1.1 AC-6: the add form and the node form build a VLESS/Reality outbound in an empty document and the schema accepts it. Evidence: `ConfigNodeForm.overrides.test.tsx`, `a node from the add form and the node form with a rule passes the config schema`; `pnpm --filter web test`.
- [x] 1.2 AC-6: the daemon applies a first config when none is in place and adds `experimental.clash_api`. Evidence: `TestBackupWithoutConfigContinues`, `TestClashAPIIsGuaranteed`; `make test`.
- [ ] 1.3 AC-6: write the content of the scenario (inbounds, `dns`, outbounds, rules, `route.final`) into `design.md` after the owner answers the open questions. Verify: manual: the owner approves the list.

## 2. Panel

- [ ] 2.1 AC-6: when the daemon answers `config_missing`, the Editor offers to start an empty draft instead of the load failure only. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it. Skipped if the owner gives this entry to the first-run wizard.
- [ ] 2.2 AC-6: extend the from-scratch test so that the rule is added through the rule form, not through `ConfigDocumentState.insert`, and the document matches the scenario from 1.3. Verify: `pnpm --filter web test`.

## 3. Check on the test bench

- [ ] 3.1 AC-6: a `@live` Playwright scenario builds the config from an empty one through the forms, applies it and sees the Apply pass `sing-box check` with no edit in the JSON view. Verify: `pnpm --filter web test:e2e --grep @live` on `make up`.
- [ ] 3.2 AC-6: add the rows of 2.2 and 3.1 to `docs/Verification.md`. Verify: `make trace-check`.

## 4. Documentation

- [ ] 4.1 AC-6: if 2.1 is done, describe the start without a config in the user documentation in English and Russian and update the derived Russian translation of the `config-editor` spec. Verify: manual: both language copies say the same.
