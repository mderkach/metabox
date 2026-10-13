# ADR-0026. Animate screen changes with the router and changes inside a screen with the React `ViewTransition` boundary

- Status: Accepted
- Date: 2026-09-19
- Deciders: repository owner
- Superseded by: [ADR-0049](./ADR-0049-slide-side-panels-and-float-the-apply-bar-with-css-transitions.md) — for the detail panels and the apply bar; screen changes by the router stay in force

## Context and problem statement

Before this decision the panel changed screens and showed panels instantly: a rule row opened the edit panel with a jump, the apply bar appeared without a transition, one screen was replaced by another in one frame. The PRD has no animation requirements. The closest one is UX-7: the system state is always in view. The apply bar and the panels are exactly this state in response to an action, and a layout jump does not show what appeared and from where — the eye looks for the change again.

The browser View Transitions API (`document.startViewTransition`) is available in the panel in two ways, and both are already in the dependencies:

- React 19.3 provides the `<ViewTransition>` boundary, which animates the appearance, disappearance and change of a subtree, but only for updates marked as a Transition: `startTransition`, `useDeferredValue`, a `Suspense` reveal. Next to it `<Activity>` hides a subtree while keeping its state.
- TanStack Router provides `defaultViewTransition`: it wraps the route commit in `document.startViewTransition` and can pass transition types to CSS.

A constraint set by the libraries: router components subscribe to its state via `useSyncExternalStore`, and React renders such updates synchronously, outside a Transition, even when the router itself wraps them in `startTransition`. Checked in the browser on 2026-09-19 with a stubbed `document.startViewTransition`: a `<ViewTransition>` boundary around `Outlet` did not call it once over two navigations. A boundary around the rule panel did fire on open and on close.

Both mechanisms call the same `document.startViewTransition`, and a new call interrupts the previous one. The decision must assign exactly one mechanism to each kind of change.

In scope: a screen change by URL; appearance and disappearance of panels, the apply bar, tabs; what stays in place during a transition and what moves; behaviour under the system "reduce motion" setting. Out of scope: chart animations and shared-element morphs between screens — the panel has no such element pairs yet.

## Decision drivers

1. **The transition fires.** Screen and panel changes are animated in Chromium and Safari; checked with a tool, not by eye.
2. **One call per change.** The mechanisms do not run `document.startViewTransition` at the same time for the same change.
3. **The shell does not flicker.** The sidebar and the apply bar do not fade on a screen change and stay clickable.
4. **Hidden state is kept.** Scroll, filters and tab focus survive a switch.
5. **The system setting is respected.** Under `prefers-reduced-motion: reduce` there is no motion.
6. **No new dependencies**, degrading to an instant change where the browser lacks the API.

## Considered options

1. **Screen change by the router, changes inside a screen by the React boundary.** The router gets `defaultViewTransition` with a types function: by the order of menu items it returns `page-forward`, `page-backward` or `page-fade`, and CSS reads them via `:active-view-transition-type()`. The screen, its header and the config tab strip are named with `view-transition-name`; the root stays live. Panels, the bar and tabs are wrapped in `<ViewTransition>`, and their state changes in `startTransition` or via `useDeferredValue`; tabs with state sit under `<Activity>`. Advantages: fires on all navigations (driver 1); the mechanisms are split by kind of change and do not overlap (2); the root is live, the shell does not flicker (3); `Activity` keeps the state (4); one CSS rule removes motion (5); no dependencies (6). Disadvantages: named elements receive no clicks during a transition — a specification limit; the transition direction ties the router to the sidebar menu order; in browsers without transition types the screen changes instantly. **Chosen.**

2. **A `<ViewTransition>` boundary around `Outlet`.** One line in the shell, one mechanism for everything. Disadvantages: does not fire on navigation because the router subscription renders synchronously (driver 1) — checked in the browser; it would fire only on a `Suspense` reveal, which does not happen when the route chunk and dictionaries are preloaded. **Rejected.**

3. **Everything through the router and a manual `document.startViewTransition`.** Animate panels and the bar with an own API call around `setState` with `flushSync`. Disadvantages: React forbids calling `startViewTransition` next to its boundaries — the calls interrupt each other (driver 2); enter and exit semantics by mount and the link with `Activity` are lost (4); an own animation scheduler appears next to two ready ones. **Rejected.**

