## Context

See proposal.md, "Why". What exists:

- `GET /api/connections/{id}/route` (`apps/metaboxd/internal/route/route.go`, `Explain`) answers for one live connection: the match (kind `rule`, `final` or `unknown`, the index in `route.rules`, the conditions and action as the core renders them, a reason code), the chain as the core reports it (from the final node to the group) and the rule list of the running process. Every statement carries an origin (AC-34). A connection that closed returns `ErrNoConnection`. The panel reads it through `@entities/Route` (`useRouteExplanation`); only the Connections screen uses it today, through `widgets/RouteExplanation`.
- `widgets/RouteExplanation/lib/RouteExplanation.lib.ts` currently compares the lengths of the running and applied rule lists. Equal lengths do not prove that a position belongs to the loaded revision. This page consumes the shared confirmed rule position from the Overview change (AC-103).
- The connection list comes from the Clash API stream (`@entities/Connection`): a screen declares that it reads it with `useConnectionStream`, and rows live in `ConnectionStore` with source address, host, rule and chain in reading order.
- Group types and members come from `@entities/Proxy` (Clash API `/proxies`, `ProxyGroup.type`). The providers endpoint returns each subscription with its servers (`ClashProviderSchema.proxies`), but the `ProxyProvider` model keeps only their count; this change keeps their names too.
- Rule names: AC-86 keeps a rule name as the line comment above the rule in `route.rules`. The panel reads names with `readRuleNames` of `@entities/Config`, builds rule rows with `toRuleRowsFromNodes` and calls a rule by its name or content label with `useRuleTitle` (`title`), all from `@entities/Rule`, from the applied config text.
- Device names: `deviceLabel(source, devices)` of `@entities/Device`, as the Connections sheet already titles an explanation "from ‹device›".
- Core state: `useServiceState` of `@entities/Daemon`.
- A rejected connection and intercepted DNS do not reach the connection list (`Route.model.ts`, `RuleHits`), so the walk never meets a blocked connection.
- The menu is `NAV_ITEMS` in `widgets/AppSidebar/model/AppSidebar.constants.ts`. Items marked `more` go to the "More" sheet on a phone; the bottom bar holds the other five. `NAV_TARGETS` gives the screen transition direction from the same order.

Decision records this change relies on: [ADR-0007](../../../docs/adr/ADR-0007-explain-route-without-own-rule-evaluator.md) (no rule evaluator of our own; observed and computed are told apart), [ADR-0019](../../../docs/adr/ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md) (texts in the slice), [ADR-0078](../../../docs/adr/ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md) (brief, detector, independent critique). The change creates no ADR: it introduces no computation, no endpoint and no storage.

## Goals / Non-Goals

**Goals:**

- A newcomer sees, on a connection of their own router, which device, which destination, which rule, which outbound and which server it went through, and learns the eight words the other screens use.
- Every value on the walk is the one the core reported, the panel's link by rule index that the Connections screen already makes, the rule name or content label read from the applied config when the rule number can be trusted, or a device name from the Devices list; the walk never claims more than the route explanation says.

**Non-Goals:**

- No daemon change and no new endpoint.
- No explanation of why the rules above did not match, and no "this site belongs to this service": that is rule evaluation (ADR-0007).
- No tutorial flow, no progress, no "mark as read".

## Decisions

### A page slice that composes entities, not a reuse of the explanation sheet

The section is `pages/HowItWorks`. It calls `useRouteExplanation` for the selected connection and joins it with the connection row, the proxy groups, the providers and the devices. The Connections sheet (`RouteExplanationSheet`) is not reused: it is built for persona P1, the router owner who knows the schema: conditions, the rules above, the chain as tags. It would need a second mode for every line. Reused pieces: the shared rule identity contract delivered by AC-103 and the origin mark `RouteOriginBadge` from the RouteExplanation widget. The page omits applied metadata until the shared contract confirms the loaded revision and position. An exact editor link also requires the shared editor target to identify the rule in the current draft.

