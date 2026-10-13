# ADR-0037. Create and edit a node in a panel next to the list, not in a form inside the list

- Status: Accepted
- Date: 2026-10-04
- Deciders: repository owner
- Superseded by: [ADR-0049](./ADR-0049-slide-side-panels-and-float-the-apply-bar-with-css-transitions.md), in the part of the "Panel appearance" rule

## Context and problem statement

The review item "The same situations are solved with different idioms", after the UX pass of 2026-09-23, left one point open: editing a config entity is solved with three techniques.

- **A routing rule** is edited in an `aside` panel next to the list (`widgets/Rule/RulePanel`). Below `lg` the same panel opens as a bottom sheet (`RulePanelSheet`, `usePanelAsSheet` from `shared/lib/media.ts`, the `PANEL_AS_SHEET` query). The route explanation on the connections screen opens the same way (`widgets/RouteExplanation`).
- **A rule set** is added with a form that sits in the table card under the toolbar, above the rows (the `form` slot of `widgets/RuleSet/RuleSetTable`, `pages/RuleSets/ui/RuleSetsPage.tsx`). Editing an existing rule set does not exist at all: a row can only delete.
- **A node of a generic section** is edited in its own card on the section screen (`pages/Section/ui/SectionPage.tsx`): the "Form" tab is built from the type schema by the [ADR-0035](./ADR-0035-render-node-forms-from-the-generated-schema.md) renderer, the "JSON" tab is the embedded node editor (`widgets/Config/ConfigNode`). There is no separate node list: the stack of cards is the list.

The empty rule sets screen is an exception to all three: it shows the connection form right away rather than a button that opens it. The `RuleSetsPage` TSDoc names the reason: for a new user the section is always empty, and there is nowhere else to explain why rule sets are needed.

The decision is needed now: the ADR-0035 renderer started producing forms for section nodes, and each new type with a form fixes its own technique on the section screen. Without a common rule the next screen chooses the place anew, and a fourth technique joins the three.

In scope: where on the screen creating and editing a config node opens, how that place behaves at narrow width, when a form outside that place is allowed. Out of scope: the set of forms, the auto-form itself (ADR-0035), the panel appearance animation ([ADR-0026](./ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md)).

## Decision drivers

1. **The list is visible during editing.** Rules and rule sets are edited while looking at their neighbours: rule order is routing logic, and the name of a new rule set must not match a connected one.
2. **The virtualized list does not break.** Rule and connection rows are absolutely positioned (`Tables.md`, "Virtualization instead of pagination"): a form inserted between rows requires recalculating heights.
3. **One mechanism for all screens.** Focus, Escape, focus return, the sheet at narrow width and the transition boundary are written and tested once per technique, not per screen.
4. **Narrow width.** Below `lg` there is no room next to the list, and below it the form falls below the fold.
5. **Transition cost.** The existing rule and route panels are not rewritten.

## Considered options

1. **A panel next to the list, a sheet below `lg`.**
   - The list stays on screen and keeps its scroll and filter (driver 1); rows do not move apart (2).
   - The technique already works for the rule and the route explanation: focus, Escape, `useFocusReturn` and the sheet are covered by the `EditorPage.test.tsx` tests (3, 5).
   - Below `lg` the sheet covers the list, but it closes by swipe, Escape and a button (4).
   - Minus: at `lg` and wider the panel takes up to `max-w-md` from the list.
   - Minus: each entity has two components, a panel and a sheet.
   - **Proposed for acceptance.**
2. **A form inside the list: under the toolbar or by expanding a row.**
   - This is how a rule set is added today.
   - Under the toolbar the form pushes the rows down, and at laptop height two or three rows of the list remain (driver 1).
   - Expanding a row in a virtualized list breaks the height calculation (2).
   - Each list has its own place, so its own focus and Escape handling (3).
   - **Rejected.**
3. **A separate URL for editing a node.**
   - Plus: editing can be opened by a link.
   - The list leaves the screen entirely (driver 1), and the router transition with `page-hold` animates a content change, not a panel appearance (ADR-0026).
   - The URL already leads to the selection: `?rule=` on the rules screen opens the panel without a separate route.
   - **Rejected.**
4. **A modal dialog.**
   - Covers the list and traps focus: the neighbours are not visible (driver 1).
   - At narrow width the sheet already is the modal variant of the panel; a separate dialog adds nothing.
   - **Rejected.**
5. **Keep the three techniques.** Nothing to rewrite. A fourth technique arrives with the ADR-0035 forms, and the 2026-09-22 review requires one idiom per situation. **Rejected.**

