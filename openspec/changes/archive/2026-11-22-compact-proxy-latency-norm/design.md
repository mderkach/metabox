# Compact latency norm editor

## Context

Build on the metadata behavior shipped in #472. Proxies already reads the daemon's metadata and latency samples. [ADR-0089](../../../docs/adr/ADR-0089-keep-outbound-labels-and-server-norms-in-the-daemon-state-and-rule-names-in-the-config.md) defines per-tag storage and the existing write operation. [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md) defines the history and computed norm.

## Design brief

**User question.** What delay is usual for this server, and how do I go back to automatic after setting my own norm?

Show the shared heading “Norm, ms · automatic by default” («Норма, мс · авто по умолчанию»). The norm cell has one number or a no-data reading and a pencil. Keep a second reserved space for the passive label “Custom norm” («Своя норма») and the distinct “Return to auto” button («Вернуть авто»). The space remains reserved in automatic mode, including at 320 px. The pencil becomes Save in the same slot. Keep the current delay and the neighboring columns visible while the field is being edited.

Use the shared InputGroup with an inline action on the end. Focus the field when editing starts and return focus to its action after save, Escape or reset. Preserve an unsaved input during a live sample update. Validate one integer from 1 to 10000 ms. Follow the existing design tokens for focus and error and provide 44 px touch targets. The field edits one norm per server.

## Decisions

- Keep the control in each editable runtime server row in Proxies and use the group heading for the norm label. The name remains a separate field. Group labels, selector selection and standalone node behavior keep their current interactions.
- Reuse the metadata write operation with the saved name and the changed norm for the same tag. Use the accepted metadata result immediately. Derive automatic display and the chart and comparison from the current computed norm and samples. An old effective norm may still describe the manual mode while latency data reloads.
- Show probe failures independently of the comparison with the norm.
- The active AC-104 scenarios describe the separate label editor and a label-only clear. AC-113 defines the norm editor and Return to auto. The completed Overview tasks record what shipped in #472.

## Risks and trade-offs

The permanently reserved action space costs width, especially on touch. It keeps the reset reachable and avoids a layout jump in either direction. Verify the row height, field size and position, action slot and neighboring columns at 320 and 375 px with touch and at 901, 1101, 2213 and 2711 px in both themes. Measure both outcomes of Return to auto, with a computed norm and with no data.

The existing daemon PUT replaces the full record for one tag. The panel serializes its own writes and reads the saved record immediately before a field-only edit. Concurrent writes for the same tag between that read and the PUT still follow the existing last-write-wins behavior. Atomic field updates across clients need a daemon contract change.
