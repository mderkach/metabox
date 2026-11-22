# Edit routing rules in place

## Why

The Routes Editor keeps a rule and its order visible while the operator edits it. The current side panel and phone sheet separate the rule from its row. This change carries the approved desktop and phone interaction into the Editor under [#395](https://github.com/mderkach/metabox/issues/395), [#251](https://github.com/mderkach/metabox/issues/251) and [#346](https://github.com/mderkach/metabox/issues/346).

## What changes

- Open the rule editor immediately below its row at both desktop and phone widths.
- Offer the schema Form and the rule's JSON in that expansion, with a route to the corresponding rule in the whole-config JSON editor.
- Preserve the list context, draft and existing Apply contract across these views.

## Capabilities

### Modified capabilities

- `routing-rules` gains AC-120 for the Routes Editor's row disclosure, its draft views and its whole-config link.

## Impact

The rule list and its editor share responsibility for row expansion, focus return and measuring expanded content. A Routes-specific ADR must supersede the placement and motion portions of ADR-0037 and ADR-0049 for this interaction before implementation.

## Out of scope

- The Simple mode and routing-rule creation entry points.
- Editor placement on Connections, Rule Sets and generic config sections.
- The whole-config JSON format, secret visibility under AC-24 and AC-66, and any future masked-editor design.
- Detection or repair of route and DNS mismatches in [#392](https://github.com/mderkach/metabox/issues/392).

## Open questions

None within this scope.
