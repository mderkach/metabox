# Proxy groups and server sources

## Context

Manual switching and diagnostic feedback already exist under AC-11. [ADR-0090](../../../docs/adr/ADR-0090-accumulate-traffic-per-outbound-and-latency-history-from-the-existing-polls.md) defines the latency history storage and calculation, and [AC-113](../../specs/proxies/spec.md#requirement-ac-113-each-servers-norm-is-edited-in-its-proxies-row) defines the compact editor and recalculation behavior.

## Design brief

**User question.** Where did my servers come from, which groups use them, and which group can I control myself?

Name the selection behavior and any known use in each group header. Selector groups show their selection control. Automatic groups show the current member, if available, and existing check and diagnosis feedback. The “Where servers come from” section distinguishes providers and manually added servers, with known group memberships or an explicit unavailable state. Keep current latency and relative-to-norm columns, with their compact phone layout and established states.

## Decisions

- Keep the display and switch capability separate. Selector groups use the existing switch operation. Other group types describe the configured behavior and retain the existing check action.
- Identify configured and observed references without inferring source or use from a tag prefix or missing telemetry alone. Resolve authoritative identities, configured and runtime distinctions, nested groups, incomplete data and proof of absence in technical design before implementation.
- Reuse the existing subscription update, compact norm control, comparison and REALITY feedback. Keep the relative-to-norm display and the existing history chart behavior.

## Risks and trade-offs

Providers can refresh and group memberships may change between config and runtime responses. A direct rule reference can use a server outside all groups. An absent reference is only meaningful once the chosen data sources can confirm it.
