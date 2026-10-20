# ADR-0053. Write form and JSON edits to the draft as they are typed

- Status: Proposed
- Date: 2026-10-20
- Deciders: repository owner

## Context and problem statement

[ADR-0043](./ADR-0043-treat-manual-json-as-a-feature-and-split-save-from-apply.md) separates the draft from the running config: Save puts an edit into the draft, Apply sends the draft to the router after `sing-box check`. Until now the panel had a third step inside the client: node, rule and rule set forms held the edit in form state until the user pressed «Сохранить в черновик» (save to draft).

The UI review of October 2026 found the cost of that step. The save button sat in the side panel, Apply sat in the floating bar at the bottom. Closing the panel or switching a node dropped the unsaved edit silently. The draft bar showed "no changes" while the form was full of them. A new rule was written to the draft at the moment «Добавить правило» (add rule) was pressed, before it had a condition, so an empty rule reached the draft and, after the catch-all, the list.

In scope: when an edit in a node form, a rule form, a rule set form or a node JSON editor reaches the document in `ConfigDocumentState`, and how removals and new rules are written. Out of scope: how the text is patched ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md)), how the draft is saved on the daemon and applied ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)), side panel layout ([ADR-0037](./ADR-0037-edit-nodes-in-a-panel-beside-the-list.md)).

## Decision drivers

- Nothing the user typed is lost by closing a panel or switching a node.
- One place for "what is pending": the draft bar and the apply summary show every edit.
- The original text of the config stays as written: key order, comments and formatting are not disturbed by typing ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md)).
- An edit that came from outside (discard, reload, a write from another form) is not overwritten by a form that has stale values.
- A half-filled new rule does not change routing.

## Considered options

1. **Keep the explicit «Сохранить в черновик» button.** Familiar form semantics and one write per save. Edits are lost on close, the draft bar lies about pending changes, and two save-like actions in different corners of the screen are the confusion the review named. **Rejected.**
2. **Write on blur of each field.** Fewer writes than per change. A blur write resolves after the next change has started and takes it along; closing the panel with the keyboard or a click on the list may unmount the form before blur is handled; a select or a checkbox has no meaningful blur. **Rejected.**
3. **Write on change with a debounce.** Fewer writes during fast typing. The pending window loses the last edit on unmount unless flushed, and a flush on unmount has the same race with external replacement as option 2. The draft bar lags behind what is on screen. **Rejected**: it trades a lost or racing last edit for fewer writes, and the cost of a write was not observed to be a problem; if a measurement shows otherwise, this ADR is revisited.
4. **Write every user change at once, defer only key removal.** **Chosen.**

## Decision outcome

Forms and JSON editors have no save step. The rules below are mandatory for any form that edits the config document.

1. A form is wired through `useWriteOnChange` (`apps/web/src/shared/lib/useWriteOnChange.ts`). It writes on react-hook-form `watch` events with `type === 'change'` only. A reset from `values` calls `setValue` on untouched fields, and writing those would overwrite an edit that came from outside.
2. A field emptied while a text field has focus does not remove its key at once: the write is made without removals, and the removal is written when focus leaves the form. Otherwise retyping the value would move the key to the end of its object.
3. A removal still held back at unmount is written then, unless the document was replaced from outside since the form opened (the revision counter of `ConfigDocumentState` changed). Discard and reload are never undone by a closing form.
4. A form writes only the keys it owns: the diff against the current node is limited to the form's fields, so a section form does not delete lists it does not show.
5. A new rule is not written until it has a condition or a rule set. Until then the panel shows a row built by `toNewRuleRow`; closing it writes nothing. The rule is inserted before the first unconditional rule that ends the list (to an outbound or `reject`), see `newRulePlace` in `apps/web/src/entities/Rule/model/Rule.model.ts`.
6. The node JSON editor (`ConfigNodeRawEditor`) writes each edit that parses and differs from the node in the document; a parse error stops the write and is shown at its line. Validity beyond parsing is left to `sing-box check` ([ADR-0043](./ADR-0043-treat-manual-json-as-a-feature-and-split-save-from-apply.md)).

Non-goals: undo history inside a form (discard of the whole draft stays the way back); writing to the daemon on every change (the draft on the daemon is saved by its own flow).

### Scope and boundaries

`ConfigNodeForm`, `RuleEditForm`, `RuleSetEditForm`, `ConfigNodeRawEditor` and the rule raw editor in `apps/web/src`. The «Готово» (done) button of the rule set form only closes the panel; it does not write.

## Consequences

### Positive

- Closing a panel or switching a node keeps what was typed.
- The draft bar and the apply summary list every edit as it happens.
- One action left for the user: Apply.

### Negative

- Every keystroke patches the document text and re-parses it. Its cost was not measured; a large config may need a profile.
- The write rules (change events only, deferred removal, revision guard, owned keys) are subtle. A new form that bypasses `useWriteOnChange` can reintroduce key reordering or overwrite an external edit.
- A mistyped value reaches the draft immediately; it is only taken back by editing it again or by discarding the draft.

### Neutral or deferred

- The draft on the daemon is still saved by its own flow; this ADR does not change when the daemon sees the draft.

## Risks and mitigations

| Risk                                                    | Likelihood and impact                        | Mitigation                                                                                                                      |
| ------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A form writes stale values over a discard or reload     | Low; would silently restore discarded edits  | Revision guard on the unmount write; `useWriteOnChange.test.tsx` covers an unmount after replacement                            |
| A key moves to the end of its object after clear-retype | Medium for new forms; noisy diff in the file | Deferred removal in `useWriteOnChange`; `useWriteOnChange.test.tsx` checks that no removal is written while the field has focus |
| An empty new rule lands after the catch-all             | Low after this change; changes routing       | Deferred creation; tests on create at first condition, close without write, place before reject                                 |

## Compatibility, migration and rollback

Not applicable for data: the document format and the daemon contract do not change. Rollback is a revert of the frontend commits that introduced `useWriteOnChange` and deferred rule creation; the save buttons come back with them.

## Validation

- `pnpm --filter web test`: `useWriteOnChange.test.tsx` (write per change, removal held back until focus leaves, no unmount write after replacement); `EditorPage.test.tsx` (a new rule is written at its first condition, closing it without one leaves the draft untouched); `Rule.model.test.ts` (place before an unconditional `reject`). Key position after clear and retype in the file text is not covered by a test.
- `pnpm lint` and `pnpm --filter web exec tsc -b` pass.
- Manual: open a node, change a field, close the panel; the draft bar shows the change. Add a rule, close it without a condition; the draft does not change.

## Links

- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), [ADR-0037](./ADR-0037-edit-nodes-in-a-panel-beside-the-list.md), [ADR-0043](./ADR-0043-treat-manual-json-as-a-feature-and-split-save-from-apply.md);
- `apps/web/src/shared/lib/useWriteOnChange.ts`;
- `apps/web/src/features/Rule/RuleEdit/model/RuleEdit.model.ts`;
- `apps/web/src/entities/Rule/model/Rule.model.ts`;
- `apps/web/src/features/Config/ConfigNodeRaw/ui/ConfigNodeRawEditor.tsx`.
