# ADR-0090. Accumulate traffic per outbound and the latency history in the daemon from the polls it already runs

- Status: Proposed
- Date: 2026-11-20
- Deciders: repository owner

## Context and problem statement

The Overview redesign ([`overview-for-newcomers`](../../openspec/changes/overview-for-newcomers/proposal.md)) shows one row per outbound that the rules lead to. A row shows volume and rate over the period, and the latency of the server in use against that server's norm. Neither number exists today.

- **Traffic.** [ADR-0074](./ADR-0074-split-sing-box-traffic-by-outbound-kind-from-the-connection-snapshot.md) splits the core volume into three kinds (proxy, direct, block) from the `/connections` snapshot that `route.Counter` polls once a second ([ADR-0029](./ADR-0029-count-rule-hits-in-the-daemon-from-connection-snapshots.md)). It explicitly left out a split by node. The kind split was specified as AC-89; the redesign withdraws AC-89 and specifies the split as part of the traffic shares, AC-97. A snapshot of open connections cannot replace a period: on the owner's router two video streams made the snapshot read "99 % direct" while the day's volume was roughly half and half.
- **Latency.** The fork's Clash API keeps one result per outbound: `GET /proxies` returns `history` with at most one entry (`experimental/clashapi/proxies.go`, `URLTestHistoryStorage`). A failed check deletes it: the manual check (`experimental/clashapi/proxies.go`), the periodic check of a group (`protocol/group/urltest.go`) and the health check of a subscription (`adapter/provider/adapter.go`) all call `DeleteURLTestHistory`. The pinned fork holds the result in process memory (`common/urltest/urltest.go`, `box.go`), so a core restart clears it. An absent entry can mean the server has never been checked or that a result was removed. Configured URLTest groups and providers with health checks enabled can refresh it. The manual delay endpoint accepts a named server outside any group. A median norm and "above the norm several checks in a row" need more than one result.

Constraints: NFR-4 (daemon RSS ≤ 64 MB, idle CPU ≤ 1 % of a core); the DeviceIO rule "no background polling without a consumer", with three named exceptions (traffic accounting, ADR-0015; the rule hit counter, ADR-0029; the daily rule set catalog sync, ADR-0034); no writes to flash for history (ADR-0015); no new dependency.

In scope: what the daemon accumulates, from which source, how bounded, and what reaches the contract, including the count of blocked connections. Out of scope: where labels and manual norms live ([ADR-0089](./ADR-0089-keep-outbound-labels-and-server-norms-in-the-daemon-state-and-rule-names-in-the-config.md)); keeping history across a daemon restart; active latency or bandwidth checks by the daemon.

## Decision drivers

1. The period is the daemon uptime, the same as the rest of the history (AC-37); the numbers survive a page reload.
2. No second `/connections` poll.
3. Memory is bounded by the running config, not by the number of connections.
4. The daemon does not run latency checks itself: a check costs traffic through the server, and a failed one erases the core's last result.
5. The background cost is named and fits NFR-4.
6. No new dependency, no flash writes.

## Considered options

### Traffic per outbound

1. **Extend `history.Volume` to key by outbound and by server, on the same snapshot.** A connection's `chains` lists the server first and the outbound the rule picked last. The rule's outbound is the row key; the first element is the server. Unseen bytes are spread by the interval's weights, as ADR-0074 does for kinds. The map has one entry per tag seen in the running config's outbounds and runtime list. **Chosen.**
2. **Count per outbound in the panel from the stream.** No daemon work, but the count lives only while a tab is open (driver 1). **Rejected.**
3. **A per-outbound counter from the fork** (gRPC or a patched Clash API). Exact, but needs a fork change; ADR-0074 already deferred it. **Rejected for now.**

### Latency history

1. **Read `GET /proxies` on a fixed slow cadence and record a result only when its timestamp changed.** One request every 60 s, independent of the panel. Per server tag: a ring of the last 10 results and 24 hourly medians, about 100 bytes, for at most 4096 tags. That is under 0.5 MB at the cap and a few kilobytes on a typical config. The norm and the levels are computed when read. The cost is a fourth background exception. **Chosen.**
2. **Read latency only while a panel is open** (inside the runtime stream hub). No new exception. But the history then covers only the minutes a tab was open, and a norm is meaningless after a night with the panel closed (driver 1). **Rejected.**
3. **Start active checks on a schedule.** Covers servers outside groups but adds requests through those servers while the panel is closed. A failed probe can erase a recent result. **Rejected.**
4. **Check once when adding a server.** Gives immediate feedback, but its sample is gone when the core restarts and a single sample does not establish the server's usual latency. **Deferred.**
5. **Check used servers without a result once after Apply or core start.** Recovers an initial reading without a schedule, but generates traffic at startup and can race automatic checks. A future version would need a concurrency limit and rules for retries and replaced results. **Deferred.**
6. **Use a fixed 180 ms norm.** Gives a number before measurements exist. Routes with different round-trip times would produce misleading warnings. **Rejected.**

