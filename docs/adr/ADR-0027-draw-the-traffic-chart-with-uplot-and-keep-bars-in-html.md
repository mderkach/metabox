# ADR-0027. Draw the traffic chart with uPlot without transition animation, and keep the summary bars in HTML with an axis by ticks

- Status: Accepted
- Date: 2026-09-23
- Deciders: repository owner
- Superseded by (for the time axis window): [ADR-0031](./ADR-0031-keep-overview-chart-axes-fixed-and-fill-them-from-the-daemon.md)

## Context and problem statement

The overview — AC-10 (real-time traffic and a summary of the live connections snapshot) and AC-37 (traffic history in the daemon) — had two kinds of charts, both on custom markup without a library: a one-minute traffic chart of two mirrored SVG areas and the summary bars — "Where traffic goes", "Top proxy nodes", "Top devices", "Node latency". An interface review on 2026-09-22 found three defects:

- **the bars have no value axis.** The bar length can be checked against nothing but the percentage next to it;
- **the halves of the traffic chart scale by their own peaks.** Areas that look equal differ several times, and inbound cannot be compared with outbound from the picture;
- **the time axis prints "−60 s … now" on a buffer that is not full.** It labels time for which there is no data.

The same review decided to take a charting library, the candidate being `uPlot`. The decision came with one hard requirement: no transition animation. The runtime arrives once a second, and an animated transition would draw values that were not in the data.

Constraints set by the code:

- **A traffic stream frame has no time of its own.** The envelope is `topic`, `seq`, `data` (`apps/web/src/shared/api/daemon.generated.ts`). The daemon sends a frame once a second, and a background tab delivers accumulated frames in a batch (`Daemon.store.ts`).
- **A canvas does not read CSS variables.** Theme tokens live in `:root` and `.dark` (`apps/web/src/app/styles/index.css`), the theme class is set by `next-themes`.
- **jsdom has no canvas.** `getContext` returns `null`.
- **The ready shadcn chart (`chart`) is built on Recharts.**

In scope: the traffic chart on the overview, the summary and latency bars, where the library wrapper lives and its bundle cost. Out of scope: "Connections per minute" (`ConnectionHistory`) and the board sparklines — they stay on SVG; network topology.

## Decision drivers

1. **No transition animation.** A new point appears immediately, only the axis moves.
2. **Axis and ticks on round values** in the units `formatBytes` prints.
3. **Text is readable by a screen reader and grows with font size** (WCAG 1.4.4): row labels do not go into the canvas.
4. **The bundle cost is stated as a number and does not land on the main chunk.**
5. **No reading of DOM geometry on every draw and no syncing of one state in two places.**
6. **Testable in jsdom.**

## Considered options

1. **uPlot for the traffic chart, HTML bars with an axis by scale ticks.**
   - The traffic chart is a uPlot canvas. Data is updated via `setData(data, false)`, the time axis is shifted by `setScale('x')` in `requestAnimationFrame`.
   - The bars stay HTML, as they were. The axis under them is tick labels computed by `toValueScale`, by percentage from the scale edge.
   - Advantages:
     - no animation by construction (driver 1);
     - 1–2–5 ticks on kilobyte steps (2);
     - bar text is HTML (3);
     - the library goes only into the overview chunk (4);
     - no second source of positions (5).
   - Disadvantages: the two kinds of charts have different mechanisms; the library does not serve the single bar axis.
   - **Chosen.**

2. **Everything on uPlot, bars drawn on a canvas over HTML rows.** Rows are HTML, tracks are drawn by a `draw` hook at coordinates taken with `getBoundingClientRect` from marked places.
   - Disadvantages:
     - forced layout on every draw (5);
     - a "last value" ref and `useLayoutEffect` so that the hook sees the current bars;
     - the space for the axis in CSS is tied to the axis size in code.
   - Built and checked in the browser, then removed after review. **Rejected.**