### Which connections are offered

When the screen opens, the panel takes the current connection snapshot and offers up to three connections, one per kind, in this order: through a group (chain of two or more nodes), straight to a server (chain of one proxy node), direct. It skips DNS hijack and sniff-only rows and prefers a host name over a bare address. The list is fixed until the user presses "Other connections", which takes a new snapshot; the stream does not reshuffle it under the reader. A connection that closes before its explanation arrives (`ErrNoConnection`) is replaced by the next candidate of the same kind; with none left, the kind is dropped. Alternative rejected: let the user search all connections; that is the Connections screen's job, and a newcomer does not know what to search for.

### Where each value comes from

| Step        | Value                                                                                                     | Source                                                                                                                | Origin shown                                      |
| ----------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Device      | source address; the device name when the Devices list has one                                             | connection row; `@entities/Device` by address                                                                         | none: the address is the core's, the name a label |
| Destination | host, or the address when the core did not learn a name                                                   | connection row                                                                                                        | none                                              |
| Rule        | name (AC-86), else content label, then the number and the services the rule names; or the conditions text | match of the explanation; name, label and `rule_set` of `route.rules[index]` of the applied config, only when trusted | match origin                                      |
| Outbound    | the outbound tag; for a group: how it chooses, what it picked                                             | first node of the chain in reading order; group type from `/proxies`; the next chain node                             | chain origin                                      |
| Server      | the last chain node; "from subscription ‹name›" when a provider lists it                                  | chain; providers, with the server names kept in the `ProxyProvider` model                                             | chain origin                                      |

