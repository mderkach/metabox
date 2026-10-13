# ADR-0047. Ставить перехват трафика LAN init-скриптом службы sing-box по модели из UCI

- Статус: Accepted
- Дата: 2026-10-09
- Ответственные: владелец репозитория

## Контекст и постановка проблемы

На роутере маршрутизацией владеет re:HomeProxy: его служба поднимает sing-box, ставит правила nft, `ip rule` и upstream dnsmasq. US-11 [PRD](../PRD.md) требует, чтобы metabox встал на его место и сам владел перехватом, DNS и службой sing-box, а не держал рядом второй пакет, который спорит за те же правила nft и dnsmasq. Требования к обвязке — AC-48…AC-57 раздела «Сетевая обвязка»: режим `redirect_tproxy` как у homeproxy, ACL `all`/`listed` по IP и MAC, upstream dnsmasq фрагментом conf-dir без правки UCI `dhcp` (OQ-19), fail-closed (OQ-16), сосуществование с b4.

Открытый вопрос этого решения — кто и как ставит обвязку на устройстве. Ограничения, уже заданные кодом и другими решениями:

- Службой sing-box управляет только init-скрипт через procd ([ADR-0009](./ADR-0009-read-service-state-from-procd.md), [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md)), служба входит в пакет панели ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)), и демон проверяет кандидата той командой, которой procd поднимает службу ([ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md)).
- Межсетевым экраном владеет fw4: его `reload` пересобирает таблицу `inet fw4` целиком, чужие правила в ней живут только через инклюд.
- Протокол Apply ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)) рестартует службу и не должен перезагружать fw4 и рестартовать dnsmasq (AC-50).
- Демон запускается после службы sing-box и может лежать, пока служба работает (AC-48, AC-51).

В scope: где лежит модель обвязки, какой процесс ставит и снимает правила, как демон узнаёт, что они стоят, и что происходит с перехватом на рестарте и падении sing-box. Вне scope: запись модели из панели и окно подтверждения для неё (AC-53), экран «Устройства» (AC-61), порядок переключения роутера с homeproxy (AC-67), IPv6.

## Критерии выбора

1. **Замена, а не соседство** — один владелец правил nft, `ip rule` и dnsmasq на роутере (US-11).
2. **Независимость от демона** — обвязка ставится на загрузке и снимается `stop` без живого metaboxd (AC-51).
3. **Fail-closed** — пока sing-box поднимается или лежит, трафик перечисленных устройств и DNS сети не уходят мимо прокси (AC-52).
4. **Apply не трогает сеть** — рестарт sing-box не перезагружает fw4 и не рестартует dnsmasq (AC-50).
5. **Совместимость с b4** — трафик с чужой меткой идёт мимо перехвата (AC-57).
6. **Проверяемость** — на стенде и в healthcheck видно, стоит ли обвязка.

## Рассмотренные варианты

1. **Оставить homeproxy data plane, metabox — только редактор конфига.** Ничего не переписывать: перехват, DNS и служба остаются за homeproxy, демон работает с его путями, как в переходном режиме из комментария к [`metabox`](../../apps/metaboxd/package/etc/config/metabox). Но правилами, командой службы и процессом владеет другой пакет: его обвязка не знает о модели metabox, а команду службы задаёт он, а не UCI `metabox`. Это ровно та ситуация двух пакетов, от которой уходит US-11 (критерий 1); сосуществование отклонил владелец. **Отклонён.**
2. **Inbound `tun` с `auto_redirect` sing-box.** Правила ставит сам sing-box, отдельной обвязки нет. Но tun sing-box отбирает трафик по назначению, интерфейсу и uid, а не по адресу источника, поэтому ACL `listed` по IP и MAC из AC-49 на нём не выражается; `auto_redirect` метит пакеты сам и конфликтует с `route.default_mark`, на котором держится обход петли; неперечисленные устройства шли бы через userspace (критерии 1 и 5). **Отклонён.**
3. **Обвязку ставит демон.** Демон и так читает модель, ему проще сверять её с ядром и отдавать ошибки панели. Но обвязка тогда живёт, только пока жив демон: на загрузке до его старта перехвата нет, а снять её при мёртвом демоне некому (критерий 2). Падение демона либо оставляет правила без хозяина, либо, если демон снимает их при выходе, открывает трафик напрямую (критерий 3). **Отклонён.**
4. **Обвязку ставит init-скрипт службы sing-box по модели из UCI, демон её читает.** Правила живут столько же, сколько служба: procd поднимает их на загрузке, `stop` снимает. Модель — UCI, который читают и скрипт, и демон. Цена — около 350 строк шелла с рендером nft и сверкой состояния, которые юнит-тестами не покрыты и проверяются только на стенде. **Принят.**

## Принятое решение

