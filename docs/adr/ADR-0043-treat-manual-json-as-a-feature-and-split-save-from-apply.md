# ADR-0043. Keep manual JSON a first-class mode: do not lose data, let the binary judge validity, separate Save from Apply

- Status: Accepted. The decision was made on 2026-08-30 in section A.8 of [`../PRD.md`](../PRD.md) and moved here without changes in substance; the options are reconstructed from the interview answers, A.8 had no list of them
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.8 of [`../PRD.md`](../PRD.md)

## Context and problem statement

The first edition of the PRD kept manual JSON editing in Non-Goals. In interview `metabox-di-002` the owner turned it into a product feature: for rules and diagnostics text is often faster than a form (Round 4), and manually edited JSON should over time be laid out into forms, not necessarily right away.

The config gets two sources of truth: the text and the model with forms. It has to be decided which of them is primary when a construct the model does not understand is entered (Round 5), and whether drafts are needed (Round 6).

In scope: the rules that resolve the conflict between text and model, and the separation of saving from applying. Out of scope: how the text is edited on the client ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md)), which JSON dialect is read ([ADR-0017](./ADR-0017-read-the-config-in-the-dialect-the-binary-accepts.md)), the apply sequence ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)).

## Decision drivers

- User data is never lost (UX-3).
- The panel does not forbid what the binary accepts (UX-4); otherwise it becomes a brake on every fork release.
- A config the binary rejected does not go to the router (SM-4).
- An unfinished edit can be saved and returned to (UX-2).

## Considered options

Options 1–3 were named in the owner's answer in Round 5; the question itself listed no options. Option 4 is reconstructed from the wording of rule 2 in section A.8 ("not the metabox schema") and was not voiced in the interview; option 5 comes from Round 6. The transcript kept only the answers; the arguments are reconstructed from A.8.

1. **JSON is primary, the UI degrades.** The text is always right, the forms show what they can. By itself it does not say what to do with an invalid config on apply. **Rejected as the only rule**, became rule 1 of the synthesis.
2. **`sing-box check` decides.** The binary judges validity, the panel schema does not forbid what it accepts. By itself it does not say where to put an unfinished edit the binary does not accept yet. **Rejected as the only rule**, became rule 2 of the synthesis.
3. **Warn, but let through.** Warnings do not block work with the config. Extended to apply, up to Apply that bypasses `sing-box check`, it opens the way to a config the binary will not accept and to losing access to the router. **Rejected as the only rule**, became rule 3 of the synthesis: Save with warnings always lets through, Apply does not.
4. **The metabox schema decides**: what the schema does not know is not accepted. Contradicts UX-4: the schema lags behind the binary and would forbid a valid config. **Rejected.**
5. **"Saved = applied", no drafts.** An unfinished edit is either lost or goes to the router. **Rejected** in Round 6.
6. **A synthesis of options 1–3 with Save and Apply separated**: the owner's answer, "something in between 'JSON is primary, the UI degrades', 'sing-box check decides' and 'warn, but let through'". **Chosen.**

## Decision outcome

Manual JSON editing is a declared feature, not an escape hatch: raw mode is available on any node, plus there is a mode for editing the whole config as text. Three rules resolve the conflict between the two sources of truth:

1. **Data is not lost.** An unrecognized node is preserved as is and shown as a raw block marked "not covered by the UI".
2. **Validity is determined by `sing-box check`,** not by the metabox schema. The schema serves forms and hints but does not forbid what the binary accepts.
3. **Save ≠ Apply.** Save always saves the draft, with warnings; Apply requires a successful `check`. The binary's verdict cannot be bypassed: force-apply is absent on purpose.

The requirement "manually entered JSON is fully laid out into forms" is iterative: v1 lays out what it recognizes, completeness is built up over time.

### Scope and boundaries

- The whole-config text mode is AC-24, in-place text editing is [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), the dialect with comments and trailing commas is [ADR-0017](./ADR-0017-read-the-config-in-the-dialect-the-binary-accepts.md).
- The "not covered by the UI" raw block is AC-25, [ADR-0018](./ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md).
- Save and Apply are AC-26; `check` before the write is a step of the [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md) protocol.

## Consequences

### Positive

- A config the schema does not know can still be edited and applied if the binary accepts it.
- An error in an unfinished edit does not go to the router, and the edit itself is not lost.

### Negative

- The config has two representations, and the panel has to keep them consistent without losses; hence in-place text editing instead of rebuilding from the model.
- The owner can apply a config the schema considers suspicious: the binary has the last word.

### Neutral or deferred

- Raw mode on any node (AC-23) is not done yet: some nodes can only be edited through the text of the whole file.
- Full reverse parsing of manual JSON into forms is not a v1 goal (section 8 of the PRD).

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since the start of the project and is moved from the PRD without changes in substance.

## Validation

- AC-24 and AC-25: the corpus `apps/web/src/entities/Config/__tests__/corpus/` in `make test` and a run on the test bench.
- AC-26: the panel against the `make up` test bench: a draft is saved with a warning, Apply of a config that `sing-box check` rejected is refused with the binary's output.

## Links

- [`../PRD.md`](../PRD.md): US-8, AC-23…AC-26, UX-2…UX-4, SM-4, section 8, section A.8 (superseded by this ADR);
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), [ADR-0017](./ADR-0017-read-the-config-in-the-dialect-the-binary-accepts.md), [ADR-0018](./ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md), [ADR-0039](./ADR-0039-separate-the-ui-from-the-fork-schema-by-an-adapter-layer.md).
