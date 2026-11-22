# Inline Routes rule editor

## Context

The existing rule editor uses a panel at desktop widths and a bottom sheet on phones. [ADR-0037](../../../docs/adr/ADR-0037-edit-nodes-in-a-panel-beside-the-list.md) defines that placement, and [ADR-0049](../../../docs/adr/ADR-0049-slide-side-panels-and-float-the-apply-bar-with-css-transitions.md) defines their motion. Both ADRs also apply to surfaces outside this change.

## Design brief

**User question.** Which rule am I changing, and where does it sit in the evaluation order?

Keep the numbered rule row, its conditions and its action in the list. Open a detail region directly beneath it. Show Form, JSON and a link to the rule in the whole-config editor. Use the same disclosure on phones, with the content stacked at narrow widths. The row has collapsed and expanded states, and the editor retains the current form, raw-only and validation states. The shared draft bar remains available. The expansion follows the panel transition guidance and remains operable with reduced motion.

## Goals and non-goals

Keep the rule and its neighboring order discoverable while editing, retain filtering and scroll position, and preserve touch and keyboard access. Keep the current parser, schema renderer and draft ownership, and limit the placement change to editing rules in the Routes Editor.

## Decisions

- Use the existing Form and raw rule editor inside the rule expansion. Keep the same canonical draft identity in both views and resolve the whole-config link from the current document. Keep the current whole-config raw-text and secret behavior.
- Integrate the expansion with row measurement, stable rule identity and focus return. Opening changes the selected row's height, while filter, ordering and list width remain independent of the disclosure. An unsupported rule keeps its existing raw-only path.
- Record a new ADR before implementation that supersedes the rule-editor placement and its associated motion in ADR-0037 and ADR-0049 solely for this Routes interaction. Keep their remaining decisions and the floating Apply bar in effect. Use the existing [panel transition guidance](../../../apps/web/docs/guides/Architecture&Style.md#transition-animation) for disclosure motion.

## Risks and trade-offs

Inline forms change measured row height and can lose focus if the list recycles the active item. Prove row identity, draft retention, keyboard focus and scroll anchoring in a long filtered list on both widths. When a filter, removal or reorder eliminates the opener, focus must land on an available list control.