Сетевую обвязку ставит и снимает init-скрипт [`metabox-singbox`](../../apps/metaboxd/package/etc/init.d/metabox-singbox) по модели из секции `metabox.dataplane`. Демон модель читает, а меняет её только транзакцией с окном подтверждения: снимок прежней секции, запись `uci batch` со сверкой, `reload` службы, проверка цепочек и dns-in, окно, откат к снимку без подтверждения; состояние транзакции лежит в `dataplane.json` служебного каталога, и Replay на старте доигрывает откат ([`internal/apply/plane.go`](../../apps/metaboxd/internal/apply/plane.go), [`internal/dataplane/write.go`](../../apps/metaboxd/internal/dataplane/write.go)).

**Модель.** Секция типа `dataplane` с именем `dataplane` в `/etc/config/metabox`: `enabled`, порты `redirect_port`/`tproxy_port`/`dns_port`, `dns_hijack`, метки `self_mark`/`tproxy_mark`, `route_table`, `acl_mode` (`all` | `listed`), списки `source_ip`, `source_mac`, `lan_interface`, `wan_proxy_cidr`, `wan_direct_cidr`, `ipv6`. Без секции и без опции действуют умолчания homeproxy (5331/5332/5333, метки 100 и 101, таблица 100, `listed`, `br-lan`, обвязка включена) — одни и те же в скрипте и в `dataplane.Defaults()`. Невалидная модель не меняет уже поставленную обвязку.

**Что ставит `start` при `enabled=1`:**

- фрагмент `/var/run/metabox/fw4_post.nft` и инклюд `firewall.metabox_post` (`type nftables`, `position table-append`): наборы и цепочки с префиксом `metabox_` внутри `table inet fw4` и переходы в конец `dstnat`, `mangle_prerouting`, `mangle_output`. TCP — redirect на `redirect_port`, UDP — tproxy на `tproxy_port` с меткой `tproxy_mark`, udp/53 с `lan_interface` — redirect на dnsmasq при `dns_hijack=1`. Перед `fw4 reload` фрагмент проходит `fw4 check`, при отказе остаётся прежний;
- `ip rule fwmark <tproxy_mark> table <route_table>` и `local 0.0.0.0/0 dev lo` в этой таблице;
- фрагмент `metabox.conf` (`no-resolv`, `no-poll`, `server=127.0.0.1#<dns_port>`) в conf-dir первого инстанса dnsmasq; UCI `dhcp` не правится.

Каждый шаг сверяется с тем, что уже стоит, и при совпадении ничего не трогает. Пакет с `self_mark` и пакет роутера с любой другой ненулевой меткой идут мимо перехвата.

**Жизненный цикл.**

- `restart` и `reload` переопределены: удаляют у procd только инстанс `sing-box` и зовут `start`. Обвязка остаётся на месте, пока sing-box поднимается (fail-closed). Смена модели в UCI доходит до правил через `reload` по триггеру procd на конфиг `metabox`.
- `stop` снимает обвязку по значениям из `/var/run/metabox/dataplane.state` (метка, таблица, путь фрагмента dnsmasq), а не из UCI, которую к этому моменту могли поменять. Цепочки и наборы `metabox_*`, оставшиеся пустыми после `fw4 reload`, удаляются отдельно. После `stop` в `nft list ruleset` и `ip rule` следов metabox нет.
- `enabled=0` на `start` снимает обвязку так же, как `stop`.

**Демон.** Пакет `apps/metaboxd/internal/dataplane` читает модель `uci -q show metabox` и признак применения — цепочки `metabox_*` в `inet fw4` из `nft -j list chains`. Имена секции, опций и цепочек — контракт со скриптом (`ExpectedChains`). Healthcheck после рестарта ([`cycle.go`](../../apps/metaboxd/internal/apply/cycle.go)) по модели, снятой до рестарта, проверяет, что цепочки, стоявшие до рестарта, не пропали (`interception_missing`), и шлёт DNS-пробу в dns-in на `dns_port` (`dns_probe_failed`).

Non-goal: IPv6-цепочки, режим fail-open на время рестарта (пункт 8 roadmap PRD).

### Область действия и границы

`apps/metaboxd/package/etc/init.d/metabox-singbox`, секция `dataplane` в `apps/metaboxd/package/etc/config/metabox`, `apps/metaboxd/internal/dataplane`, проверки обвязки в `internal/apply/cycle.go`, `GET /api/dataplane`, стенд — `make dataplane-check`.

## Последствия

### Положительные

- Обвязка переживает перезагрузку и падение демона: ей нужен только procd.
- Apply конфига рестартует один процесс sing-box: fw4 и dnsmasq не трогаются, пока модель не менялась.
- Между sing-box и правилами нет окна, в которое трафик или DNS ушли бы напрямую.
- Модель видна и правится в одном месте — UCI; панель и SSH видят одно и то же.
- Healthcheck ловит конфиг, после которого пропал перехват или не отвечает dns-in, а не только живой Clash API.

### Отрицательные

