# Device routing details

## Context

[ADR-0048](../../../docs/adr/ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md) defines device labels and identity. [ADR-0007](../../../docs/adr/ADR-0007-explain-route-without-own-rule-evaluator.md) governs how the panel explains a route without predicting the core's decision. Keep the distinction between configured rules and observed connections.

## Design brief

**User question.** Which rules are specific to this device, where are its connections going, and how can I add a rule for it?

The existing row retains its name source, address, lease, network and interception controls. Its disclosure shows device-associated rules and a place to start the existing Simple rule flow. The open connection summary shows destination and available rule, outbound and server details. A link opens the full device-filtered Connections view. Show loading, loaded-empty and unavailable states separately. Keep the expansion usable on phones and show the same draft indicator throughout the add workflow.

## Decisions

- Reuse existing device labels, address selection and the AC-62 dynamic-lease warning. Clearing a custom label still falls back through static lease, DHCP and address under AC-59.
- Reuse the Simple Routes form, including validation and draft staging. The device action supplies the initial selection, retains a return to the device row and shares the existing Apply protocol.
- Resolve device-rule association and route explanation in a separate technical design before implementation. Define one predicate shared with the Routes device facet in #327, a bounded connection lookup, and the contract for unsupported, overlapping, inverted and unknown cases. Size any request or daemon API change against the existing Connections performance requirements.

## Risks and trade-offs

Using one request per visible connection can cause repeated lookups. A rule targeting several devices or a range can be associated without being exclusive. Preserve the accepted distinction established by the technical design and avoid classifying all other rules as applicable.