4. **CSS without View Transitions: `@starting-style`, keyframes on mount, `tw-animate-css` classes.** Advantages: no JS. Disadvantages: an element's disappearance is not animated unless it is held in the DOM by hand; a screen change is not animated at all — the old screen is no longer in the DOM (driver 1). **Rejected.**

5. **An animation library (`motion`).** Advantages: ready `AnimatePresence` and layout animations. Disadvantages: a new dependency of tens of kilobytes for what the browser and React already do (driver 6); the screen change would still have to be wired to the router separately. **Rejected.**

6. **Leave without animation.** Zero code and risk. Disadvantages: layout jumps on panel open and screen change remain, the link between action and result reads worse. **Rejected.**

## Decision outcome

A screen change is animated by the router, changes inside a screen by React. Rules:

- **Router.** `createRouter` gets `defaultViewTransition: { types: toPageTransitionTypes }` (`apps/web/src/app/router/Router.transition.ts`). The type is computed from the order of `NAV_TARGETS` menu URLs via `pickActiveNav`: moving down the menu is `page-forward`, up is `page-backward`, paths outside the menu are `page-fade`. A transition inside a section — when the URLs share the first segment — gets `page-hold`: there the layout holds the shell, and it stays put, while shifting the content under a still header would read as a jerk; the tab strip itself shows the direction: the current tab is underlined as usual, without a moving animation. Two of the three section URLs are adjacent items in the menu, and the sidebar highlight jumps between them — this is the cost of the decision, not an oversight. The first visit and a change of URL parameters only get no transition. Do not put a `<ViewTransition>` boundary around `Outlet`.
- **Named groups.** `view-transition-name` is carried by the shell `<main>` (`page`), the screen header `PageHeader` (`page-header`), and the config tab strip (`config-tabs`). The root is live: the old root snapshot is hidden, the new one is not animated. Outside a router transition — during React animations — named groups stay live without a snapshot and fade; they are animated only under the router's `:active-view-transition-type()`. A new name is added to both rule branches of `index.css`: the common one, where the group stays live, and the one under `:active-view-transition-type()`, where it is animated.
- **Section shell.** A transition group is assembled by name, not by whether its carrier was remounted. The header and tab strip of the configuration section live in the layout route and survive a transition between tabs, but they still have two snapshots. The transition type tells these cases apart, not `:only-child`: under `page-hold` the shell stays live, only the content changes. The header has a snapshot pair on any navigation — it stands on every screen — so `:only-child` does not fit it at all; for the tab strip the branch stays: with a pair it stays put, without a pair it leaves together with the content.
- **React.** Appearance and disappearance inside a screen use a `<ViewTransition>` boundary with `enter`/`exit` classes, and the state change goes in `startTransition` or via `useDeferredValue`. A boundary around live-updating content gets `default='none'`, otherwise every row update is animated. `document.startViewTransition` is not called by hand.
- **The apply bar is CSS, not a boundary.** The bar sits above `<main>`, and `<main>` is the named group `page`: outside a router transition it stays without animation, and a boundary around the bar would animate only the bar while the screen under it jumps by the bar height. So the bar is always mounted, and its height is animated by a `grid-template-rows` transition from `0fr` to `1fr` on the same duration variables; under "reduce motion" the transition is removed.
- **Tabs with state.** A tab panel stays in the DOM (`keepMounted`) under `<Activity>`, and the `<ViewTransition>` boundary sits right under `Activity`, before the first DOM node.
- **Motion.** Durations and curves are set by the `--view-transition-*` variables in `apps/web/src/app/styles/index.css`, keyframes live there too; there are no separate `.css` files or inline animation styles. The `prefers-reduced-motion: reduce` rule zeroes the duration and delay of all transition pseudo-elements. The transition layer does not capture the pointer.

Non-goals: shared-element morphs between screens, animating a `Suspense` reveal and list row reordering — data comes through Query, and lists are virtualized.

### Scope and boundaries