"Picked" is the next node of the connection's own chain, not the group's current selection: the selection may have changed since the connection opened. An outbound type the panel does not know gets no "how it chooses" line. A rule that names no service shows no service. When the rule number cannot be trusted, the name and the label are not shown either (they are read from the applied config, which may differ from the core's), and the rule tile shows the conditions text from the core. A server reached through another server (`detour`) shows what the chain reports and nothing more.

### Links "Where it is configured"

They point at today's screens and move with the changes of #395 that replace those screens. The service target is the one Overview uses for a service name (`overview-for-newcomers`, decision 7: its rule set on the Rule sets screen) until the Routes change adds Simple mode. The walk names a rule's services, so the link selects the first rule set the walked rule names; with none, or without a walk, it opens the screen:

| Term         | Link today                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| device       | `/devices`                                                                                                                                                               |
| service      | `/config/rule-set?set=‹tag›` with the row of the walked rule's rule set expanded (the target defined by `rule-set-contents`); without a named service, the screen itself |
| core         | `/settings`, where the core is controlled; Overview shows its state                                                                                                      |
| rule         | `/config`, with `?rule=N` when the shared editor target confirms that position                                                                                           |
| outbound     | `/config/outbounds`                                                                                                                                                      |
| group        | `/proxies`, where a manual-choice group is switched                                                                                                                      |
| server       | `/config/outbounds`                                                                                                                                                      |
| subscription | `/config/providers`                                                                                                                                                      |

### Words

The section uses `Glossary.md`. The Russian walk and the term list use «Сервер» for an individual proxy server. The service definition uses «сет правил», the label in the Editor and on the rule sets screen. The core term explains the status shown on Overview. Draft definitions follow.

| Term         | English                                                                                                                                              | Russian                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| device       | A computer, phone or TV in your network. A rule can apply to one device only.                                                                        | Компьютер, телефон или телевизор в вашей сети. Правило может касаться только одного устройства.                                                      |
| service      | A ready list of sites or addresses, usually from a catalog, that a rule refers to by name. The Editor calls it a rule set.                           | Готовый список сайтов или адресов, обычно из каталога, на который правило ссылается по имени. В Редакторе он называется «сет правил».                |
| rule         | "If a connection matches the condition, send it to this outbound." Rules are checked top down; the first match wins.                                 | «Если соединение подходит под условие, отправить его в этот выход». Правила проверяются сверху вниз, срабатывает первое подходящее.                  |
| outbound     | Where a rule sends traffic: a group, one server, or direct, without a proxy.                                                                         | Куда правило отправляет трафик: группа, отдельный сервер или «напрямую», без прокси.                                                                 |
| group        | Several servers under one name. It picks one by latency on its own or waits for your choice; it can hold other groups.                               | Несколько серверов под одним именем. Выбирает сама по задержке или ждёт вашего выбора; может включать другие группы.                                 |
| server       | One proxy server: an address, a protocol and a key. It is what is often called a node or a VPN server.                                               | Сервер, через который прокси передаёт трафик, с адресом, протоколом и ключом.                                                                        |
| subscription | A link from a VPN provider that brings a list of servers and keeps it up to date. A single server can be added by its link instead.                  | Ссылка от поставщика VPN: по ней приходит список серверов и обновляется сам. Один сервер можно добавить и своей ссылкой.                             |
| core         | The program on the router that sorts connections by the rules and sends them out. Its state is in the Overview header; it is controlled in Settings. | Программа на роутере, которая разбирает соединения по правилам и отправляет их дальше. Её состояние видно в шапке Обзора, управление — в Настройках. |

### Navigation

`NAV_ITEMS` gets a first entry for `/how-it-works` with `more: true`, so it is first in the sidebar and first in the "More" sheet, and the bottom bar is unchanged. The router keeps the root redirect as it is. The two placement decisions are recorded below.

### Phone placement and the start screen

Decided by UI/UX practice, not by an owner vote.

- **A phone puts "How metabox works" first in the "More" sheet; the bottom bar is unchanged.** Platform guidelines cap a bottom bar at five destinations, and the five it holds are the frequent ones; help is read once, not daily, so it does not earn a slot. Rejected: replacing Devices in the bar (Devices is used from a phone for the "through the core" switch and would get a tap deeper); a header link (a second navigation pattern on the phone only).
- **The panel root keeps its start screens, and AC-42 does not change.** A start screen for an empty config is the job of the Routes change (Simple mode with defaults) and the `first-run-wizard` change; opening "How metabox works" from the root would overlap them and need a MODIFIED delta of AC-42.

## Design brief

**Question the section answers:** "What happens to a connection from my device, and what do the words on the other screens mean?" Asked by persona P3, the newcomer, on first contact and after reading a word on Overview or Proxies they do not know; P1, the router owner, does not need the section and loses nothing by it.

**Mode and authority.** Read inside the Operate shell: one screen, read top to bottom, inside the existing visual world of `apps/web/DESIGN.md` ("The Night Console"). No new tokens, no new component kinds, no illustration. Assumption, no interview was possible: the owner's agreed direction in #395 and the mockup reviewed with a newcomer are the evidence; the brief follows them except where they would invent data.

**Content, top to bottom:**

1. Page header "How metabox works" and one sentence: "The path of one connection of this router, from the device to the server. Select a step to see what it is and where it is configured."
2. The connection switch: up to three offered connections as a segmented control, each labelled by its host in mono; "Other connections" as a quiet button beside it.
3. The walk: five step tiles in one row, joined by a plain chevron. Each tile: the step name in sans, Fog Grey, 12 px; the value in mono, Paper White; one sub-line in sans that says what the value is ("matched the rule", "group, picks by latency", "from subscription ‹name›"). The rule tile value is the rule name, or its content label when it has none, then the number ("Work · rule 3"); the label and the name appear only when the number is trusted. The outbound tile holds the group choice as nested blocks, one per level ("group ‹a›, manual choice, picked ‹b›" → inside it "group ‹b›, picks by latency, picked ‹server›"), indented and framed, never joined by an arrow. The rule and outbound tiles carry the origin mark from the Connections screen. The outbound value takes its route hue (direct teal, proxy azure), the only color on the walk.
4. The term panel under the walk: the term of the selected step, its sentence, a note where the walk has one (the outbound is a group: "if a rule pointed straight at a server, Outbound and Server would be one step"), and the "Where it is configured" link as an outline button.
5. "Terms": the eight definitions as a grid of quiet cards, three columns on desktop, one on a phone; the card of the selected step is marked with Selection Ink and an azure edge, as a selected tile is elsewhere. The core has no step: its card selects the term panel like the others. Each card is a button that selects its term and has the link inside the term panel, not on the card, so the card grid stays one tab stop per card.

**Focal moment:** the outbound tile with its nested group blocks. It is where readers of the mockup took "group → server" arrows for a chain of servers; nesting is the fix and the reason the section exists.

**States:**

| State                                  | What the screen shows                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loading                                | step tiles with names and skeleton values for at most the first response; terms render at once                                                                  |
| walk through nested groups             | nested blocks inside the outbound tile, as deep as the chain                                                                                                    |
| direct                                 | outbound "direct", "without a proxy"; server tile "none" with "goes out over the internet connection"                                                           |
| no rule matched (`final`)              | rule tile "no rule matched", sub-line "the default outbound was used"                                                                                           |
| rule undetermined                      | rule tile "undetermined", the reason from the explanation, origin "unknown"                                                                                     |
| core runs another config (not trusted) | rule tile shows the conditions text without a name, a number or a link, sub-line "the matching rule could not be matched to the applied config"                 |
| unknown outbound type                  | the outbound tag without a "how it chooses" line                                                                                                                |
| connection closed after it was shown   | the walk stays as shown, a muted line "this connection has closed"; no refetch loop                                                                             |
| no connections, core running           | status line "No connections right now"; tiles with names and an empty value; terms render                                                                       |
| core stopped                           | status line "The core is stopped, so there are no connections to show" instead of the walk, no step tiles, a link to Overview where it is started; terms render |
| explanation request failed             | the same inline error block the Connections sheet uses, with retry; terms render                                                                                |
| long host or tag                       | mono value wraps at any character inside its tile; a tile never widens the row                                                                                  |
| Russian texts                          | the longest step name «Куда соединение» and sub-lines fit at 1280, 768, 400 and 375 px                                                                          |

**Interaction and layout:**

- Steps are buttons with `aria-pressed`; the selected one has Selection Ink and the azure edge. One persistent polite live region announces the selected term and definition when the visible panel moves between steps or glossary cards. Arrow keys do not move between steps; Tab does, as on any button row.
- The default selected step is the outbound. Below 768 px its term panel follows the selected step directly. A term selected from the glossary instead opens its explanation beside the glossary, without moving focus from the button.
- From 768 px down the walk becomes a vertical list: tiles full width, the chevron points down between them; the nested blocks stay nested. At 400 px and at 375 px nothing scrolls sideways.
- No motion beyond the panel's standard screen transition; selection changes are instant.

**Anti-goals:** arrows between groups and servers; any value the core did not report presented as fact; marketing tone, metaphors or filler in the texts; a second accent color; a tutorial that hides the panel.

**Builder must not invent:** a sample connection when the router has none; a "this site is in this service" claim; a name for a device the Devices list does not have.

## Risks / Trade-offs

- [A router with only direct traffic shows no group] → the walk shows what exists; the group term still explains groups. A synthetic example would present an invented connection as one of the router's, which the principle "observation and computation are distinguishable" (UX-8) forbids.
- [The links point at schema screens (Editor, Outbounds) until the redesign replaces them] → they are listed in one table here and in Out of scope with the change that re-points each.
- [The group's "picked" member may differ from what Proxies shows now] → the sub-line reads "picked" in the past sense of this connection; the group term says a group can change its choice.
- [An explanation request per offered connection would triple the load on open] → a request goes only for the selected connection; the other offered ones are explained when picked.

## Migration Plan

None: a new screen and a new menu entry. Rollback is removing both.