## Decision outcome

- **Blocked connections are counted from the core log**, not from the snapshot (owner, 2026-11-20). A `reject` rule action returns before the connection trackers (`route/route.go`, `RuleActionReject`), so it never reaches `/connections`, and a connection to a `block` outbound closes before most snapshots.
  - Lines counted: `connection closed: rejected` from the router at `debug` level, for a `reject` rule; `blocked connection to` and `blocked packet connection to` from `protocol/block/outbound.go` at `info` level, for a `block` outbound. Each line is one connection.
  - A follower over the log reader of the log screen (`internal/logs`) runs from daemon start and reads new lines only. It holds one stream slot of that reader and reopens the stream after a core restart or a log rotation without counting a line twice.
  - From the running config the daemon reports per kind whether `log.level` and `log.disabled` let the lines through; an empty `log.level` means `trace` in the fork (`log/log.go`). Only the kinds the config uses count (rules with the `reject` action, outbounds of type `block`); a hidden kind in use makes the whole count unavailable, not zero and not partial.
  - Not counted: rejects of DNS rules (they answer a query, not a connection) and rejects a `tun` inbound makes in pre-match without a log line; metabox intercepts by redirect and tproxy, not `tun`.
  - The follower holds one of the four stream slots of the log reader (`MaxStreams`) for the daemon's uptime.
  - The count lives with the AC-37 history, resets with the daemon and carries `origin: computed`.
  - Rejected: counting from the snapshot (it does not see these connections); a counter in the fork exposed through the Clash API (exact, but a fork change; kept as a possible later source).
- `history.Volume` gains two maps beside the kind split: `outbound → bytes` and `server → bytes`, fed by the same `route.Counter` snapshot (`CounterOptions.Volumes`).
  - The outbound is the last element of `chains`, the server the first.
  - A connection matched by the default rule (`route.final`; the rule counter of ADR-0029 already tells these apart) is counted under its outbound with a `final` flag. Overview can then show "everything else" apart from rules that lead to the same outbound.
  - A connection straight to `direct` or `block` has the same tag in both places and is counted once, as an outbound.
  - Tags that leave the running config and the runtime list are dropped at the next config change. Their bytes stay in the kind split. A tag that returns after pruning starts a new per-tag total.
- The rate of each entry is the increment over the last interval. The history ring of ADR-0015 is not widened: a row shows its total and current rate, not a per-outbound chart.
- `internal/clashapi` gets a latency reader. `history.Latency` keeps, per tag, the last 10 results (time, milliseconds or failure) and the hourly medians of the last 24 hours. `main.go` starts it next to the traffic accounting and the rule counter, with a fixed 60 s interval.
  - It records a result only when the core's timestamp for that tag changed.
  - It records a failure when a tag that had a result has none at the next read.
  - A vanished result is a failure only when the tag is still listed in `/proxies` and the core process is the same. A failed connection through a `urltest` group also deletes the result (`protocol/group/urltest.go`, `DialContext`), and that counts as a failure. A removed tag starts a new baseline if it returns. A core restart clears current readings and failure streaks. Earlier observations can remain in the historical ring until their age limit or daemon restart.
  - Before the first hourly median there is no computed norm, and only the ceiling applies.
- A missing current result shows "No measurement" with a manual "Check" action for that server (owner, 2026-11-22). The first successful result is shown immediately in the panel. After the core restarts, previous daemon observations are historical and cannot stand in for a current reading. An explicitly failed manual check shows "No answer".
- The norm ("usual latency" in the panel) is one number: the manual norm (ADR-0089), otherwise the median of the hourly medians. A slow hour therefore does not become the norm within minutes. Levels:
  - within the norm;
  - above the norm, when the last three results are all above it;
  - no answer, when the last result failed;
  - no measurement, when the server in use has no current result after startup or has yet to be checked;
  - above the ceiling, at 1500 ms regardless of the norm.

  The daemon returns the ring and the computed values. Every computed value carries `origin: computed` in the AC-34 sense.

- Contract:
  - The `system` topic gains `outbounds` and `servers` (bytes and rate per tag), and the blocked count with its availability per kind.
  - `GET /api/latency` returns the rings, norms and levels.
  - Both reset with the daemon.
- Non-goals: per-outbound history charts; per-device volume; keeping anything on flash.

### Scope and boundaries