## Decision outcome

Creating and editing a config node opens in a panel next to the list:

- **Panel**: an `aside` with `SURFACE` and the `SURFACE_HEAD` header. The panel title is an `h2`; on open, focus moves to it (`useFocusReturn`), on close focus returns to where the panel was opened from. Escape inside the panel closes it. The close button is in the header.
- **Width.** At `lg` and wider the panel stands to the right of the list in one layout row. Below `lg` it opens as a bottom sheet (`Sheet`, `side='bottom'`) via `usePanelAsSheet`. The sheet is part of the panel widget, not the page, and keeps the last content while closing.
- **The list does not hold forms.** A list card is the toolbar, facets, header, rows, footer (`Tables.md`, "Anatomy"). The table has no slot for a form. The "add" button in the toolbar opens the panel.
- **Exception: an empty screen as onboarding.** When the list is empty and the empty screen explains why the section is needed, the create form is shown on it right away, not behind a button. As soon as the first node appears, creation moves to the panel.
- **Panel appearance**: the `<ViewTransition enter='panel-in' exit='panel-out'>` boundary and the state change inside `startTransition` (ADR-0026).

Screen by screen transition:

- the rule and the route explanation already follow the decision;
- rule sets move to the panel in the same change: `widgets/RuleSet/RuleSetPanel`, the `form` slot of `RuleSetTable` is removed;
- on the section screen node creation already opens in a panel (`widgets/Config/ConfigNodePanel`), and editing moves in a separate change: node cards become list rows, and `ConfigNode` with the "Form" and "JSON" tabs becomes the panel content. Until then, section node editing is a known exception.

Non-goals: a shared panel component in `shared/ui`. While there are three panels and each has its own header, a shared frame would cost a prop for every difference. Editing an existing rule set is a separate task; when it appears, it opens in the same panel.

### Scope and boundaries

`apps/web/src/widgets/Rule/RulePanel`, `apps/web/src/widgets/RouteExplanation`, `apps/web/src/widgets/RuleSet/RuleSetPanel`, `apps/web/src/widgets/RuleSet/RuleSetTable`, `apps/web/src/pages/Editor`, `apps/web/src/pages/RuleSets`, `apps/web/src/pages/Section`, `apps/web/src/widgets/Config/ConfigNodePanel`, `apps/web/src/widgets/Config/ConfigNode` (editing: in a separate change).

## Consequences

### Positive

- Adding a rule set does not shift the list: rows stay in place, and the name of the new rule set is typed next to the taken ones.
- Future section node forms have a ready place, and it does not have to be chosen anew.
- Focus, Escape and the sheet are tested with the same tests on every screen.

### Negative

- At `lg` and wider an open panel narrows the list by up to `max-w-md`; at a width around `lg` the rule set columns are tighter.
- Each entity keeps a "panel and sheet" pair: the header and closing have to be repeated in two components while there is no shared frame.
- The rule set create form lives in two places: on the empty screen and in the panel. A change to the form shows in both.
- Section node editing remains an exception until it is moved: the form and JSON are embedded in the node card there.

### Neutral or deferred

- A shared panel frame in `shared/ui` is a separate decision, once there are more than three panels or their headers converge.

## Compatibility, migration and rollback

The decision does not touch the daemon contracts or the config format. Migration is screen by screen, see the list above. Rollback for rule sets: return the `form` slot of `RuleSetTable` and the form under the toolbar; the rule and route panels do not depend on it.

## Validation

- `pnpm --filter web exec vitest run RuleSetsPage EditorPage`: the toolbar button opens the panel with focus on the title, Escape closes it and returns focus, below `lg` a sheet opens instead of the panel.
- `RuleSetTable` does not accept a `form` prop: `pnpm --filter web build` fails on an attempt to pass it.
- Manual check at a width under 64rem: the rule and rule set panels open as a bottom sheet.

## Links

- [ADR-0026](./ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md): the `ViewTransition` boundary around the panel;
- [ADR-0028](./ADR-0028-show-loading-as-a-delayed-skeleton-and-read-states-from-the-query.md): the 2026-09-22 review the section grew out of;
- [ADR-0035](./ADR-0035-render-node-forms-from-the-generated-schema.md): section node forms;
- `apps/web/docs/guides/Tables.md`, sections "Anatomy" and "Virtualization instead of pagination";
- `apps/web/src/widgets/Rule/RulePanel/ui/RulePanel.tsx`, `RulePanelSheet.tsx`, `apps/web/src/shared/lib/media.ts`, `apps/web/src/shared/lib/useFocusReturn.ts`.
