# Service route diagnostics

## Context

The existing Diagnostics screen and daemon checks cover dataplane listeners, DNS, routing state, direct connectivity, and optional Clash API latency. The latency path records delay in the core, so it cannot be reused as a side-effect-free route measurement. Runtime connection snapshots already provide the point-in-time evidence available from the core, as described in [ADR-0006](../../../docs/adr/ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md).

## Design brief

- **User question.** Did this service use the route I assigned, and which device or probe provides that evidence?
- **Entry and hierarchy.** Follow the approved v11 design. Use an icon in the labeled “Check route” column on desktop, and show the icon and text beside the outbound on phones. Keep the action available in both rule orderings and when the list is filtered. Give it a service-specific accessible name and a tooltip on desktop hover and focus.
- **Diagnostics.** Open the existing screen with the applied rule selected. Show the configured path and matching live observations first. Put an explicit probe action next to a compact report with separate TCP/HTTPS, UDP/STUN and DNS results. Show the tested destination and source beside each result.
- **States.** Account for an unapplied or stale rule, no matching connections, running checks, partial results, and unavailable routes. Keep “unknown” visible at the relevant result. The current release can show core observations of a LAN device alongside router-originated probes. Browser-originated evidence needs a separate actual browser measurement.

## Decisions

- Resolve the rule in the applied revision from the contextual entry. Keep the editor's draft outside the diagnostic request. Scope observations to a provable rule match in the available runtime data and label their timestamps. If a saved target is stale, ask the user to reselect it rather than guessing from a rule index or service name.
- Keep per-protocol measurements and live observations distinct. A neutral reflector can establish the tested outbound's address while service-level attribution requires evidence that the service uses that path. UDP/STUN from the router and browser WebRTC answer different questions. The DNS row records exactly which resolver, WAN observation or DoH request produced it.
- Use explicit, bounded checks against known probe targets and keep the selected path binding for each measurement. A probe method that cannot bind to that path returns unknown. A direct comparison is an explicit separate path, so failure never converts a routed request into a direct request. Keep the existing Diagnostics and observation interfaces intact for callers that do not request this capability.
- Keep mismatch detection and draft repair in AC-125. A configuration finding and an active measurement can link to each other when they refer to the same rule and revision, while preserving their provenance.

## Risks and trade-offs

- The service's rule can match differently for another source device or destination. Report the selected rule and actual measurement origin and leave the unsupported scope unknown.
- No matching connection in a snapshot can reflect idle traffic or incomplete visibility. Show no observation and avoid inferring an outcome.
- Core support can differ by outbound and protocol. Unsupported paths remain usable as configured routes while the corresponding result is unknown.

## Verification

Use the mock-stand browser flow in [ADR-0075](../../../docs/adr/ADR-0075-run-end-to-end-scenarios-with-playwright-test-on-the-mock-stand-and-the-live-daemon.md) for the contextual transition and report states. Verify probe binding with controlled destinations and fixtures. The separate LAN proxy-outage case is recorded in the task plan.
