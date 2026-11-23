# Simple Routes in v11

## Context

The panel edits a config document while the daemon owns validation, Apply, confirmation, and rollback. Simple adds a guided view of the current document. Editor and JSON remain the complete paths for imported or unsupported constructs.

## Design brief

**Question:** What should I set up first, where will this traffic go, and what will change if I apply this draft?

- Keep the approved v11 hierarchy of Interception, DNS, Outbounds, and Rules. Keep each routine operation at its point of use, including the empty editable configuration.
- Use nearby help for terms, an expandable explanation for rule order, compact contextual forms for edits, and the existing draft bar and version history. Preserve the user's place when a form closes.
- Show the real configuration and distinguish it from runtime observations, predictions, and unavailable data. A catalog service row reveals its source and known usage. The mock's examples and controls do not establish access to downloaded set contents or to features unsupported by the active core.
- Cover imported and empty configs, unavailable runtime data, invalid input, unsupported and ambiguous operations, and a failed validation or Apply. Use the shared responsive and accessible components in both languages and themes. Preserve keyboard operation, focus, and reduced-motion behavior.

The first delivery uses one dialog from Outbounds and the empty configuration. The dialog stages supported server links and links to manual subscription entry in Editor. The header adds the existing import action beside the view tabs and version history. The configuration path remains available in Editor and JSON. The subscription slice expands the same dialog after an eligible HTTPS address is entered. Keep the address masked and the notice beside it. Show the name, optional group, refresh interval, and request header in that order. Reveal custom controls in place and keep the original trigger and final focus.

## Goals / Non-Goals

- Let users complete common tasks in Simple and use other views when an edit needs advanced fields.
- Reuse the configuration document and runtime boundaries. Keep detection from #392, first-run setup, and full-schema editing in their existing scopes.
- Avoid a separate rule evaluator, parallel draft, or inferred core behavior.

## Decisions

1. **Projection and focused edits.** Use the shared configuration draft from all three views and reuse existing leaf edits, validation, editing controls, and Apply flow. Derive the numbered view from the actual draft rather than assigning its own rule positions. Editing a list view only changes the relevant document items. Separate draft ownership would make view switching and rollback inconsistent. See [ADR-0002](../../../docs/adr/ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0004](../../../docs/adr/ADR-0004-edit-config-text-in-place-on-the-client.md), and [ADR-0053](../../../docs/adr/ADR-0053-write-form-and-json-edits-to-the-draft-as-they-are-typed.md).
2. **Proven data in context.** Reuse the catalog and rule set metadata for the service disclosure. Link supported rule and device identities to the existing inventories. Reordering can prove positions and simple overlaps. A full evaluation of imported rules would diverge from what the core actually does, so unsupported or unknown overlap is explained rather than represented as a prediction. See [ADR-0007](../../../docs/adr/ADR-0007-explain-route-without-own-rule-evaluator.md).
3. **Catalog route and DNS pair.** Treat the pair as one draft operation, and show both changes in the diff. Use only a verified mapping for the selected path and resolver. The technical design task must verify eligible resolver selection for direct traffic, proxy traffic, and a particular outbound, and settle behavior for compatible existing rules, imported conflicts, and a missing eligible resolver. Until a safe mapping is proven, leave the draft untouched and explain the blocker. Keep unrelated and imported DNS rules outside the operation.
4. **Capability-gated DNS and interception.** Treat resolver inventory, per-path assignments, and fallback ordering as different operations. Validate edits against the existing schema and what the active core can use. Preserve imported representations unless a lossless edit is supported. Device selection uses the managed dataplane contract. Application proxy and advanced inbound settings are distinct and get only verified, supported actions. See [ADR-0047](../../../docs/adr/ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md).
5. **One import flow with explicit review.** Reuse the server parser and subscription validation and check the draft before offering group choices. A recognized type opens its fields in the same form. An eligible HTTPS URL with unknown contents opens the subscription fields with an unverified-link notice. It remains in the form until the user explicitly stages or cancels it. Other ambiguous links and duplicates stay in that context. Allow the regular add action for a matching subscription URL when the provider tag is unique across the configuration and draft. Each subscription retains independent settings, and the User-Agent may match. An optional same-address notice can link to the existing entry without changing the primary action. Reject a conflicting tag in the form and retain the entered values. Reuse the shared cache-tag validation tracked in [#379](https://github.com/mderkach/metabox/issues/379) for collisions with rule sets and endpoints. Credentials must stay out of warnings and previews beyond the protected editable field. The existing Apply flow owns validation and network effects. This avoids hidden changes triggered by pasting a link.
6. **Shared presentation patterns.** Use existing help popovers, disclosures, dialogs or sheets, the draft bar, and the current focus and transition contracts. Use the same pointer and keyboard behavior for sequential fallback and rule ordering. Apply patterns to actual layouts instead of duplicating the prototype scaffolding. See [ADR-0026](../../../docs/adr/ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md), [ADR-0049](../../../docs/adr/ADR-0049-slide-side-panels-and-float-the-apply-bar-with-css-transitions.md), and [ADR-0078](../../../docs/adr/ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md).

The supported fork accepts explicit provider lists in selector and URL test groups. Simple can append to one eligible group or create a manual-choice group. A group configured to use all subscriptions includes the new one automatically. Simple accepts refresh intervals from one minute up to the duration format limit, and editable User-Agent values without ASCII control characters.

## Risks / Trade-offs

- A simple control may hide a more complex imported configuration. Keep unsupported items visible as such and verify that edits to supported fields preserve the rest of the document.
- A draft outbound obtained from a subscription may not yet exist at runtime. Show its staged status and let the existing Apply verification establish the result.
- Pairing a catalog route with DNS could alter traffic outside the new rule if mapped incorrectly. Stage the pair only after proving the mapping, preserve existing unrelated rules, and verify that the diff and Apply cover both parts.
- A manual proxy address can be misread as already reachable. Distinguish configured state and observed evidence and leave unsupported editing unavailable.

## Migration Plan

No data migration. Existing drafts and imported configs remain valid in Editor and JSON. Enable Simple writes only for each verified supported capability and retain the existing draft validation, Apply, and rollback flow.

## Open Questions

See the proposal for the unresolved choices on lossless DNS mapping, application proxy support, and ambiguous imports. The draft specifies only the common safe behavior while those choices remain open.
