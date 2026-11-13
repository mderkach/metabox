# ADR-0074. Split sing-box traffic by outbound kind from the connection snapshot and spread unseen bytes by weight

- Status: Accepted
- Date: 2026-11-12
- Deciders: repository owner

## Context and problem statement

AC-89 requires the overview to split the traffic that passed through sing-box into "through a proxy", "direct" and "rejected", and to count the channel share over the proxied part only. The daemon accumulates the split together with the AC-37 history ([ADR-0015](./ADR-0015-keep-traffic-history-in-the-daemon.md)).

Facts from the code and the fork:

- `events.Accounting` sums the `/traffic` stream: two numbers per second for the whole process, with no breakdown by outbound. This is `Share.Proxy` today, and the panel divided it by the channel volume, so a direct exit read as proxied.
- Clash API `/connections` returns only live connections with cumulative `upload`/`download`, the chain `chains` (final outbound first) and the process totals `uploadTotal`/`downloadTotal`, which include closed connections. The outbound type is not in the snapshot; `/proxies` has it per tag (`Direct`, `Reject` for a `block` outbound, `DNS`, protocol names). DNS-outbound connections are filtered out of the snapshot but counted in the totals.
- `route.Counter` already polls `/connections` once a second for the whole daemon uptime and hands the same snapshot to the runtime stream ([ADR-0029](./ADR-0029-count-rule-hits-in-the-daemon-from-connection-snapshots.md)).
- The panel's `widgets/ConnectionSummary` classifies live connections the same way, by outbound type, but only over the snapshot it sees while the tab is open.

The problem: a per-connection sum over snapshots misses the bytes a connection sends after the last snapshot before it closes, and the whole of a connection that opens and closes between two snapshots (short DNS, QUIC, TLS probes). Out of scope: keeping the split across a daemon restart, a split by device or node.

## Decision drivers

1. The parts add up to what passed through the process: no bytes are lost between snapshots.
2. No second `/connections` poll and no new background loop (ADR-0029 already pays for one).
3. The kind is taken from the outbound type, not from the tag name: `direct-ru` of type `vless` is a proxy.
4. Bounded memory and idle cost on the router (NFR-4).
5. No new dependency in the daemon.

## Considered options

1. **Sum per-connection increments only.** Exact for what is observed, simple. Loses the tail of every closed connection and every connection shorter than a second; the split then adds up to less than the process total and drifts by workload. **Rejected** by driver 1.
2. **Per-connection increments plus the process remainder put into one kind**, for example "everything unseen is a proxy" or "everything unseen is direct". Adds up to the total, but biases the share in a fixed direction: the first inflates exactly what AC-89 fixes, the second hides proxied bursts. **Rejected.**
3. **Per-connection increments plus the remainder spread by the interval's weights.** The remainder is the process total increment minus the increments of live connections. It is spread over the kinds by what moved in the same interval: live connections by their increment, connections that disappeared since the previous snapshot by their last increment. An interval with no weight carries its remainder to the next one. Adds up to the total; the unseen part is an estimate proportional to observed activity. **Chosen.**
4. **A separate counter from the fork** (per-outbound totals through gRPC or a patched Clash API). Exact, but needs a fork change and a second source; not available in the fork version the panel targets. **Rejected** for now.

## Decision outcome

- `history.Volume` (`apps/metaboxd/internal/history/volume.go`) keeps the previous snapshot's per-connection bytes and kind and accumulates bytes per kind: `proxy`, `direct`, `block`. The first snapshot after the daemon start and a snapshot whose process total went down (sing-box restarted) are a baseline only.
- `route.Counter` takes the volume split as an optional consumer (`CounterOptions.Volumes`) of the snapshot it already parses. The kind is the type of the first chain node from `/proxies`: `Direct` and `DNS` are direct, `Block` and `Reject` are block, anything else, including a tag missing from `/proxies`, is a proxy. `/proxies` is reread once per snapshot when a tag is not in the remembered list.
- `device.Share` gets `split` (`history.Split`); `share.proxy`, the whole sing-box volume from `/traffic`, stays in the contract. The panel shows "through a proxy" and "direct through sing-box" from `split` and divides `split.proxy` by the channel volume; the rejected volume goes into the direct tile's context when it is above zero.
- Non-goals: an exact per-connection count of unseen bytes; DNS as its own kind (it counts as direct: it does not leave through a proxy).

## Consequences

### Positive

- The channel share no longer counts direct exits as proxied.
- The split adds up to the process total, so the panel can compare its parts with `share.proxy` and the channel.
- No extra `/connections` traffic: the split rides on the snapshot the rule counter already takes.

### Negative

- The unseen part is attributed, not observed. A short proxied connection in an interval where only direct connections moved is counted as direct, and the reverse. With many short connections the split carries this error.
- The daemon now parses `upload`/`download` and the totals of every snapshot and keeps one map entry per live connection: with 5000 connections that is a few hundred kilobytes more in memory. Not measured on the device.
- `/proxies` is read after a process restart and on any new tag; on a config with many provider nodes this answer is large.
- `split` and `proxy` are counted by different paths (`/connections` and `/traffic`) and can differ by the bytes of one interval at any moment.

### Neutral or deferred

- An exact per-outbound counter from the fork (option 4).
- The split lives in memory and resets with the daemon, like the rest of AC-37.

## Compatibility, migration and rollback

`share.split` is a new field; `share.proxy` keeps its meaning, so an older panel build reading the new daemon keeps working and shows the old "through sing-box" figure. The panel is embedded in the daemon binary, so a new panel always meets a daemon that serves `split`. Rollback: remove `Volumes` from the counter options in `main.go` and the `Split` option of `device.New`; `split` then stays zero, and the panel tiles show a dash.

## Validation

- `go test -race ./internal/history ./internal/route ./internal/device` from `apps/metaboxd`: the split of live connections, a connection that appears between snapshots, bytes of a connection that opened and closed between snapshots, the tail of a closed connection, a carried remainder, a baseline on the daemon start and a rebase on a sing-box restart, classification by outbound type and the reread of `/proxies` on an unknown tag.
- `pnpm --filter web exec vitest run src/pages/Overview`: the tiles show the proxy and direct volumes, the share is counted over the proxied part, the rejected volume is named.
- On the device: compare `share.split` with the Connections screen summary under mixed proxy and direct load, and measure daemon RSS with 5000 connections. Not done.

## Links

- `docs/PRD.md`, AC-35, AC-37, AC-89; issue #209;
- [ADR-0015](./ADR-0015-keep-traffic-history-in-the-daemon.md), [ADR-0029](./ADR-0029-count-rule-hits-in-the-daemon-from-connection-snapshots.md);
- `apps/metaboxd/internal/history/volume.go`, `apps/metaboxd/internal/route/volume.go`, `apps/metaboxd/internal/device/share.go`;
- `apps/web/src/pages/Overview/ui/OverviewTraffic.tsx`.
