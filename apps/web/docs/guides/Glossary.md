# Vocabulary

Which word names which concept in the product texts: the panel dictionaries (`i18n/{en,ru}.json` of the slices) and the texts the daemon shows to the operator (`apps/metaboxd/internal/locale`). Simple mode and the screens a newcomer reads use the everyday word; the Editor keeps the schema word where the two differ. A concept not listed here follows the word the panel already uses; check the existing dictionaries before introducing a new one.

English keeps its native words. Russian is localized to read naturally and is declined by context: «резервная группа», «через резервный выход».

| Concept                                                            | English                                             | Russian                                                                                                  | Editor, where different | Not used                                             |
| ------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------- |
| the routing core (sing-box today)                                  | core                                                | ядро                                                                                                     | —                       | sing-box for the core in general                     |
| a LAN client                                                       | device                                              | устройство                                                                                               | —                       | —                                                    |
| traffic interception (dataplane)                                   | interception                                        | перехват: «перехват трафика», «перехват DNS»                                                             | —                       | —                                                    |
| a rule set from the catalog                                        | service                                             | сервис                                                                                                   | rule set, сет правил    | набор                                                |
| when core last requested the remote list                           | checked                                             | проверен                                                                                                 | —                       | updated, обновлён                                    |
| a domain, a suffix, an address, a port written by hand             | site, address                                       | сайт, адрес                                                                                              | the condition key       | —                                                    |
| a route rule                                                       | rule                                                | правило                                                                                                  | —                       | —                                                    |
| what a rule sends traffic to: a group, a server, `direct`, `block` | outbound                                            | выход                                                                                                    | —                       | аутбаунд, «исход», Latin "outbound" in Russian, exit |
| where traffic enters the core: a listening port, TUN, `dns-in`     | inbound                                             | вход                                                                                                     | —                       | инбаунд                                              |
| a selector, `urltest` or `fallback` outbound                       | group                                               | группа                                                                                                   | the type key            | селектор                                             |
| one proxy outbound (vless and others)                              | server                                              | сервер                                                                                                   | —                       | нода, узел                                           |
| a provider of servers by URL                                       | subscription                                        | подписка                                                                                                 | —                       | —                                                    |
| a route through a proxy outbound                                   | through proxy "‹outbound›"                          | через прокси «‹выход›»                                                                                   | —                       | через VPN, через узел                                |
| a group the user switches by hand (selector)                       | manual choice                                       | выбор вручную                                                                                            | selector                | ручной выбор, селектор, узел выбираете вы            |
| a group that switches by latency (`urltest`)                       | picks by latency                                    | выбирает сама по задержке                                                                                | urltest                 | самый быстрый, fastest                               |
| a group that takes the first live server in its order (`fallback`) | fallback                                            | резервный, declined by context                                                                           | fallback                | —                                                    |
| the round trip time of a server check                              | latency                                             | задержка; «пинг» where the context is technical                                                          | —                       | —                                                    |
| a rule action without a proxy                                      | direct, block                                       | напрямую, блокировать                                                                                    | `direct`, `block`       | —                                                    |
| a rule action (`route`, `reject`, …)                               | action                                              | действие                                                                                                 | —                       | the outbound the rule sends traffic to               |
| the core process under procd                                       | routing service                                     | служба                                                                                                   | —                       | «сервис» for the process                             |
| the uplink interface of the router                                 | internet connection                                 | интернет-подключение                                                                                     | —                       | канал for the uplink                                 |
| traffic direction                                                  | download, upload; downloaded, uploaded for a volume | a volume: скачано, отправлено; a rate: скачивание, отправка — on Overview; входящий, исходящий elsewhere | входящий, исходящий     | inbound and outbound for a direction                 |
| sending the config to the router                                   | Apply                                               | применение; the verb is «применить», the confirmation window is part of it                               | —                       | —                                                    |
| the edited config before Apply                                     | draft                                               | черновик                                                                                                 | —                       | —                                                    |

«исходящий» is a different word from «исход» and is correct.

## Collisions

- English "service" names a catalog rule set, and the core process is "routing service". In Russian the two are apart: «сервис» and «служба».
- «сервер» also names the address field of a node form, an entry server for clients (an inbound) and a DNS server. A proxy server is «сервер», the address field is «адрес сервера», and a DNS server is «DNS-сервер».
- «выход» also names leaving the panel («Выйти») and a process exit code («Код выхода»). Both stay: a verb and a technical code, not an outbound.
- English "internet connection" sits next to the Connections screen, where a connection is one traffic flow. The uplink is always "internet connection ‹interface›", in the singular and with its interface name; traffic flows are "connections". In Russian «подключение» and «соединение» are apart.
- «канал» stays for the lines of a `bond` outbound: it is another meaning.
- A group can contain a server or another group. In Russian the selectable item is «участник группы». The generic item in a config section is «запись». A reference to an outbound is «выход».

## Forbidden in texts

Word starts that are wrong in any product text of the given language, matched case-insensitively. `apps/web/tools/vocabulary.test.ts` reads this list and fails on a dictionary value or a Russian daemon text that contains one, outside the exceptions it lists by file and key. A change that rewrites the last screen of a replaced word adds that word here.

- ru: `аутбаунд`
- ru: `инбаунд`
- ru: `outbound`
- ru: `нод`
- ru: `узел`
- ru: `узл`
- ru: `селектор`
- ru: `ручной выбор`
- ru: `ручного выбора`
- ru: `ручным выбором`
- ru: `самый быстр`
- ru: `набор`
- en: `exit`
- en: `fastest`
- all: `sing-box`
