# ADR-0013. Build the panel palette on routing semantics, not on a neutral preset

- Status: Accepted
- Date: 2026-09-13
- Deciders: repository owner

## Context and problem statement

Before this decision, the theme tokens in `apps/web/src/app/styles/index.css` were the neutral shadcn preset verbatim: all colors of the form `oklch(x 0 0)`, that is, with zero chroma, and `--chart-1…5` were five shades of grey. Yet the panel's subject is categorical by nature: a packet goes `direct`, `proxy` or to a block; a node answers fast, slowly or not at all; a config is applied, sits as a draft or is rolled back.

What this cost on a live router (captured 2026-09-13 on a working config):

- The selected proxy node did not stand out from its neighbours. The data arrived and the code computed it (`Proxy.adapter.ts` moves `now` into `selected`), but the selection mark was a `bg-muted/60` fill over `bg-card`: in the dark theme this is oklch 0.243 against 0.196, a lightness difference of 0.038. The screen's main fact did not come across at all.
- A selected rule row differed from the row under the cursor by ten percent alpha: `bg-muted/60` against `bg-muted/50`.
- The traffic chart series were separated only by lightness, because the palette had no colored tokens. On live data the grey upload series merged with the grey grid; this is written right in a comment in `DaemonTraffic.tsx`.
- Color did appear in the project, but bypassing the tokens: `bg-emerald-400` and `bg-amber-400` are written as literals into the proxy node row, because there were no tokens for latency.

The constraints were set earlier. Primitives come from the shadcn vendor zone (`apps/web/AGENTS.md`), and it reads colors from CSS variables, so the palette changes in one file and reaches all components without editing the components themselves. Font sizes and radii must be multiples of two, and sizes must be in `rem` ([Architecture and style guide](../../apps/web/docs/guides/Architecture&Style.md)).

In scope: the set of theme tokens, the set of semantic roles and where they are declared. Out of scope: the layout of screens and the composition of their data.

## Decision drivers

1. **A rule's action is distinguishable before reading the text.** `direct`, `proxy`, `block` and DNS hijacking are four different fates of a packet.
2. **Selection is distinguishable from hover** without peering.
3. **Color lives in tokens.** A Tailwind palette literal in a component is a sign of a missing token, not a solution.
4. **One system for both themes.** The hues of the light and dark themes match in meaning and differ in lightness.
5. **Zero cost for the vendor zone.** shadcn primitives are not edited.

## Considered options

1. **Keep the neutral preset and distinguish states only by lightness.** Pros: nothing to edit. Cons: in the dark theme the lightness step between surfaces is physically small, which is what was observed (drivers 1, 2); color leaks in as literals anyway (driver 3). **Rejected.**

2. **Take a colored shadcn preset as a whole.** Pros: ready-made tokens for both themes. Cons: the preset gives an accent and charts but no domain roles: the rule action and the node state would still have to be added on top of it (drivers 1, 3); someone else's palette brings hues the subject does not need. **Rejected.**

3. **Semantic tokens on top of our own base.** Pros: roles are named after the subject (`--route-direct`, `--signal-warn`, `--series-down`), they are visible in the markup and checkable; the base shadcn roles stay in place, so the vendor zone is not touched (driver 5). Cons: the token set grows and has to be kept in two themes. **Chosen.**

## Decision outcome

**The base is near-black with a cold undertone**, hue 265 at chroma 0.006–0.012. The scene is given: the panel is opened in a terminal next to an ssh session to the router, more often in the evening. The dark theme is the main one, and the light theme is fully built.

**Three action roles and one neutral.** `--route-direct` is teal, `--route-proxy` is azure, `--route-block` is pink, `--route-dns` is violet, `--route-neutral` is a muted grey for actions like `sniff` that are not a traffic exit. The mapping "action string → tone" is set by a substring table in `ConnectionAction.ts` and `RuleTargetTone.ts`, not by a chain of conditions: a new kind of node is added with an entry.

**State reuses the same hues.** `--signal-ok` matches `direct`, `--signal-bad` matches `block`, `--signal-warn` is amber. The palette stays one system, not two parallel ones.

**Selection is a separate surface, not alpha.** `--selected` is one step lighter than the card (oklch 0.295 against 0.196), `--selected-edge` is an accent edge. A rule row and a connection row carry both marks at once, a proxy node tile carries the edge and a check mark, so one of the marks is not color-based.

**Chart series are separated by hue.** `--series-down` is azure, `--series-up` is amber.

**There is one accent: azure.** It is also `--primary` and `--ring`. Unlike competitors on the same router, which use amber with magenta, a neutral grey-green or orange with teal, this is a distinguishable position.

**The color scheme is declared explicitly.** `color-scheme: light` and `color-scheme: dark` in the theme blocks. Without the declaration, a browser with automatic dark mode recolors the light theme itself, and draws native elements (the scrollbar, the caret, a checkbox) from the system setting, not from the panel theme.

**The font size scale and radii are set explicitly.** The steps 10/12/14/16/18/22/28/36 and the radii 8/10/14/16/20/24/32 are declared in `@theme inline` as a list, not as a multiplier from a base: the shadcn multiplier gave 6/8/10/14/18/22 and contradicted the multiple-of-two requirement.

### Scope and boundaries

The decision covers `apps/web/src/app/styles/index.css` and the tone mapping tables in widgets. The `shared/ui` vendor zone is not edited: the primitives read the same variables as before.

## Consequences

### Positive

- The selected node, the selected rule and the rule action are distinguishable at a glance on all three runtime screens.
- Color stopped leaking into components as Tailwind palette literals.
- The light theme became usable rather than a dead block of CSS: it has a switch and is declared to the browser.
- The font size and radius scale now matches the style guide.

### Negative

- There are noticeably more tokens, and each is declared twice, in the light theme and in the dark one. A mismatch between the themes is caught only by eye.
- The mapping "action string → tone" works on substrings of a tag the user writes. An outbound named `directional` gets the `direct` tone. The panel has no exact source: the node type exists only for config outbounds, while connections bring a runtime string.
- The light theme was built by computing lightness, and the step mirroring the dark theme turned out too small for a white background: a browser measurement on 2026-09-13 gave 3.53–4.40 against a 4.5 threshold for the amber `--signal-warn` and `--series-up`. Both were darkened to `oklch(0.51 0.13 70)`, and the measurement was repeated. Computing lightness does not replace a measurement against the background the color sits on.

### Neutral or deferred

- The chart tokens `--chart-1…5` are removed: nobody used them, and charts now take `--series-*`.
