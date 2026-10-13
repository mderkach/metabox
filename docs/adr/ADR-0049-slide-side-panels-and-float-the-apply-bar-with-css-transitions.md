# ADR-0049. Slide panels in with a CSS transition and change the list width once, and keep the apply bar as a floating layer

- Status: Accepted
- Date: 2026-10-11
- Deciders: repository owner
- Supersedes: [ADR-0026](./ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md) in the part about detail panels and the apply bar; the "Panel appearance" rule in [ADR-0037](./ADR-0037-edit-nodes-in-a-panel-beside-the-list.md)

## Context and problem statement

After deployment to the router the owner named three defects that, per ADR-0026, work as designed:

- The right detail panel at `lg` width and wider (rule, rule set, section node, route explanation) appears jerkily and leaves an artifact on close. The cause is in how the decision works: the panel sits in a flex row next to the table, and the table narrows by the panel width in a single frame, without a transition. The `<ViewTransition enter='panel-in'>` boundary animates only the snapshot of the panel itself: 140 ms of opacity and a `0.5rem` shift. On close the old snapshot fades on top of the already widened table, and that is the artifact. The `onMoved` and `onDeleted` paths in `Editor.lib.ts` bypassed `startTransition`, so they did not get even this animation.
- The bottom sheet at narrow width (`Sheet`, `side='bottom'`) "appears without animation". The vendor `sheet.tsx` shifts the sheet by `2.5rem` with a height of up to `85svh`, and the eye reads it as a flash. The overlay blur (`backdrop-blur-xs`) adds a heavy full-screen repaint.
- The apply bar shifts the page. Per ADR-0026 it sits in the flow above `<main>`, and on the first edit the whole screen, together with the row being edited, moves down by its height.

In scope: detail panels on four screens (`pages/Editor`, `pages/RuleSets`, `pages/Section`, `pages/Connections`), bottom sheets, the apply bar. Out of scope: transitions between screens, which stay with the router per ADR-0026; stateful tabs under `<Activity>`.

Constraints: the vendor zone `shared/ui/shadcn` is not edited by hand; raw CSS lives only in `src/app/styles/index.css`; no new dependencies without need; tables are virtualized (`@tanstack/react-virtual`) and wrap rows when the width changes.

## Decision drivers

1. **The table does not jerk.** During the transition the row heights and column widths of the list do not change, and the rows below do not jump.
2. **Close without an artifact.** The panel content is visible until the end of the slide-out, there are no snapshots on top of live markup.
3. **The selected row is fully visible.** The panel does not cover the "Outbound" and "Hits" columns for which it is opened.
4. **The screen does not shift** when the apply bar appears.
5. **One mechanism for all screens with a panel**, without a mandatory `startTransition` on every open and close path.
6. **`prefers-reduced-motion` is respected** and there is a fallback to an instant change.
7. **No new dependencies.**

## Considered options

1. **A panel column in a grid with the width changing once; only the panel moves.** A `minmax(0,1fr) | panel width` grid: on open the column appears at once, on close it collapses on the panel's `transitionend`. The panel itself slides in with a `translate` and `opacity` transition inside a column with `overflow-clip`. Measurement at 1440 px: column widths and row heights do not change during the slide-out, `translate` goes 83%→0 on open and 0→100% on close. Drawbacks: the table wraps rows once, at the start or at the end of the transition, not smoothly; focus returns to the opener after the slide-out, up to 180 ms. **Chosen.**
2. **A `grid-template-columns` transition from zero to the panel width.** Smoothly changes the width of both the list and the panel. Measurement at 1440 px: frames of about 7 ms, but the table rows wrap in the middle of the animation: 4 rows out of about 20 visible grew from 45 to 67 and from 49 to 75 px, the rows below jump by 22–26 px. The same jerkiness, only stretched in time (driver 1). **Rejected.**
3. **An overlay panel on top of the table.** The table does not change width at all, the panel slides in as a layer from the right. Drawback: it covers the "Outbound" and "Hits" columns of the selected row (driver 3). **Rejected.**
4. **Keep the `<ViewTransition>` boundary (ADR-0026).** No code. Drawbacks: the snapshot on top of the widened table is the close artifact (driver 2); every open and close path has to go through `startTransition`, and a missed path silently loses the animation (driver 5). **Rejected.**
5. **The `motion` library.** Ready-made `AnimatePresence` and layout animations. Drawbacks: a new dependency (driver 7); a layout animation of the list runs into the same row wrapping as option 2. **Rejected.**
6. **The apply bar in the flow above `<main>`, a `grid-template-rows` transition (ADR-0026).** No code. Drawback: the screen moves by the bar height (driver 4). **Rejected.**
7. **The apply bar in the flow below `<main>`.** The top of the screen stays. Drawbacks: the bottom edge of the scroll area jumps, and the bar stops being a layer on top of the content. **Rejected.**
8. **The apply bar as a floating layer at the bottom of `<main>`.** `absolute`, centered, with a limited width, appearing with an upward shift and opacity. Space under it is a `padding-bottom` on `<main>` equal to the measured height while the bar is visible, so that the last rows do not go under the bar. Drawback: the bar covers the bottom part of the content until it is scrolled. **Chosen.**

## Decision outcome

