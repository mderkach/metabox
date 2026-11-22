## Why

Issues #390, #395 and #399. The panel is being redesigned for a newcomer who does not know the sing-box schema (persona P3, `docs/PRD.md` section 2.1), and the screens of that redesign need one set of words before they are written. Today the same thing has several names: an outbound is «выход» on one screen and «аутбаунд» on the next, a selector group is «ручной выбор», «узел выбираете вы» and «селектор», Overview says «Через узел» and «Через прокси» side by side. `apps/web/PRODUCT.md`, which every design brief reads, still requires the word `sing-box` in interface texts, so a brief that follows it would undo #386, which moved the product texts to "core".

## What Changes

- **A vocabulary for product texts.** `apps/web/docs/guides/Glossary.md` becomes the vocabulary of the panel and the daemon texts: for each concept the English and the Russian word, the word used in Simple mode and in the Editor where they differ, and the words not to use. Concepts: core, device, interception, service, site, rule, outbound, group, server, subscription, and the route phrase "through proxy ‹outbound›".
- **Two levels.** The everyday word is the main one; the schema word stays where the schema is edited: «сервис» is the Simple-mode word for a rule set from the catalog, while the Editor and the rule sets screen keep «сет правил»; Russian calls an individual proxy a server, a group choice a member, and a generic config entry an entry.
- **Inconsistencies on the current screens are fixed**: «аутбаунд» and the Latin «outbound» in Russian texts become «выход», «инбаунд» becomes «вход»; «ноды» goes; the three names of a selector group and the two of a `urltest` group become one each; «Через узел» on Overview and in Diagnostics becomes «Через прокси»; English "exit" becomes "outbound"; «канал» for the internet uplink on Overview becomes «интернет-подключение», and the traffic direction there says «скачивание» / «отправка» for a rate and «скачано» / «отправлено» for a volume, English "download" / "upload"; the core service card is titled «Ядро» / "Core" instead of a hard-coded "sing-box".
- **Two generic "sing-box" texts** left after #386 say "core": the rule set refresh hint and the link transport error. Texts about the fork itself (binary version, `sing-box check`, cache file, providers, links the fork parses, Clash API) keep the name, as #386 decided.
- **The daemon Russian catalogue** says «сет правил», as the panel does, instead of «набор».
- **A check**: a test over the panel dictionaries and the daemon catalogue fails on a word the vocabulary forbids, outside exceptions listed by file and key.
- **`apps/web/PRODUCT.md`**: the brand commitment says "core" in interface texts, with the core type and version as details (#390).
- The words «сервер» for a node and «сервис» for a rule set are **not** brought to the current screens: they arrive with the screens rewritten by the next changes of #395, and each of those changes adds the old word to the forbidden list.

Russian product texts remove «узел» throughout the panel and daemon. API field names stay unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: AC-94, product texts contain no word the vocabulary forbids; the vocabulary names each concept with one word per language.
- `devices`: AC-61 and AC-88, the device toggle is named "through the core", not "via sing-box", as the panel already labels it. The scenario title "Via sing-box" of AC-61 stays: a modified requirement keeps the titles of its scenarios.

## Impact

- Panel dictionaries `apps/web/src/**/i18n/{en,ru}.json`: about 30 keys in `shared`, `pages/Overview`, `pages/Diagnostics`, `pages/Proxies`, `widgets/ProxyGroups`, `widgets/Config/ConfigTabs`, `features/Config/ConfigNodeAdd`, `features/Config/ConfigNodeDelete`, `features/Rule/RuleAdd`, `features/RuleSet/RuleSetAdd`, `features/Mcp/McpAccess`, and the tests that find elements by these texts. Keys do not change, except `card.manual` and `card.automatic` of `widgets/ProxyGroups`, removed with the subtitle that repeated the group type badge; `src/i18n.generated.d.ts` does not change.
- Daemon: Russian values of `apps/metaboxd/internal/locale/ru.go`; English source texts and Go code do not change.
- A new test in `apps/web/tools/`.
- Documents: `apps/web/docs/guides/Glossary.md`, `apps/web/PRODUCT.md`, `docs/Verification.md`.
- No API, config format or schema change.

Closes #390 and #399. Refs #395 (the umbrella; this is the first of its changes). Touches #314: the texts of the "Add manual choice" action are reworded here, the action itself is removed by the Proxies change.

## Out of scope

- «сет правил» → «сервис» in Simple mode: the Routes change of #395, which creates Simple mode.
- The words "server" in the node form address field, the entry server inbounds and DNS servers: they keep "server" until the screens that hold them are rewritten; the vocabulary records which meaning wins where.
- The "How it works" section with the definitions of the terms as a screen: its own change after this one. Here the definitions live in `Glossary.md` as their source.
- The (i) help toggletip component: its first user is the Overview change.
- The rest of #318 (the side panel layout): the Routes change, together with #251.
- Spec texts that describe the system for developers and say sing-box (`dataplane`, `logs`, `clash-api`, NFR-1 and others): they describe the fork as it is. The labels quoted in AC-89 and AC-79 belong to the open changes `traffic-split-by-outbound` and `first-run-wizard`, which reword them.
- PRD scenarios US-1…US-16 written from the router owner, the "Working setting" paragraph and roadmap item 16 ("for persona P2"): PRD edits with the changes that build those screens.

## Open questions

None. The owner answered both questions of the first draft on 2026-11-20: the English pairs are accepted, English keeps its native words; `fallback` is «резервный» in Russian, declined by context; «пинг» may replace «задержка» where the context is technical, so it is not forbidden; the traffic direction is «скачано / отправлено» for a volume on newcomer screens and «входящий / исходящий» elsewhere; a rate on Overview reads «скачивание / отправка», and English uses "download / upload" instead of "inbound / outbound", decided after the copy review.
