# Check the network path for a service

## Why

A user can see the outbound assigned to a rule in Simple Routes, but cannot tell from that row whether a connection actually used it. Network diagnostics are already on the product roadmap. [Issue #395](https://github.com/mderkach/metabox/issues/395) is the parent for the entry point in the v11 Routes design.

## What Changes

- Add the approved “Check route” action to applied service rules in Simple Routes. It opens the existing Diagnostics screen with the rule in context.
- Show the configured path, available observations, and explicit TCP/HTTPS, UDP/STUN and DNS measurements with their scope and limitations.
- Keep the isolated proxy-outage bench case recorded as an independent follow-up that can be picked up in parallel or in a later change.

## Capabilities

### New Capabilities

- `service-route-diagnostics`: contextual route checks and scoped network evidence for a service.

### Modified Capabilities

None.

## Impact

Simple Routes and Diagnostics use the existing daemon and panel integration. Reporting a configuration-level DNS and traffic-path mismatch and staging its repair stay in `dns-route-path-mismatch` (AC-125, [issue #392](https://github.com/mderkach/metabox/issues/392)).

## Out of Scope

- Changing routing, DNS or fallback policies, modifying drafts, or adding automatic repair to Diagnostics.
- Continuous monitoring, background recovery, and collecting browser-side measurements as part of the first release. Browser-side WebRTC observations can be added later using the same source distinction.
- Any new dataplane guarantee for a proxy outage. The follow-up in the task plan identifies when a separate delta is necessary.

## Open Questions

None. This proposal specifies the service workflow and does not move the full network-diagnostics roadmap item into the spec.
