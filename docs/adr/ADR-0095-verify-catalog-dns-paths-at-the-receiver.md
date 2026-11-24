# ADR-0095. Verify catalog DNS paths at the receiver

- Status: Accepted
- Date: 2026-11-24
- Deciders: Repository owner

## Context and problem statement

Simple can stage a route and a Domain Name System (DNS) rule for the same catalog service. Two configurations can both pass the core's configuration check and still send the lookup and the connection through different exits. A destination address alone can also agree with the requested exit by coincidence when an explicit rule never matched.

## Decision drivers

- Distinguish an explicit rule match from a default that happens to choose the same exit.
- Observe both the chosen DNS server and the network path to it.
- Repeat the check after a core upgrade with synthetic domains and no dependency on a public resolver or router.

## Considered options

1. **Use schema validation, the core check and debug logs.** These show whether the core accepts a configuration and which action it selects. They cannot show which peer the upstream server saw.
2. **Probe the existing OpenWrt integration stand.** This can cover system interception and Apply. It needs controlled upstream endpoints to distinguish the exits, and the operating system setup contributes little to a test of the core's own rule selection.
3. **Run the pinned core with instrumented receivers on an isolated loopback network.** This gives each proxy relay a distinct source address and each DNS server a distinct listener. It exercises the core with no physical router and leaves operating system interception to the OpenWrt stand.

## Decision outcome

Use the isolated receiver test for the catalog mapping. Check the schema and config first. For each service, compare the core's ordered route and DNS matches with the expected actions. Independently compare the traffic peer and the upstream resolver's listener and peer with the requested paths. Exercise a sibling service when a shared rule changes. The core comes from the existing [release pin](./ADR-0082-count-seven-schema-registries-and-pin-the-bench-sing-box-by-file.md).

## Consequences

The stand can detect a wrong detour even if the DNS answer arrives. It can also detect a missing explicit route when the default uses the same relay. Its evidence covers the transports, address families, listener setup and core version exercised by the fixtures. Hardware routing and Apply still have their own [integration checks](./ADR-0067-test-http-apply-on-the-disposable-ci-bench.md).

## Validation

[Verification](../Verification.md#catalog-route-and-dns-mapping) records the receiver measurements and the overlapping-set counterexample for the tested core release. The [catalog planner](../../apps/web/src/features/Rule/RuleCatalogAdd/model/RuleCatalogAdd.plan.ts) applies those bounds to the draft. Its [unit tests](../../apps/web/src/features/Rule/RuleCatalogAdd/__tests__/RuleCatalogAdd.plan.test.ts) cover resolver choice, rule order and refusal of ambiguous matches.