3. **Bars as a horizontal uPlot series (`ori: 1`, `paths.bars`, bar colour via `disp.fill`), labels as an HTML list beside it.**
   - Rows match bars only through a fixed row height in rem: a row cannot wrap, a label gets cut off.
   - The "not checked" dashes would have to be replaced with a missing track.
   - Configuration is heavier than in option 1 with the same result for four labels.
   - **Rejected.**

4. **ECharts or Recharts, including through shadcn `chart`.** Axes, tooltips and themes are ready, but this is 300+ kB against ~50 kB for uPlot (driver 4). Transitions are animated by default and would have to be turned off per chart (1). **Rejected.**

5. **Keep the custom SVGs and add axes by hand.**
   - For the bars this is option 1: ticks are computed by `toValueScale`.
   - For traffic one would have to write an own time axis, ticks, HiDPI and smooth shifting, that is, what uPlot gives ready-made.
   - **Rejected for the traffic chart.**

## Decision outcome

**uPlot `1.6.32`, exact version, only for the `DaemonTraffic` traffic chart.**

- **Wrapper.** The lifecycle is held by the `Plot` wrapper in `apps/web/src/shared/ui/Plot.tsx`:
  - the chart is created on mount and destroyed with `destroy` on unmount;
  - `data` and `scales` are set with `setData(data, false)` and `setScale` inside `batch`;
  - a change of `options` recreates the chart;
  - size is tracked by `ResizeObserver`;
  - the ready instance is handed over in `onChart`.
- **Animation.** There are no transition animations. The legend and cursor are disabled.
- **Colours.** A colour is a theme token read at draw time (`plotColor`). A redraw on theme change is triggered by a `MutationObserver` on the `class` attribute of `<html>`: `next-themes` sets the class in its effect, after the effects of descendants, and a redraw from React would take the previous colours.
- **Axis font.** The axis font and font size are taken from the container, not set in pixels.
- **The model computes the point time, not the widget.** `toTrafficTimes` in `entities/Daemon/model/Daemon.store.ts` counts points back from the arrival of the last one with the stream step `TRAFFIC_STEP_SECONDS`: by arrival time the frames of a batch would stick together into one second.
- **Time axis window.** The `TRAFFIC_WINDOW_SECONDS` window is one step shorter than the buffer, otherwise with a full buffer the left edge would jump once a second. The left edge is the first accumulated point while the buffer is not full (`toTimeWindow`).
- **Axis shift.** The time axis is shifted by the `useFollowNow` hook in `requestAnimationFrame`. Under `prefers-reduced-motion: reduce` the shift is disabled, and the axis is set together with the data.
- **Scale.** Inbound and outbound share one scale, the edge is computed from the larger of the peaks. Peaks are taken from the page (`useOverviewRuntime`) and are not recomputed.
- **Empty chart.** Until the second point a waiting text is shown instead of the chart.

**The summary and node latency bars are HTML.**

- The bar length is computed from the scale edge, not from the series sum. The percentage of the sum is printed next to it.
- The axis is the `ValueAxis` component in `shared/ui`, ticks come from `toValueScale`: two ticks for the summary, for latency a constant 0–900 ms scale in thirds of the ceiling.
- A row with zero value gets no track.

**Custom code in `shared/ui` is linted with the project rules.** shadcn primitives are moved to `shared/ui/shadcn/`, and the override in `apps/web/.oxlintrc.json` lifts rules only from that directory.

**In tests uPlot is replaced globally** (`src/test/setup.ts`, `src/test/fakePlot.ts`). The fake records calls and computes axis labels with the same functions the chart was given.

Non-goals: hover tooltips, zooming, range selection.

### Scope and boundaries

- `apps/web/src/shared/ui/Plot.tsx`, `plotColor.ts`, `ValueAxis.tsx`;
- `apps/web/src/shared/lib/chart.ts`;
- `apps/web/src/entities/Daemon/model/Daemon.store.ts`;
- `apps/web/src/widgets/Daemon/DaemonTraffic/`, `widgets/ConnectionSummary/`, `widgets/ProxyLatency/`;
- `apps/web/src/pages/Overview/`.

## Consequences

### Positive