- Логика обвязки — шелл в init-скрипте без юнит-тестов; ошибки рендера nft ловит только стенд.
- Контракт имён (секция, опции, цепочки `metabox_*`, умолчания) продублирован в шелле и в Go; расхождение тестами одной стороны не ловится.
- Fail-closed: пока sing-box лежит, соединения перечисленных устройств получают отказ, а DNS всей сети остаётся без ответа.
- Смена правил модели — `fw4 reload`; dnsmasq рестартует только при смене фрагмента (`dns_port`), смена ACL его не трогает; на загрузке dnsmasq стартует дважды.
- `restart` и `reload` скрипта ведут себя не как в `rc.common`, и это надо помнить при ручной работе со службой.

### Нейтральные или отложенные

- Режим «пропускать напрямую, пока ядро поднимается» отложен как второй путь в init-скрипте (пункт 8 roadmap PRD).
- Смена ACL через демон рестартует sing-box и рвёт соединения; откат рвёт их второй раз. Смена `dns_port` рестартует dnsmasq при смене и при откате.

## Риски и меры снижения

| Риск                                                                                                                                                          | Вероятность и влияние                                                  | Митигация                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Двойной перехват рядом с homeproxy: на уже стоящем пакете `/etc/config/metabox` не перезаписывается, без секции `dataplane` действуют умолчания с `enabled`   | Средняя при обновлении пакета на роутере, высокое — сеть без интернета | Пакетная секция выключена; перед установкой секцию добавляют руками или выключают службу                               |
| Окно без DNS на рестарт sing-box: dnsmasq отдаёт запросы в dns-in, которого ещё нет                                                                           | Высокая на каждом Apply, низкое — секунды без ответа                   | Принято как цена fail-closed (AC-52); healthcheck не засчитывает рестарт без ответа dns-in                             |
| Устаревшие элементы наборов: `flush table` в `fw4 reload` не трогает элементы, удалённый источник остался бы в `metabox_src_*`                                | Низкая, среднее — снятое из ACL устройство идёт через sing-box         | После своего `fw4 reload` скрипт перезаливает наборы одной транзакцией nft; отказ перезаливки пишется в лог            |
| Нет секции `dnsmasq` в `/etc/config/dhcp`: скрипт ставит nft и ip rule, но фрагмент upstream не кладёт, и перехваченный DNS уходит в обычный upstream dnsmasq | Низкая на OpenWrt с dnsmasq, высокое — DNS мимо sing-box               | Отказ пишется в `logread` тегом `metabox-singbox`; DNS-проба healthcheck идёт в dns-in напрямую и этот случай не ловит |
| Хуки настоящего b4 на том же приоритете `mangle` ведут себя не так, как его эмуляция на стенде                                                                | Неизвестна, высокое — поток b4 уходит в tproxy                         | AC-57 открыт до проверки на роутере в первые сутки после переключения                                                  |

## Совместимость, миграция и откат

Пакет ставится при работающем homeproxy: секция `dataplane` в пакетном файле выключена, служба `metabox-singbox` правил не ставит.

Откат обвязки — `/etc/init.d/metabox-singbox stop` или `enabled '0'` с `reload`: обвязка снимается без следов, после чего можно поднять homeproxy.

## Проверка решения

- `make dataplane-check` на стенде: обвязка ставится стартом службы; TCP клиентов из `source_ip` и `source_mac` уходит в redirect, неперечисленного — мимо; UDP — в tproxy; udp/53 — через dnsmasq в dns-in; трафик роутера и пакет с чужой меткой; Apply не меняет правила fw4 и pid dnsmasq; убитый sing-box оставляет перехват; режим `all`; `stop` снимает всё, `start` возвращает; чужие `ip rule` и таблицу с номерами обвязки выключенная модель не снимает.
- `make apply-check`: служба поднята инстансом `sing-box` с одним `-c`, цикл Apply проходит; шаг 10 `dataplane-check` прогоняет его при стоящей обвязке.
- `cd apps/metaboxd && go test ./internal/dataplane/ ./internal/apply/`: разбор модели и умолчаний, цепочки из `nft -j list chains`, отказы `interception_missing` и `dns_probe_failed`.
- На устройстве после `stop`: `nft list ruleset | grep metabox_` и `ip rule | grep 'lookup <route_table>'` пусты, `uci -q get firewall.metabox_post` ничего не отдаёт.

## Ссылки

- [PRD](../PRD.md): US-11, AC-48…AC-57, AC-67, OQ-16, OQ-19, пункт 8 roadmap после v1;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0009](./ADR-0009-read-service-state-from-procd.md), [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md), [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md), [ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md);
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md), разделы «Сервис через procd» и «Сетевая обвязка»;
- [`metabox-singbox`](../../apps/metaboxd/package/etc/init.d/metabox-singbox), [`metabox`](../../apps/metaboxd/package/etc/config/metabox), [`dataplane.go`](../../apps/metaboxd/internal/dataplane/dataplane.go), [`cycle.go`](../../apps/metaboxd/internal/apply/cycle.go);
- [`dataplane-check.sh`](../../.devcontainer/dataplane-check.sh), [`dataplane-check`](../../.devcontainer/target/files/usr/bin/dataplane-check).
