## Why

A user who starts without a config has to get a working one from the panel alone. The forms produce a document the schema accepts, but nothing runs `sing-box check` on it, and the panel has no way to start when the device has no config file.

Issue: none yet.

## What Changes

- Fix what the "VLESS/Reality + rule-based routing" scenario contains: which inbounds, `dns` and `route.final` it has besides the VLESS outbound and the rule (see Open questions).
- Let the Editor start a draft when the daemon answers `config_missing`; today it shows the load failure and a retry only.
- Build the scenario through the forms only, the rule included: the existing test inserts the rule through the store, not through the rule form.
- Add a check that sends the document built in the UI to Apply on the test bench and sees `sing-box check` pass.
- Add the AC-6 rows for these checks to `docs/Verification.md`.

## Capabilities

### Modified Capabilities

- `config-editor`: AC-6.

## Impact

- `apps/web/src/pages/Editor`, `apps/web/src/entities/Config`: a draft without a config on the device.
- `apps/web/src/features/Config/ConfigNodeAdd`, `ConfigNodeForm`, `apps/web/src/widgets/Rule`: only if the scenario shows a field the forms cannot set.
- `apps/web/e2e`: a `@live` scenario on the test bench (`integration` job of `.github/workflows/ci.yml`).
- `docs/Verification.md`, user documentation in English and Russian.
- The daemon is not expected to change.

## Already built

- Node forms: `apps/web/src/features/Config/ConfigNodeAdd/ui/ConfigNodeAddForm.tsx` adds a node by type, `ConfigNodeAddLink.tsx` adds one from a share link, `apps/web/src/features/Config/ConfigNodeForm/model/ConfigNodeForm.overrides.ts` holds the VLESS/Reality fields and their checks.
- Schema-level check: `ConfigNodeForm.overrides.test.tsx`, `a node from the add form and the node form with a rule passes the config schema`. It starts from `{}`, fills the VLESS/Reality node through the forms, inserts the rule through `ConfigDocumentState.insert` and parses the result with `ConfigSchema`. Its TSDoc says `sing-box check` does not run there.
- The daemon applies a first config when none is in place: `TestBackupWithoutConfigContinues` (`apps/metaboxd/internal/apply/cycle_test.go`), `TestReadMissingConfig`, `TestBackupWithoutConfigOrBackup` (`apps/metaboxd/internal/config/config_test.go`).
- Apply runs `sing-box check -D <candidate> -c <config>` on the candidate (`apps/metaboxd/internal/singbox/singbox.go`) and adds `experimental.clash_api` when it is missing (`TestClashAPIIsGuaranteed`, `apps/metaboxd/internal/apply/apply_test.go`).
- Not built: with no config file the Editor shows "there is no config on the device" and a retry (`EditorPage.test.tsx`, `a source failure shows the reason and a retry, not an empty list`). `.devcontainer/target/files/usr/bin/apply-cycle-check` starts from the bench config, not from an empty one.

## Out of scope

- AC-78, AC-79 (`openspec/changes/first-run-wizard/`, issue #236): the wizard that writes the first config with the dataplane inbounds and `experimental.clash_api`.
- AC-5 (every inbound and outbound type has a renderer) and AC-4 (invalid values are shown before Apply): built, in `openspec/specs/config-editor/spec.md`.
- AC-13 (Apply stops on a failed `sing-box check`): built, in `openspec/specs/apply/spec.md`.
- Other scenarios than VLESS/Reality with rule-based routing.

## Open questions

- No issue names this work; open one when it is scheduled.
- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- What is "an empty config": a missing file, or a file with `{}`? The existing test covers `{}` only; a missing file leaves the Editor on a load failure.
- What does the scenario contain? The document the test builds has one VLESS outbound and one rule, no inbound, no `dns` and no `direct` outbound. It may pass `sing-box check` and still route nothing.
- Does the entry from a missing config belong here or to the first-run wizard (AC-78)? If the wizard owns it, this change keeps only the check on the test bench.
