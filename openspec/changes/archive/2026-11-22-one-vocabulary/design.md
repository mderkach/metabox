## Context

See proposal.md, "Why". The current state:

- `apps/web/docs/guides/Glossary.md` holds eight Russian terms for the authors of `ru.json`; there are no English pairs and no list of words not to use.
- Panel texts live in the slice dictionaries (`apps/web/src/**/i18n/{en,ru}.json`); the daemon's Russian texts are `apps/metaboxd/internal/locale/ru.go`, keyed by the English source text.
- Tests find elements by visible text in Russian and English; the e2e page objects take texts through `translate(namespace, key)`, so a reworded text does not break them.
- After #386 the generic "sing-box" is gone from product texts except two; the remaining eight mentions are about the fork.

## Goals / Non-Goals

**Goals:**

- One place that says which word names which concept, in English and Russian, for Simple mode and for the Editor.
- A check that keeps a forbidden word from coming back.
- The current screens stop contradicting each other.

**Non-Goals:**

- Bringing the new words «сервер» and «сервис» to screens that the next changes of #395 rewrite.
- Changing keys of the dictionaries, with one exception: the group card on Proxies drops `card.manual` and `card.automatic`, because its type badge already names how the group chooses, and the old line said "by latency" for `fallback` too.

## Decisions

### The vocabulary

`Glossary.md` becomes a table of concepts. The words in Simple mode are the everyday ones; the Editor keeps the schema word where it differs.

| Concept                                                            | English                                             | Russian                                                                                                  | Editor, where different | Not used                                    |
| ------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| the routing core (sing-box today)                                  | core                                                | ядро                                                                                                     | —                       | sing-box for the core in general            |
| a LAN client                                                       | device                                              | устройство                                                                                               | —                       | —                                           |
| traffic interception (dataplane)                                   | interception                                        | перехват                                                                                                 | —                       | —                                           |
| a rule set from the catalog                                        | service                                             | сервис                                                                                                   | rule set, сет правил    | набор                                       |
| a domain, a suffix, an address, a port written by hand             | site, address                                       | сайт, адрес                                                                                              | the condition key       | —                                           |
| a route rule                                                       | rule                                                | правило                                                                                                  | —                       | —                                           |
| what a rule sends traffic to: a group, a server, `direct`, `block` | outbound                                            | выход                                                                                                    | —                       | аутбаунд, Latin "outbound" in Russian, exit |
| a selector, `urltest` or `fallback` outbound                       | group                                               | группа                                                                                                   | the type key            | селектор                                    |
| one proxy outbound (vless and others)                              | server                                              | сервер                                                                                                   | —                       | нода, узел                                  |
| a provider of servers by URL                                       | subscription                                        | подписка                                                                                                 | —                       | —                                           |
| a route through a proxy outbound                                   | through proxy "‹outbound›"                          | через прокси «‹выход›»                                                                                   | —                       | через VPN, через узел                       |
| a group the user switches by hand (selector)                       | manual choice                                       | выбор вручную                                                                                            | selector                | ручной выбор, селектор, узел выбираете вы   |
| a group that switches by latency (`urltest`)                       | picks by latency                                    | выбирает сама по задержке                                                                                | urltest                 | самый быстрый, fastest                      |
| a group that takes the first live server in its order (`fallback`) | fallback                                            | резервный, declined by context: «резервная группа»                                                       | fallback                | —                                           |
| the round trip time of a server check                              | latency                                             | задержка; «пинг» where the context is technical                                                          | —                       | —                                           |
| a rule action without a proxy                                      | direct, block                                       | напрямую, блокировать                                                                                    | `direct`, `block`       | —                                           |
| the core process under procd                                       | routing service                                     | служба                                                                                                   | —                       | «сервис» for the process                    |
| the uplink interface of the router                                 | internet connection                                 | интернет-подключение                                                                                     | —                       | канал (for the uplink)                      |
| traffic direction                                                  | download, upload; downloaded, uploaded for a volume | a volume: скачано, отправлено; a rate: скачивание, отправка — on Overview; входящий, исходящий elsewhere | входящий, исходящий     | inbound and outbound for a direction        |

The rows that stay as they are: action (`действие`), Apply (`применение`), draft (`черновик`), rule set in the Editor (`сет правил`).

English keeps its native words; Russian is localized to read naturally and is declined by context («резервная группа», «через резервный выход»). The type key stays visible in the Editor.

Known collisions the vocabulary resolves:

