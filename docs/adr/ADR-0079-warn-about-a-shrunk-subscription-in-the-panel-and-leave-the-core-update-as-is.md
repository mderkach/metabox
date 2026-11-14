# ADR-0079. Warn about a shrunk subscription in the panel and leave the core update as is

- Status: Accepted
- Date: 2026-11-14
- Deciders: repository owner

## Context and problem statement

Subscriptions are the fork's `providers` with `type: remote`; the core fetches and replaces their node set itself, on `update_interval` and on a manual update from the panel through the Clash API (AC-64 in [`docs/PRD.md`](../PRD.md)). Issue #254 asked what the core does when a provider briefly serves a stub list.

Confirmed on the pinned fork `sing-box-extended v1.14.3-extended-2.7.3` (`provider/remote/provider.go`, `fetch` and `updateProviderFromOptions`) and pinned by a test against it:

- an empty or unparsable response is an error, the previous nodes stay;
- a response with one node replaces the whole set;
- a response whose nodes are all removed by `include` / `exclude` replaces the set with an empty one;
- with `store_subscriptions` the replaced set is written to the cache file, so a restart restores the shrunk set, not the last working one.

So a provider that serves an "expired" placeholder moves groups onto it and overwrites the working cache. In scope: where the product guards against this. Out of scope: the panel's design of the warning (it goes through the panel design gate, [ADR-0078](./ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md)) and thresholds for "suspiciously small".

## Decision drivers

- The core owns the update; the daemon does not model config contents and does not fetch subscriptions ([Architecture&Style](../../apps/metaboxd/docs/guides/Architecture&Style.md), "Boundaries").
- The fork is third-party: a patch depends on its maintainer and release cycle, a local patch means building and shipping our own fork.
- The owner sees what happened and can roll back.
- A fork update that changes the behaviour must not go unnoticed.

## Considered options

1. **Guard in the fork**: skip an update that leaves no nodes after the filter or shrinks the set below a threshold, keep the cache. Protects background updates too. Needs an upstream change or a maintained patch, a release and a package rebuild, and a justified threshold. **Rejected** by the owner: the dependency on the fork's maintainer outweighs the gain for now.
2. **Guard in the panel**: after an update the panel shows the previous and the new usable-node counts and warns on a sharp shrink. Background updates are not prevented, only made visible on the next look. **Chosen.**
3. **Keep the current approach**: nothing shows that a subscription collapsed until traffic stops. Rejected: the failure is silent.

## Decision outcome

- The core's update stays as the fork ships it; no fork patch, no daemon-side fetch.
- The panel shows the previous and the new node count of a provider after an update and warns when the set shrinks sharply or becomes empty. The warning's thresholds and design are set by the panel change through the design gate.
- `tools/schemagen/provider_test.go` runs the pinned fork with a stub subscription (3 nodes, then an empty response, then 1 node, then a restart from the cache) and pins the four outcomes above. It runs in `make test-schemagen`, so a fork bump that changes them fails there and sends this decision back for review.

## Consequences

### Positive

- The collapse of a subscription is visible in the panel instead of silent.
- A fork update that starts guarding by itself, or changes the cache behaviour, is caught by a test, not by a router without internet.

### Negative

- A background update can still move groups onto a stub and overwrite the cache; the owner learns about it only when opening the panel.
- The schema generator module now holds a runtime test of the core: it starts a core instance, not only reflects types.

### Neutral or deferred

- A guard in the core (option 1) stays possible later; this ADR is then superseded.

## Compatibility, migration and rollback

Not applicable: no stored data or contract changes. The test is removed together with this decision.

## Validation

- `make test-schemagen`: `TestRemoteProviderReplacesSetWithShrunkUpdate` in `tools/schemagen/provider_test.go` passes on the pinned fork.
- The panel change for the counts and the warning names its own checks.

## Links

- [`docs/PRD.md`](../PRD.md), AC-64 (manual subscription update);
- [ADR-0078](./ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md), panel design gate;
- [`tools/schemagen/provider_test.go`](../../tools/schemagen/provider_test.go);
- issue [#254](https://github.com/mderkach/metabox/issues/254);
- reference behaviour that keeps the previous cache on a suspiciously small update: [Tachyon `cache.uc`](https://github.com/Dushnilin/tachyon/blob/ae37394c0abf220536c71d1f590a5bd9a8767a29/tachyon/files/usr/lib/subscription/cache.uc#L1934-L1954).
