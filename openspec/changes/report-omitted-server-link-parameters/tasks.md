# Tasks

## 1. Import

- [ ] 1.1 AC-111. Add parser regression tests before changing the result. Verify that a VLESS REALITY link yields its mapped fields and the names of omitted parameters. Cover parameters handled by the selected transport or security mode, recognized format syntax, a single omission, and repeated percent-encoded names. Verify with `pnpm --filter web test` and add the corresponding rows to `docs/Verification.md`.
- [ ] 1.2 AC-111. Add a form regression test and implement the inline advisory in English and Russian. Paste a link, verify the names appear without values, add the server, and inspect the draft. Replace the link to check that stale warnings clear and that validation and the subscription hint still work. Verify with `pnpm --filter web test` and `pnpm --filter web check:design`. Add the form scenarios to `docs/Verification.md`.
- [ ] 1.3 AC-111. Update the English and Russian user docs on adding a server from a link. Verify both versions describe the warning and what is added to the draft. The repository does not store a derived Russian translation for the config editor spec.

## 2. Integration

- [ ] 2.1 AC-111. Verify the mock-stand form at desktop width and 375 px in both languages. Use the keyboard to paste and import, and check that long names wrap without horizontal overflow. Record the results and an independent Impeccable critique on the pull request. Run `pnpm --filter web test`, `pnpm --filter web check:design`, strict OpenSpec validation, and `make trace-check`.

## Workflow follow-up

- Synchronize and archive the change after the checks pass. Validate the config editor spec strictly and rerun `make trace-check`.