`apps/metaboxd/internal/history`, `internal/route` (consumer wiring), `internal/clashapi` (latency reader), `internal/device` (the `system` topic), `internal/httpapi`, `internal/contract`, `main.go`; `apps/metaboxd/docs/guides/DeviceIO.md`, section "Resources", which lists the background exceptions.

## Consequences

### Positive

- Overview rows show a real period, not a snapshot.
- A slow server is judged against its own history, not one global threshold.
- No extra `/connections` traffic; the latency read is one small request a minute.

### Negative

- A fourth background exception to the DeviceIO rule: one `/proxies` read a minute with no reader. On a config with many subscription servers that answer is large (ADR-0074 already notes this). The cost has to be measured on the device.
- A fifth background exception to the DeviceIO rule: the log follower. At `info` the core writes a line per connection already, at `debug` several, so the follower parses every line the core writes. The cost has to be measured on the device at `debug`.
- The blocked count is only as complete as the log: a user who set `info` sees the figure unavailable when the config has `reject` rules, and lines lost by a full log ring are not counted.

- The unseen part of the per-outbound volume is attributed, not observed, with the same error as ADR-0074. For an outbound that carries only short connections it can be noticeably off. The panel marks these numbers as computed.
- Servers without URLTest or provider health-check results show no measurement until checked by the user. The one-minute sampler can miss results replaced between observations.
- A group whose `interval` is longer than 60 s gives one new result per its own interval. The recent ring then spans more time, and "three in a row" takes longer to trigger.
- Everything resets on a daemon restart.

### Neutral or deferred

- A per-outbound counter from the fork (ADR-0074, option 4).
- An adaptive norm learned from connection timings.

## Risks and mitigations

| Risk                                                | Likelihood and impact | Mitigation                                                                                                                                                                         |
| --------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RSS grows past NFR-4 on a large subscription config | Low; medium impact    | Caps on tags (4096), recent results (10) and hourly medians (24); measure RSS on the device with 5000 connections and a large provider set before setting the status to `Accepted` |
| The 60 s `/proxies` read shows up in idle CPU       | Low                   | Measure idle CPU on the device; lower the cadence to the shortest `urltest` interval of the config if needed                                                                       |

## Compatibility, migration and rollback

Additive fields and one new endpoint; an older panel ignores them. Nothing is persisted, so a rollback is a binary downgrade.

## Validation

- `internal/history` tests: shared AC-97/AC-101 fixture with WAN 100 MiB, proxy 30 MiB and direct through the core 20 MiB. It yields 30/70 MiB in the shares, 30/20 MiB in the outbound rows and 50 MiB estimated past the core; the rule's outbound is the last chain element; a tag absent from the running config and runtime list is dropped from the rows at the next config change and its bytes stay in the kind split; a `final` connection is counted apart; the ring drops the oldest entry and hourly medians older than a day; a repeated core timestamp is not recorded twice; a disappeared result is recorded as a failure; the norm and the levels.
- `internal/clashapi` test: the latency reader parses `history` with zero or one entry.
- `internal/logs` or `internal/history` tests: both kinds of blocked lines are counted once; a level that hides a kind reports it unavailable; a core restart continues the count without double counting.
- Device: RSS and idle CPU with 5000 connections and the owner's provider set, at `log.level` `warn` and at `debug`, recorded here before `Accepted`.
- Files governed: `apps/metaboxd/internal/history/volume.go`, the new latency ring in `internal/history`, `internal/clashapi`, `internal/route/hits.go`, `internal/device/share.go`, `internal/logs` (the blocked-count follower), `main.go`, `apps/metaboxd/docs/guides/DeviceIO.md`.

## Links

- [`openspec/changes/overview-for-newcomers`](../../openspec/changes/overview-for-newcomers/proposal.md): AC-97, AC-101, AC-102.
- NFR-4 in [`openspec/specs/non-functional/spec.md`](../../openspec/specs/non-functional/spec.md); AC-37 in [`openspec/specs/overview/spec.md`](../../openspec/specs/overview/spec.md); AC-34 in [`openspec/specs/route-explanation/spec.md`](../../openspec/specs/route-explanation/spec.md).
- [ADR-0074](./ADR-0074-split-sing-box-traffic-by-outbound-kind-from-the-connection-snapshot.md), [ADR-0029](./ADR-0029-count-rule-hits-in-the-daemon-from-connection-snapshots.md), [ADR-0015](./ADR-0015-keep-traffic-history-in-the-daemon.md), [ADR-0089](./ADR-0089-keep-outbound-labels-and-server-norms-in-the-daemon-state-and-rule-names-in-the-config.md).
- Issue #315.