`apps/web/src/app/router/`, `apps/web/src/app/ui/AppLayout.tsx`, `apps/web/src/app/ui/ConfigLayout.tsx`, `apps/web/src/app/styles/index.css`, `widgets/PageHeader`, `widgets/Config/ConfigTabs`, `widgets/AppSidebar` (menu order), screens and features with `<ViewTransition>` boundaries.

## Consequences

### Positive

- Screen changes, panel opening, the bar appearing and tab switching are animated, and each change has one mechanism.
- The transition direction follows movement through the menu: the screen leaves the way the menu item moved.
- The shell does not flicker and is not blocked during a transition.
- The hidden connections tab keeps its scroll, column filters and focus.

### Negative

- Named elements — the screen, the header, the tab strip — receive no clicks while a transition runs: up to 260 ms after a screen change and up to 140 ms after a panel opens. A specification limit, CSS does not remove it.
- Both connections tabs are mounted at once: the footer is in the DOM twice, and the closed connections table lives in memory while the active one is open. Search and slices sit in one toolbar above the tabs.
- The router depends on the menu item order: the app imports `NAV_TARGETS` from the sidebar widget.
- In browsers without `:active-view-transition-type()` the screen changes instantly: the router passes a transition without types, and named groups stay pinned.
- Animations are checked with a tool — by stubbing `document.startViewTransition` and `document.getAnimations()` — not by unit tests: jsdom has no such API.

### Neutral or deferred

- Shared elements between screens (morphing a row into a panel, a connection node into a config node) will come as a separate decision once they have a pair.
- A fade on data reveal is possible only after Query moves to `Suspense` — outside this decision.

## Compatibility, migration and rollback

The decision does not touch data or contracts. Rollback: remove `defaultViewTransition` from the router, the `[view-transition-name:…]` classes from four elements and the View Transitions block in `index.css`; the `<ViewTransition>` and `<Activity>` boundaries keep working independently and can be removed one at a time.

## Validation

- `pnpm --filter web exec vitest run Router.transition` — direction by menu, fade for URLs of one item and paths outside the menu, no transition on the first visit and on a parameter change.
- A browser with a stubbed `document.startViewTransition`: one sidebar navigation gives exactly one call with type `page-forward` or `page-backward`; `document.getAnimations()` after `ready` holds `page-out` and `page-in` on `::view-transition-old(page)` and `::view-transition-new(page)`, `fade-out` and `fade-in` on the header.
- Opening the rule panel on the configuration screen and switching connections tabs give a call without types, in which the `page` and `page-header` groups have zero duration.
- Emulating `prefers-reduced-motion: reduce`: the durations of all `::view-transition-*` are zero.
- `pnpm lint` — the Tailwind rules accept the `[view-transition-name:…]` classes.

## Links

- PRD, UX-7 — the system state is always in view;
- `apps/web/src/app/router/Router.transition.ts`, `apps/web/src/app/router/Router.tsx`, `apps/web/src/app/ui/AppLayout.tsx`, `apps/web/src/app/styles/index.css`;
- `apps/web/src/widgets/PageHeader/ui/PageHeader.tsx`, `apps/web/src/widgets/Config/ConfigTabs/`, `apps/web/src/widgets/AppSidebar/model/AppSidebar.constants.ts`;
- `apps/web/src/pages/Connections/ui/ConnectionsPage.tsx`, `apps/web/src/pages/Editor/ui/EditorPage.tsx`, `apps/web/src/features/Config/ConfigApply/ui/ConfigApplyBar.tsx`;
- [React: `<ViewTransition>`](https://react.dev/reference/react/ViewTransition), [React: `<Activity>`](https://react.dev/reference/react/Activity), [React 19.3](https://react.dev/blog/2026/09/09/react-19-3);
- [TanStack Router: `defaultViewTransition`](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultviewtransition-property);
- [CSS View Transitions Module Level 2](https://drafts.csswg.org/css-view-transitions-2/) — `:active-view-transition-type()`, `:only-child` on transition pseudo-elements;
- [csswg-drafts #10930](https://github.com/w3c/csswg-drafts/issues/10930) — named transition participants are skipped in hit-testing.
