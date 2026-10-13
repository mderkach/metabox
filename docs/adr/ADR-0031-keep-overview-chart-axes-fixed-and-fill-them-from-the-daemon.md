# ADR-0031. Keep overview chart axes fixed and fill the charts with what the daemon has accumulated

- Status: Accepted
- Date: 2026-09-23
- Deciders: repository owner
- Supersedes: the "Time axis window" item in [ADR-0027](./ADR-0027-draw-the-traffic-chart-with-uplot-and-keep-bars-in-html.md)
- Superseded by (for the speed scale): [ADR-0032](./ADR-0032-scale-the-traffic-chart-by-the-visible-minute.md)

## Context and problem statement

Per ADR-0027 the time axis of the traffic chart covered only the accumulated points: with a partial buffer the left edge followed the first point. The speed scale was computed from the peak of the last minute. On the router with live data this gave three defects the owner pointed out:

- the time axis stretched while the buffer filled, and the scale was recomputed every time a spike went past the left edge. The same speed was drawn at different heights;
- the one-minute charts — traffic and the number of connections — accumulated in the browser and started from an empty space every time the panel opened. The panel is not always open, and the chart knew only what happened while the tab was open;
- the router and process sparklines took the top of the scale from the peak of their own series. Any series reached the top edge, and a flat line there read as "at the limit".

## Decision drivers

1. Axes do not move after the data: only the data itself changes.
2. The chart shows the same thing whenever the panel is opened.
3. Height on the chart is comparable between frames and between minutes.
4. No second runtime poll in the daemon and no new dependencies.

## Considered options

1. **Fixed axes, the minute and the scale come from the daemon.**
   - The daemon keeps the last 60 seconds of traffic and connection counts without averaging and returns them in `GET /api/history` (`recent`, `connections`).
   - The panel fills an empty buffer with the minute from the daemon on open.
   - The time axis is always a full minute up to "now".
   - The speed scale is the peak over the whole daemon history, at least 1 MB/s, and grows at once if the live peak exceeds it.
   - Meets all drivers. **Chosen.**
2. **Keep accumulating in the browser, only pin the axes.** The axes stay put, but the chart is empty for a minute after the panel opens, and the scale knows only the minute on screen. Violates driver 2. **Rejected.**
3. **A second SSE stream of minute history.** The same as option 1, but with a new topic and one more subscription. The minute can be returned in one `GET /api/history` response anyway, which the overview loader already waits for. **Rejected.**

## Decision outcome

- `history.Traffic` keeps the last `RecentPoints = 60` samples as is. `history.Connections` keeps the number of live connections per snapshot per second; `route.Counter` writes it, since it already takes `/connections` once a second.
- `contract.History` got `recent` and `connections`.
- Panel: `RuntimeStore.seedTraffic` and `ConnectionStore.seedHistory` fill only an empty buffer. The minute from the daemon does not count as a stream frame and does not confirm the stream is alive.
- Traffic chart:
  - the time axis is `TRAFFIC_WINDOW_SECONDS` = 60 s up to "now" (minus the stream step during smooth shifting);
  - the tick at the very left edge is not labelled — its label would land on the bottom tick of the scale;
  - the top of the scale is the largest of the daemon history peak, the minute peak and `TRAFFIC_MIN_CEILING` (1 MB/s), with headroom for decline (`useStickyCeiling`).
- Connections chart — a round edge on 1–2–5 steps with the same headroom.
- Router and process sparklines (`OverviewTrend`):
  - the top of the scale is set in advance: the capacity of the quantity (cores, 100 °C) or twice the first value for memory;
  - the window, range and top of the scale are labelled under the series.

## Consequences

### Positive

- The chart opens full and identical whenever the panel is opened.
- Axis labels do not change from frame to frame.
- The memory sparkline shows how many times memory grew since the start of the window: the top of the scale is a doubling.

### Negative

- A daemon restart resets both the minute and the history peak: right after it the traffic scale sits at 1 MB/s and grows with the first large spike.
- The history peak is the average over a history step (10 s and coarser), not per second: a short spike above it on the minute chart raises the scale.
- A buffer the stream has already written into is not filled with the minute from the daemon: if the stream got ahead of the history response, the chart starts with a short tail.

## Compatibility, migration and rollback

The `recent` and `connections` fields are added to the response, old fields did not change. Rollback: remove seeding from `useOverviewRuntime` and return the window by accumulated points; the fields can stay in the daemon.

## Validation

- `go test -race ./internal/history ./internal/route`: the minute is kept without averaging, the snapshot connection count is written.
- `pnpm --filter web exec vitest run DaemonTraffic OverviewPage Daemon.store chart`:
  - the window is always a minute, labels "−45 s … now";
  - the scale comes from the history peak, not below 1 MB/s;
  - the traffic and connections charts are drawn before the first stream frame;
  - seeding does not touch a filled buffer and does not make the stream alive.
- BPI-R4 Pro router on 2026-09-23: `GET /api/history` a minute after start returns 60 traffic and connection points each, the charts open full.

## Links

- [ADR-0027](./ADR-0027-draw-the-traffic-chart-with-uplot-and-keep-bars-in-html.md);
- [ADR-0015](./ADR-0015-keep-traffic-history-in-the-daemon.md);
- `apps/metaboxd/internal/history/history.go`, `apps/web/src/widgets/Daemon/DaemonTraffic/ui/DaemonTraffic.tsx`, `apps/web/src/pages/Overview/ui/OverviewTrend.tsx`.