- **The detail panel is `SidePanelLayout`** in `apps/web/src/shared/ui/SidePanelLayout.tsx`, a compound `Root`/`Main`/`Panel` component without domain state. Pages only compose it. The list width changes exactly once: on open the panel column appears at once, on close it collapses on `transitionend`. Only the panel moves: `translate` and `opacity`. A closed panel immediately gets `inert` and `aria-hidden`, and keeps its content until the end of the slide-out. Changing the selected object while the panel is open does not touch the column. No `<ViewTransition>` boundary is placed around the panel, and opening does not require `startTransition`.
- **The bottom sheet** gets `SHEET_BOTTOM` from `apps/web/src/shared/ui/styles.ts`: it slides in from fully below the bottom edge (`translate-y-full`), without fading. The classes are passed to `SheetContent` from outside, and `twMerge` removes the vendor classes. The overlay blur is removed by the `[data-slot='sheet-overlay']` rule in `index.css` for all sheets. A sheet with a body from a query (`RouteExplanation`) keeps a constant height so that it does not jump while the data arrives. The sheet is always mounted and controlled by `open`, not by conditional mounting.
- **The apply bar** is a floating layer at the bottom of `<main>` (`AppLayout.tsx`, `ConfigApplyBar.tsx`). The bar reports the height it takes through `onSpaceChange`, and `<main>` gets the same `padding-bottom`. The bar has `view-transition-name: apply-bar` and stays live in all rule branches: otherwise on a screen change the `page` group would cover it with a snapshot.
- **Motion** is set by the variables `--motion-enter` (240 ms), `--motion-exit` (180 ms), `--motion-sheet-enter` (280 ms), `--motion-sheet-exit` (200 ms) and `--motion-ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) in `index.css`. Leaving is faster than arriving. With `prefers-reduced-motion: reduce` the transitions are removed, and code that waits for `transitionend` checks the setting itself: with the transition removed there will be no event.
- Screen changes by the router, the named groups `page`, `page-header`, `config-tabs` and the tabs under `<Activity>` stay per ADR-0026.

### Scope and boundaries

`apps/web/src/shared/ui/SidePanelLayout.tsx`, `apps/web/src/shared/ui/styles.ts`, `apps/web/src/app/styles/index.css`, `apps/web/src/app/ui/AppLayout.tsx`, `apps/web/src/features/Config/ConfigApply/ui/ConfigApplyBar.tsx`, the `Editor`, `RuleSets`, `Section`, `Connections` pages and the sheets of the `RulePanel`, `RuleSetPanel`, `ConfigNodePanel`, `RouteExplanation` widgets.

## Consequences

### Positive

- The table stays still while the panel slides out: columns and rows are not re-laid out, and the eye follows one moving object.
- Closing leaves no snapshot: the panel leaves with its content.
- The animation does not depend on whether the open path is wrapped in `startTransition`: a missed path no longer loses it.
- The screen does not move on the first edit, the row being edited stays under the cursor.
- The bottom sheet reads as a slide-in, not a flash; an overlay without blur is cheaper on weak devices.

### Negative

- The table still wraps rows once, at the start of opening or at the end of closing. The wrap is instant and coincides with the start or end of the panel movement.
- Focus returns to the opener after the panel slides out, up to 180 ms; Tab in this window starts traversal from the beginning of the document.
- The apply bar covers the bottom part of the content until it is scrolled; long `sing-box check` output scrolls inside the bar, whose height is limited to `60svh`.
- Without blur the sheet overlay darkens the background less; this is a matter of taste.
- On the connections screen the route explanation panel no longer sits under `<Activity>`: when tabs are switched it unmounts, the data comes from the Query cache, and the panel's local state is lost.

### Neutral or deferred

- Transitions between screens do not change and stay in ADR-0026.
- Shared element morphs between the list and the panel are still outside the decision.

## Compatibility, migration and rollback

The decision does not touch data or contracts. The migration was done in one change on all four screens. Rollback: return the `<ViewTransition enter='panel-in' exit='panel-out'>` boundaries with keyframes in `index.css` and `startTransition` in the open paths, return the bar to the flow above `<main>` with a `grid-template-rows` transition, remove `SHEET_BOTTOM` and the overlay rule. ADR-0026 and ADR-0037, in the part about panels and the bar, link here with the "Superseded by" field; ADR-0026 still defines screen transitions by the router.

## Validation

- `pnpm --filter web exec vitest run src/shared/ui`: `SidePanelLayout`: opening with focus, keeping the content until `transitionend` and returning focus, changing content without closing, instant removal with reduced motion.
- `pnpm --filter web exec vitest run AppLayout ConfigApplyBar`: the bar stands after `<main>`, `<main>` gets a `padding-bottom` equal to the bar height and zero after the draft is reset.
- A browser at 1440 px, the dev test bench with mocks: when the rule panel opens and closes, the table's column widths and row heights are constant between transition frames, only the panel's `translate` changes; `main.top` is the same before and after the bar appears.
- A browser at 375 px: the rule sheet slides in from the bottom edge with a constant height; the bar stands above the bottom navigation.
- `grep -rn "panel-in\|panel-out" apps/web/src` finds nothing.

## Links

- PRD, UX-7: the system state is always in view;
- [ADR-0026](./ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md): screen transitions by the router and React boundaries;
- [ADR-0037](./ADR-0037-edit-nodes-in-a-panel-beside-the-list.md): editing nodes in a panel next to the list;
- `apps/web/docs/guides/Architecture&Style.md`, section "Transition animation";
- `apps/web/src/shared/ui/SidePanelLayout.tsx`, `apps/web/src/shared/ui/styles.ts`, `apps/web/src/app/styles/index.css`, `apps/web/src/app/ui/AppLayout.tsx`, `apps/web/src/features/Config/ConfigApply/ui/ConfigApplyBar.tsx`.