- English "service" names a catalog rule set, and the core process keeps "routing service", as #386 left it. In Russian the two are already apart: «сервис» and «служба».
- «сервер» already names the address field of a node form, an entry server for clients (an inbound) and a DNS server. Until the Proxies change, «сервер» alone is not used for a node; after it, the address field is «адрес сервера», an inbound is «точка входа» or «сервер для клиентов» as the entry-servers change decides, and a DNS server is always «DNS-сервер».
- «выход» also names leaving the panel («Выйти»), a process exit code («Код выхода») and the outward route in Diagnostics («Прямой выход»). The first two stay: they are verbs and a technical code, not an outbound. Diagnostics says «Напрямую» and «Через прокси».
- English "internet connection" sits next to the Connections screen, where a connection is one traffic flow. The uplink is always "internet connection ‹interface›" in the singular with its interface name; traffic flows are "connections". In Russian «подключение» and «соединение» are apart.
- "outbound" stays the English word, not "exit": it is the schema word P1 reads in the config and in the fork documentation, "exit" already means a process exit code in the Apply texts, and the help next to the term explains it to P3.

The exact copy of each reworded text is settled with `/impeccable clarify` during the work, within these words; the table fixes the words, not the sentences.

Alternatives:

- A separate English and Russian glossary. Rejected: the same concept must map to one pair, and two files drift.
- One word for both modes («сервис» in the Editor too). Rejected by the owner: the `services` section of the config is already «Сервисы» in the Editor, and a rule set there is a schema object.

### The check

The "Not used" column is guidance for an author and holds phrases a machine cannot judge («канал» for the uplink). Under the table `Glossary.md` keeps a short list "Forbidden in texts": word starts that are wrong in any product text, each marked with the language it applies to. A note under the list says that a change which rewrites the last screen of a replaced word adds that word to the list. A Vitest test in `apps/web/tools/` reads that list, scans every value of the panel dictionaries and every Russian value of `ru.go`, and fails with the file, the key and the word. Only values are scanned, without `{{placeholders}}`. Words are matched as word starts, case-insensitive, so «аутбаунд» and «нод» catch every form, and «нод» does not catch «природа».

- The forbidden list comes from the document, not from the test, so the vocabulary has one home and the test enforces it.
- Exceptions are listed in the test by file and key, with the reason as the test data: the fork texts that keep "sing-box" (binary version, `sing-box check`, the cache file, providers, links the fork parses; about ten panel keys and ten daemon entries today) and "Exit code" in the Apply failure. The MCP tool description of the schema reference keeps "sing-box" and the schema key `outbounds.*`: it is written for agents. A daemon key is its English source; an exception key ending in `…` matches every key that starts with it. Each new text about the fork needs one exception line; that is the intended friction.
- The daemon catalogue is read as text by a pattern over the map literal, including entries joined with `+` across lines, and the test fails unless it reads as many entries as the map has keys, as `apps/web/tools/mockStand.test.ts` already reads the daemon routes from a Go file. The test is in the `tooling` project of `pnpm --filter web test`, which `make test` runs.
- Only words that no screen still needs are forbidden now: Russian: «аутбаунд», «инбаунд», Latin "outbound", «нод», «селектор», «ручной выбор» with its declined forms, «самый быстрый», «набор»; English: "exit", "fastest"; both: "sing-box". Russian also forbids «узел» and the stem «узл». «сет правил» never does: the Editor keeps it.

Alternatives:

- A lint rule. Rejected: oxlint has no rule over JSON values, and a custom plugin costs more than a test.
- A Go test for the daemon part. Rejected: it would need its own copy of the list or read a document of another project.

### No decision record

The vocabulary is a writing rule of the panel and lives in a guide, as the current `Glossary.md` does. The check is a test. Neither changes the architecture, so no ADR is written. The change relies on two: texts stay in the slice dictionaries ([ADR-0019](../../../docs/adr/ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md)), and the daemon catalogue is keyed by the English text ([ADR-0062](../../../docs/adr/ADR-0062-translate-operator-texts-with-an-english-keyed-catalogue-chosen-in-uci.md)), so a reworded daemon text changes its Go source too.

## Server, group member and config entry

Russian labels name a single proxy server «сервер», a selectable member «участник группы» and a generic entry in the Editor «запись». When the field refers to a config outbound, use «выход». The vocabulary check rejects «узел» and its declined forms in Russian. English labels and external identifiers keep their existing words.

## Risks / Trade-offs

- [A word start match gives a false positive in an unrelated word] → The exception list takes it by key; the test names the word and the key, so a false positive costs one line.
- [Reading `ru.go` by a pattern breaks if the catalogue changes form] → The test fails when it finds no entries.
- [Tests that find elements by the old texts] → They are updated in the same tasks as the texts; about 20 test files.

## Migration Plan

No data or API change. A rollback is a revert of the texts and the test.
