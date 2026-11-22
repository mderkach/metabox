# Tasks

## 1. Import

- [x] 1.1 AC-111. Add parser regression tests before changing the result. Verify that a VLESS REALITY link yields its mapped fields and the names of omitted parameters. Cover parameters handled by the selected transport or security mode, recognized format syntax, a single omission, repeated percent-encoded names, explicit true and false, and a schema without the hybrid key share field. Verify with `pnpm --filter web test` and add the corresponding rows to `docs/Verification.md`.
- [x] 1.2 AC-111. Add a form regression test and implement the inline advisory in English and Russian. Paste a link, verify the names appear without values, add the server, and inspect the draft. Replace the link to check that stale warnings clear and that validation and the subscription hint still work. Verify with `pnpm --filter web test` and `pnpm --filter web check:design`. Add the form scenarios to `docs/Verification.md`.
- [x] 1.3 AC-111. Update the English and Russian user docs on adding a server from a link. Verify both versions describe the warning and what is added to the draft. The repository does not store a derived Russian translation for the config editor spec.

## 2. Existing servers

- [x] 2.1 AC-112. Expose the hybrid key share setting in the VLESS REALITY form for supported cores. Verify the draft from editing an existing outbound, scope of eligible nodes, and unchanged applied config before Apply with `pnpm --filter web test`. Add verification rows.
- [x] 2.2 AC-11. Reuse the manual probe result and the matching applied config. Show guidance for an eligible existing outbound. Cover success after a previous failure, an unrelated or unsupported node, runtime request failure, and a draft that differs from the applied config with `pnpm --filter web test`. Add verification rows.
- [x] 2.3 AC-11 and AC-112. On the isolated OpenWrt and 3x-ui stand, check the failing node, follow the guidance, edit one field, apply, and repeat the same HTTPS request and node probe. Verify that the URL-test result agrees with the HTTPS request for this scenario. Record evidence in the pull request and document the flow in English and Russian.

## 3. Integration

- [x] 3.1 AC-11, AC-111 and AC-112. Verify the mock-stand form at desktop width and 375 px in both languages. Use the keyboard to paste and import, and check that long names wrap without horizontal overflow. Check opening the in-group or standalone disclosure and staging the setting from the manual probe failure guidance. Record the results and an independent Impeccable critique on the pull request. Run `pnpm --filter web test`, `pnpm --filter web check:design`, strict OpenSpec validation, and `make trace-check`.

## 4. Inline diagnostic follow-up

- [x] 4.1 AC-11. Verify that a failed manual probe can open the disclosure inside the checked group, that a duplicated node has only one disclosure, and that the control stays beside the status without changing the row height. Cover keyboard, desktop and 375 px.
- [x] 4.2 AC-11. Verify staging, confirmed same-node retest, no response and runtime error, safe inverse for absent and explicit false values, and rejection of a confirmation submitted elsewhere. Cover preserved draft changes and targeted return through the usual Apply flow.
- [x] 4.3 AC-11. Verify the real OpenWrt and 3x-ui recovery with the same HTTPS endpoint before and after Apply. Use a deliberately unavailable endpoint on the isolated stand to verify the real negative probe and the inverse draft. Exercise completed inverse Apply and daemon request errors on the mock stand.

## Workflow follow-up

- Synchronize and archive the change after the checks pass. Validate the config editor and proxies specs strictly and rerun `make trace-check`.
