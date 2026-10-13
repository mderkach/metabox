# ADR-0015. Accumulate the runtime history and the link share in the daemon over its whole uptime

- Status: Accepted
- Date: 2026-09-13
- Deciders: repository owner

## Context and problem statement

The panel kept the traffic history in a ring buffer of sixty samples in the tab's memory. This has two consequences visible on a live router: a page reload reset the chart, and the chart window was one minute, so it showed neither the morning peak nor that the link was silent all night.

The share of the link going through sing-box was computed the same way: the tab summed counter increments from the moment it was opened. The per-second ratio jumped with every burst, and the accumulated one lived exactly until `F5`.

Compare with the neighbour on the device: b4 keeps the counters on its side and returns a ready ratio (`targeted_connections` to `total_connections`) over its whole uptime, and shows live values in a separate line. The router owner expects the same from metabox.

The constraints were set earlier: the daemon's `go.mod` has no dependencies, the NFR-4 budget (RSS ≤ 64 MB, idle CPU ≤ 1% of a core), the [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md) rule "no background timer polling without a consumer", and the PRD entry (roadmap after v1) saying that history deeper than a minute needs storage on the daemon.

In scope: where the traffic history and the accumulated volumes live, what fills them and what of this goes into the contract. Out of scope: history breakdowns by device, host and node: they stay in the roadmap.

## Decision drivers

1. **The history survives a page reload.** This is the reason for the decision.
2. **No new dependencies and no writes to flash.** The router's flash endurance is not spent on a chart.
3. **Increments are not lost.** The interface counter runs from link up, the Clash API counter from process start; an increment not taken in time cannot be restored afterwards.
4. **The idle cost fits into NFR-4.**
5. **A point's time does not depend on the router clock.** Before NTP sync it starts from the epoch and jumps.

## Considered options

1. **Keep accumulating in the tab.** Pros: nothing to do, the daemon is not touched. Cons: the window lives until a page reload (driver 1); while the panel is closed, increments are lost (driver 3). **Rejected.**

2. **Write the history to disk.** Pros: survives a daemon restart. Cons: writing to flash every few seconds for a chart (driver 2); a file format, migrations and a retention question appear. **Rejected**: b4 also loses its counters on restart, and nobody minds.

3. **A ring buffer in the daemon's memory plus constant accounting.** Pros: the history and the share live as long as the daemon does, and on the device it runs for months (drivers 1, 3); tens of kilobytes of memory are needed (driver 2). Cons: background work without a reader is an exception to the DeviceIO rule; a daemon restart resets both the history and the accumulated values. **Chosen.**

What to do with a full ring was decided separately. **Dropping old points** means showing a sliding window: the chart would stop answering the question "what happened since the morning", which is why the history was introduced. **Coarsening the step** (merging neighbouring points in pairs and doubling the interval) keeps the whole daemon uptime in the same 2160 points, at the cost of older sections becoming coarser. The second was chosen.

## Decision outcome

`internal/history` holds two rings of 2160 points: traffic and board metrics (load, temperature, used memory). For the first six hours the step is ten seconds; after that the ring does not drop old data but merges neighbouring points and doubles the step, so the chart always covers the whole daemon uptime. The step is counted in samples, not by the clock: the fork sends exactly one sample per second, and a point's time cannot be restored from the router clock (driver 5). A point carries no absolute time at all: `GET /api/history` returns the current step and the order, and the panel computes the axis labels from the browser clock.

`internal/events.Accounting` keeps the `/traffic` stream open for the whole daemon uptime and delivers samples to two consumers: the history and the volume counters in `internal/device`. The same accounting takes the full board metrics once per interval (interface counters, load, temperature and memory) and puts them into its ring. The share of the link through sing-box is computed from these increments over the whole daemon uptime and reaches the panel ready-made in the `system` topic.

Background work without a reader is a deliberate exception to the DeviceIO rule, and its cost is named: one permanent connection to localhost carrying two numbers per second, and reading `/proc/net/dev` once per interval. The reason for the exception is driver 3: the consumer here is the value itself, and it cannot be restored afterwards.

## Consequences

**Good:** the chart survives a page reload and shows hours, not a minute; the link share stopped jumping and does not depend on when the tab was opened; the panel no longer accumulates anything itself, it only draws.

**Bad:** a daemon restart resets the history and the accumulated values; on the device this is a rare event, but noticeable during debugging. Resolution drops with uptime: after a day the step is forty seconds, after a month twenty minutes, and a short burst in an old section gets blurred. A point carries no time, so the axis labels depend on the browser clock: on a client with a drifted clock they drift too.

**Open:** there are no history breakdowns by device, host and node: the connection snapshot is not written to the history, and its volume (up to 5000 entries per second per NFR-2) cannot go there without a separate decision.

## Validation

On the BPI-R4 Pro on 2026-09-13: the daemon from the branch, `GET /api/history` returns `step_seconds: 10` and a growing list of points, eight points eighty seconds after start. The link share in the `system` topic is computed over the whole daemon uptime and is not reset by a page reload. The `internal/history` tests cover step averaging, an incomplete step, step coarsening when the ring fills up and the order of board metrics; an `internal/events` test checks that accounting accumulates without a single stream reader.
