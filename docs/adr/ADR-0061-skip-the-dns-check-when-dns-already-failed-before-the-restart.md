# ADR-0061. Skip the DNS check after the restart when the running config already fails it

- Status: Accepted
- Date: 2026-10-24
- Deciders: repository owner
- Supersedes (as to the DNS probe of the healthcheck): [ADR-0047](./ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md)

## Context and problem statement

The Apply healthcheck ([ADR-0047](./ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md), "Daemon") sends a DNS probe to the candidate's dns-in after the restart and rolls the config back with `dns_probe_failed` when no answer with an address comes (AC-54 of the [PRD](../PRD.md)).

The probe cannot tell a DNS section broken by the edit from an upstream that is down for both configs. When every provider node is dead and the uplink is alive, a dns-in whose upstream goes through those nodes (a `detour` to a proxy outbound, DoH or DoT routed through one) answers nothing: the fork writes no response when the exchange fails. `TestAllNodesDeadRollsBackOnDNSProbe` recorded the result: the edit is rejected with a reason that blames the new config, the service restarts twice, and the restored config fails the same way (issue [#79](https://github.com/mderkach/metabox/issues/79)).

The interception check already handles the same shape of problem: chains that were absent before the restart are skipped with a warning, since the apply did not remove them and a rollback will not bring them back.

Constraints: the daemon does not parse the config beyond `experimental.clash_api` and dns-in ([Architecture&Style](../../apps/metaboxd/docs/guides/Architecture&Style.md), "Boundaries"); the Apply cycle fits into NFR-5.

## Decision drivers

- A rollback is triggered only by a failure the apply caused and the rollback can repair.
- The reason shown to the user names the actual cause.
- The daemon stays within its config boundaries.
- The cost of the extra check fits into NFR-5 when DNS works.

## Considered options

1. **Probe dns-in before the restart as well; when the running config already fails, skip the check after the restart with a warning.** One more probe per apply, immediate when DNS works and up to `attempts × timeout` when it does not. Covers every upstream that is down for both configs, not only dead nodes. **Chosen.**
2. **Probe a node through the Clash API `/proxies/<node>/delay` and skip the DNS check when no node answers.** The daemon would have to pick the node, and so read outbounds and the DNS `detour` from the config, which the boundaries forbid. It also covers only the dead-node case. **Rejected.**
3. **Keep the current behaviour.** An apply during a provider outage is always rolled back and blames the edit. **Rejected.**

## Decision outcome

Before the restart, the daemon reads dns-in from the running config with the same rule as for the candidate (the first `direct` inbound on the model's `dns_port`) and sends it the same probe. If the probe fails, the DNS check after the restart is skipped and a `Warn` record is written with the probe error; the transaction proceeds to the confirmation window. If the probe passes, or the running config is absent, unreadable or has no dns-in on that port, the check after the restart runs as before and a failure rolls back with `dns_probe_failed`.

The pre-restart probe runs only where the post-restart one would: with a dataplane model read and a probe configured. The dataplane model change (`apply.Plane`) is out of scope: there the probe is the only check that the new `dns_port` serves.

## Consequences

### Positive

- An apply during an upstream outage is not rolled back to a config that fails the same way, and the service restarts once.
- The rule matches the interception check: what was broken before the restart is not blamed on the apply.

### Negative

- When DNS was already down before the restart, a candidate with a genuinely broken `dns` section passes the healthcheck and is caught only by the confirmation window, if the user does not confirm.
- When DNS is down, the apply takes up to `attempts × timeout` longer before the restart.

### Neutral or deferred

- The confirmation window is unchanged and still covers every apply.

## Compatibility, migration and rollback

No change to the API, the transaction state or the reason codes. Rollback of the decision is reverting the pre-restart probe in [`cycle.go`](../../apps/metaboxd/internal/apply/cycle.go).

## Validation

- `cd apps/metaboxd && go test -race ./internal/apply/`: `TestAllNodesDeadKeepsConfigOnDNSProbe` (dead nodes before and after the restart: no rollback) and `TestDNSProbeBeforeRestart` (answered before and failed after: rollback with `dns_probe_failed`; failed before and after: no rollback, a `Warn` record).
- `TestBrokenDNSRollsBack`: without a running dns-in the check after the restart still rolls back a broken `dns` section.

## Links

- [PRD](../PRD.md): AC-54, NFR-5;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0022](./ADR-0022-report-the-apply-failure-step-as-a-code.md), [ADR-0047](./ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md);
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md), section "Service through procd";
- [`cycle.go`](../../apps/metaboxd/internal/apply/cycle.go), [`probe_test.go`](../../apps/metaboxd/internal/apply/probe_test.go);
- issue [#79](https://github.com/mderkach/metabox/issues/79), PR [#76](https://github.com/mderkach/metabox/pull/76).
