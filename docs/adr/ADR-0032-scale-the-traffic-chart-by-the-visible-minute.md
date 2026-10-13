# ADR-0032. Take the traffic chart scale from the peak of the visible minute and keep the buffer two points longer than the window

- Status: Accepted
- Date: 2026-09-24
- Deciders: repository owner
- Supersedes (for the speed scale): [ADR-0031](./ADR-0031-keep-overview-chart-axes-fixed-and-fill-them-from-the-daemon.md)

## Context and problem statement

Per ADR-0031 the top of the traffic chart scale is the largest of three values: the peak over the whole daemon history, the minute peak and 1 MiB/s. On the BPI-R4 Pro router on 2026-09-24 the history peak held the scale at 40 MB/s, while the minute peak was 1.5–2.8 MB/s. A normal minute lay on the zero line, and neither a spike nor the background could be read from the chart. The lower limit of 1 MiB/s is about 8 Mbit/s, which is also large for an idle link.

The second defect is jitter at the left edge. The right edge of the window lags "now" by one stream step (ADR-0031), and the buffer held exactly as many points as fit in the window. The oldest point ended up inside the chart. A canvas measurement on the same router: the area started 8–16px from the left edge and once a second jumped 8px to the right when the old point dropped out of the buffer. There are no jumps at the right edge or in the series shift: over 1406 frames the tail never left the edge, animation frames were no longer than 21 ms.

The decision concerns only the traffic chart on the overview. The time axis, filling with the minute from the daemon and the sparklines stay per ADR-0031.

## Decision drivers

1. A normal minute fills the chart height, a spike and the background are distinguishable.
2. The scale is not rebuilt every second.
3. The chart area starts at the left edge and does not jump.
4. The daemon contract does not change.

## Considered options

1. **Scale from the peak of the visible minute, lower limit 1 Mbit/s, headroom for decline; buffer two points longer than the window.** Meets all drivers. **Chosen.**
2. **Keep the history peak in the scale.** The scale stays put, but after one large spike during the daemon lifetime a normal minute lies on zero. Violates driver 1. **Rejected.**
3. **Scale strictly by the minute peak, without headroom for decline.** The scale would be rebuilt every time a spike goes past the left edge, and the same speed would be drawn at different heights. Violates driver 2. **Rejected.**
4. **Return 62 points from the daemon instead of 60.** Closes the short left edge right after the panel opens, but changes the `GET /api/history` contract for the sake of the first two seconds. Violates driver 4. **Rejected.**

## Decision outcome

- The top of the scale is the peak of the visible minute in either direction, not below `TRAFFIC_MIN_CEILING` — 1 Mbit/s, that is, 125,000 B/s. The scale is labelled in bytes on round steps, so on an idle link the top sits at 200 KiB/s.
- The headroom for decline is the same (`useStickyCeiling`): the scale grows at once and shrinks only when the peak has fallen fourfold.
- The daemon history peak does not enter the scale.
- The traffic buffer is `TRAFFIC_POINTS` = `TRAFFIC_WINDOW_POINTS` + 2, that is, 62 points with a 60 s window and a 1 s step. One extra point covers the lag of the right edge, the second gives the start of the segment the left edge cuts.
- The minute peak for the scale and the "peak per minute" label is computed over the last `TRAFFIC_WINDOW_POINTS` points, not over the whole buffer.

## Consequences

### Positive

- A minute with traffic of a few megabytes per second fills the chart height.
- The left edge of the area sits on the boundary: measured after the change — a gap of 0–1px, not a single jump over 1428 frames.

### Negative

- The scale is no longer the same between minutes. A spike raises it at once, a decline lowers it no earlier than the peak falls fourfold. Heights on two minutes with different peaks cannot be compared directly.
- The minute from the daemon is 60 points. For the first two seconds after the panel opens the area starts slightly right of the left edge, until the stream adds two points.

### Neutral or deferred

- The one-minute connections chart and the sparklines did not change.

## Compatibility, migration and rollback

The daemon contract and the data format did not change. Rollback: return the history peak into the scale `Math.max` in `DaemonTraffic.tsx` and set `TRAFFIC_POINTS` = `TRAFFIC_WINDOW_POINTS`.

## Validation

- `pnpm --filter web exec vitest run DaemonTraffic Daemon.store OverviewPage`:
  - the scale is taken from the minute peak;
  - it shrinks only when the peak falls fourfold;
  - at idle it does not go below 200 KiB/s;
  - the oldest point of a full buffer sits no further right than the left edge of the window.
- Measurement on the router: the dev server against the daemon, frame-by-frame reading of the chart canvas. The leftmost and rightmost coloured columns in the chart area must not move away from the edges by more than a pixel and must not jump between frames.

## Links

- [ADR-0031](./ADR-0031-keep-overview-chart-axes-fixed-and-fill-them-from-the-daemon.md), [ADR-0027](./ADR-0027-draw-the-traffic-chart-with-uplot-and-keep-bars-in-html.md);
- `apps/web/src/widgets/Daemon/DaemonTraffic/ui/DaemonTraffic.tsx`, `apps/web/src/widgets/Daemon/DaemonTraffic/model/DaemonTraffic.constants.ts`;
- `apps/web/src/entities/Daemon/model/Daemon.store.ts`, `apps/web/src/pages/Overview/lib/Overview.lib.ts`.
