## Why

Issue #396, change 3 of the redesign in #395. A newcomer (persona P3, `docs/PRD.md` section 2.1) thinks "device → site → how it gets there" and does not know what a rule, an outbound, a group or a server is. No screen of the panel explains how the router handles a connection: Overview and the Connections screen show the result in schema words, and the redesigned Overview leaves the explanation to a section of its own. The panel already has the data for it: the route explanation of a connection (`GET /api/connections/{id}/route`) returns the matched rule, its index in the config and the chain of outbounds.

## What Changes

- **A "How metabox works" section**, a new screen at `/how-it-works`. On a wide screen it is the first sidebar item, above Overview. On a phone it is the first item of the "More" sheet: the bottom bar keeps its five sections, and the panel root keeps opening Overview there.
- **The walk of one live connection**: device → destination → rule → outbound → server, built from the connection stream, the route explanation, the proxy groups of the core, the subscriptions and the device list. An arrow joins two steps and means only "the connection goes on"; the choice a group made is a nested block inside the outbound step, not another arrow. Every step carries its origin, as on the Connections screen. The rule step shows the rule name, or its content label when it has none (AC-86), read from the applied config and only when the rule number can be trusted. The panel offers up to three live connections of different kinds (through a group, straight to a server, direct) and does not reshuffle them while the stream updates.
- **The eight terms**: device, service, rule, outbound, group, server, subscription and core. Each has a one-sentence definition in the words of `apps/web/docs/guides/Glossary.md`, in English and Russian, and a link to the screen where it is configured or shown today. Selecting a step of the walk shows its term. The Russian text calls an individual proxy server «сервер».
- **States without a walk**: a router with no connections shows the steps without values, a stopped core shows its state instead of the walk; both keep the terms, and no example connection is invented.
- No daemon change: every value comes from endpoints the panel already calls. The subscription model of the panel keeps the names of its servers, which the providers endpoint already returns.

## Capabilities

### New Capabilities

- `how-it-works`: the help section: its place in the menu (AC-105), the walk of one live connection (AC-106), the eight terms with their links (AC-107).

### Modified Capabilities

None. AC-42 is not modified: the bottom bar keeps five sections and "More", and the panel root keeps opening Overview on a phone.

## Impact

- Panel: a new page slice `apps/web/src/pages/HowItWorks` with its `i18n/{en,ru}.json`; a route in `apps/web/src/app/router/Router.tsx`; a new first entry of `NAV_ITEMS` in `apps/web/src/widgets/AppSidebar/model/AppSidebar.constants.ts` with its label in `shared`. It reads `@entities/Route`, `@entities/Connection`, `@entities/Proxy`, `@entities/Device`, `@entities/Daemon`, `@entities/Rule` and `@entities/Config` through their public API. `ProxyProvider` in `@entities/Proxy` keeps the names of a subscription's servers. Reuse the origin mark from the RouteExplanation widget and the confirmed rule identity from AC-103. Consume the shared editor target for deep links.
- Mock stand: the existing handlers cover the endpoints; fixtures get a connection through nested groups and a direct one, with neutral names.
- Documents: `docs/Verification.md` (rows for AC-105…AC-107), `README.md` and `README.ru.md` (the list of screens).
- No API, config format, daemon or schema change. No new dependency.

Closes #396. Refs #395.

## Out of scope

- Re-pointing the "Where it is configured" links to the redesigned screens: each change of #395 that replaces a screen re-points its link (the Routes change for rule, service and outbound; the Proxies change for group, server and subscription; the Devices change for device).
- A link to "How metabox works" from other screens. Overview does not link to it, by the owner's decision recorded in `overview-for-newcomers`; the Routes and Proxies changes of #395 decide in their briefs.
- A "show this connection in How metabox works" action on the Connections screen: not asked for; the Connections screen keeps its own route explanation.
- Explaining why the rules above did not match, or that a host belongs to a service: that is evaluation of rules, which the route explanation does not do. The rule step names the matched rule and the services it uses, not "this site is in this service".
- A batch route explanation endpoint: the Devices change of #395 needs it for many connections; this section asks for one connection at a time.
- A toggletip (i) component: the Overview change of #395 introduces it; this section does not need one.

## Open questions

None. The phone placement and the start screen are decided by UI/UX practice and recorded in design.md, "Decisions".