- The bars have a value axis, the traffic chart has a shared scale and a time axis only over accumulated time.
- The line does not chase a new point, the axis moves smoothly, and drawn values are always present in the data.
- The main chunk did not grow: the library lives in the overview chunk.
- Custom code in `shared/ui` no longer silently falls out of linting: vendor and custom code are split into directories.

### Negative

- **The cost of uPlot.** The `Overview` chunk is 79.44 kB (30.64 kB gzip) against 26.72 kB (7.35 kB gzip), styles +2.2 kB (+0.6 kB gzip). Main chunk: 365.10 → 365.12 kB (gzip 114.42 → 114.41). `pnpm build` on 2026-09-23.
- **Constant redraw.** While the overview is open, the traffic canvas is redrawn every frame. LoAF (Long Animation Frames) measurement on the test bench with mocks: 5 s, 709 frames, none long. The test bench with MSW distorts measurements; no profile was taken on the device.
- **Two chart mechanisms on one screen.** uPlot for traffic, SVG for "Connections per minute" and sparklines, HTML for the bars. The connections chart keeps the time axis defect on a buffer that is not full.
- **The shared scale presses outbound to the axis** when inbound spikes. The peak labels on the tiles next to it remain.
- **The traffic chart axis is a canvas.** Tick labels are not read by a screen reader and do not grow with font size after the chart is created. The image's accessible name states the peaks.
- **The colour is re-read on every draw.** `getComputedStyle` is called on every draw and for every colour.

### Neutral or deferred

- Moving `ConnectionHistory` and the sparklines to `Plot` is deferred.
- Network topology needs its own dependency; uPlot does not cover it.

## Risks and mitigations

| Risk                                                                                                 | Likelihood and impact | Mitigation                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Redrawing every frame is noticeable on a weak client                                                 | low, medium           | a profile on the device; if costly — cache colours until theme change and shift at 10–15 frames per second |
| uPlot calls the axis `size` before the first label computation (`values` is `null` despite the type) | found in the browser  | a guard in `fitAxis` with an explanation at the rule suppression                                           |
| The uPlot fake in tests drifts from the library                                                      | medium, medium        | a browser check of both themes and widths before handing over chart edits                                  |

## Compatibility, migration and rollback

The decision does not touch daemon data or contracts. To roll back:

1. return `DaemonTraffic` to SVG;
2. remove `uplot` from `apps/web/package.json`, the import of its styles from `index.css` and the fake from `src/test/setup.ts`;
3. delete `Plot` and `plotColor`.

`ValueAxis`, `toValueScale` and point times in the model do not depend on uPlot and stay.

## Validation

- `pnpm --filter web exec vitest run Plot DaemonTraffic chart Daemon.store ValueAxis`:
  - the wrapper does not recreate the chart on new data and calls `setData` with `false`;
  - the wrapper destroys the chart on unmount;
  - the halves have one edge;
  - on a partial buffer the axis is labelled "−15 s, now";
  - the axis moves per frame;
  - point times follow the stream step.
- `pnpm lint` — project rules apply to `Plot.tsx`, `plotColor.ts`, `ValueAxis.tsx`.
- `pnpm build` — `uplot` is in the `Overview` chunk, the main chunk did not grow.
- Browser at 1440×900 and 500×820 in both themes:
  - switching the theme redraws the canvas;
  - bar axis labels do not overlap;
  - idle rows have no tracks.

## Links

- PRD, AC-10 and AC-37 — overview, traffic and history;
- [ADR-0015](./ADR-0015-keep-traffic-history-in-the-daemon.md) — traffic history in the daemon;
- [ADR-0026](./ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md) — screen transitions; chart animations are excluded from it;
- `apps/web/src/shared/ui/Plot.tsx`, `apps/web/src/widgets/Daemon/DaemonTraffic/`, `apps/web/src/entities/Daemon/model/Daemon.store.ts`;
- [uPlot](https://github.com/leeoniya/uPlot) — `setData(data, resetScales)`, `setScale`, `paths.bars`.
