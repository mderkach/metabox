<div align="center">

<img src="docs/logo.svg" alt="metabox" width="72" />

# metabox

**Веб-панель для sing-box на роутерах с OpenWrt**

Правка конфига в формах, применение с автоматическим откатом, объяснение, куда ушло каждое соединение.

[![license](https://img.shields.io/badge/license-GPL--3.0--or--later-blue?style=flat-square)](./LICENSE)
![version](https://img.shields.io/badge/version-0.1.0--rc.2-orange?style=flat-square)
![OpenWrt](https://img.shields.io/badge/OpenWrt-25.12%20%7C%20SNAPSHOT-00B5E2?style=flat-square)
![arch](https://img.shields.io/badge/arch-aarch64-lightgrey?style=flat-square)

[English](./README.md) · **Русский**

</div>

---

metabox — демон на Go (`metaboxd`), который ставится на роутер пакетом apk и раздаёт встроенный веб-интерфейс. Панель работает с конфигом [sing-box-extended](https://github.com/shtorm-7/sing-box-extended) — форка sing-box: формы для узлов, правил маршрутизации и наборов правил (rule-set), ручная правка JSON и проверка значений по схеме форка до того, как конфиг попадёт на роутер.

Применение (Apply) проверяет конфиг бинарём sing-box, перезапускает службу, ждёт ответа Clash API и DNS и возвращает предыдущую версию, если проверка не прошла или вы не подтвердили в панели за минуту, что связь жива.

В пакете есть своя служба sing-box и перехват трафика LAN (nftables, tproxy, upstream для dnsmasq), поэтому metabox может работать вместо re:HomeProxy.

<img src="docs/screenshots/desktop/overview.png" alt="Обзор" />

## Возможности

- Правила маршрутизации: поиск, добавление, удаление, перестановка; форма правила для действия, наборов правил и ходовых условий или узел целиком в JSON
- Наборы правил: подключение remote и local, видно, какие правила ссылаются на каждый набор
- Каждая секция конфига в форме, собранной по схеме форка; незнакомые поля сохраняются как есть и помечаются в интерфейсе
- Весь конфиг текстом и построчный дифф перед применением
- Применение с проверками и автооткатом, история версий с восстановлением
- Соединения: живой список с фильтрами, выгрузка в CSV и JSON, объяснение, какое правило направило соединение
- Прокси: группы узлов с замером задержки, обновление подписок
- Устройства из аренд DHCP, переключатель «через sing-box» для каждого
- Обзор: трафик, соединения, топ устройств и узлов, загрузка, температура и память роутера
- Лог sing-box и диагностика перехвата
- Светлая и тёмная тема, русский и английский, раскладка для компьютера и телефона

## Скриншоты

<details>
<summary><b>Компьютер</b></summary>

|                                 Правила                                  |                                    Прокси                                    |
| :----------------------------------------------------------------------: | :--------------------------------------------------------------------------: |
| <img src="docs/screenshots/desktop/rules.png" alt="Rules" width="420" /> | <img src="docs/screenshots/desktop/proxies.png" alt="Proxies" width="420" /> |

|                                      Соединения                                      |                                  Устройства                                  |
| :----------------------------------------------------------------------------------: | :--------------------------------------------------------------------------: |
| <img src="docs/screenshots/desktop/connections.png" alt="Connections" width="420" /> | <img src="docs/screenshots/desktop/devices.png" alt="Devices" width="420" /> |

</details>

<details>
<summary><b>Телефон</b></summary>

|                                     Обзор                                     |                                 Правила                                 |                                     Соединения                                      |
| :---------------------------------------------------------------------------: | :---------------------------------------------------------------------: | :---------------------------------------------------------------------------------: |
| <img src="docs/screenshots/mobile/overview.png" alt="Overview" width="220" /> | <img src="docs/screenshots/mobile/rules.png" alt="Rules" width="220" /> | <img src="docs/screenshots/mobile/connections.png" alt="Connections" width="220" /> |

|                                   Прокси                                    |                                 Устройства                                  |                                 Логи                                  |
| :-------------------------------------------------------------------------: | :-------------------------------------------------------------------------: | :-------------------------------------------------------------------: |
| <img src="docs/screenshots/mobile/proxies.png" alt="Proxies" width="220" /> | <img src="docs/screenshots/mobile/devices.png" alt="Devices" width="220" /> | <img src="docs/screenshots/mobile/logs.png" alt="Logs" width="220" /> |

</details>

## Требования

- OpenWrt с пакетным менеджером apk: 25.12 или SNAPSHOT. Ветки 24.10 и старше используют opkg и не поддерживаются.
- aarch64, проверено на Banana Pi BPI-R4 Pro. Архитектура пакета должна совпадать с `/etc/apk/arch` на роутере; у прошивок mediatek/filogic это `aarch64_cortex-a53`.
- Пакет `sing-box-extended`, `metaboxd` объявляет его зависимостью. Проверенная версия — `1.14.1-extended-2.7.2`, пакеты для OpenWrt лежат в [релизах форка](https://github.com/shtorm-7/sing-box-extended/releases).

| Порт             | Кто слушает                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| 8088             | панель, на адресах сетей из `listen_interface`                           |
| 9090             | Clash API sing-box на `127.0.0.1`, если секцию `clash_api` добавил демон |
| 5331, 5332, 5333 | входы sing-box для перехвата: TCP через redirect, UDP через tproxy, DNS  |

## Установка

Пакет собирается на компьютере с Docker, Go, Node.js и pnpm — версии и подготовка в [`docs/Development.md`](./docs/Development.md). Архитектура пакета берётся из базового образа OpenWrt, поэтому для роутеров mediatek/filogic база собирается из образа прошивки:

```sh
pnpm install
make stand-base
make package METABOX_BASE_IMAGE=metabox/openwrt-device:latest
```

Без `METABOX_BASE_IMAGE` пакет соберётся под `aarch64_generic`, и роутер его не поставит. Результат — `dist/metaboxd.apk`.

На роутер копируются пакет панели и пакет форка той же архитектуры:

```sh
scp -O dist/metaboxd.apk sing-box-extended_1.14.1-extended-2.7.2_openwrt_aarch64_cortex-a53.apk root@192.168.1.1:/tmp/
```

На роутере:

```sh
apk add --allow-untrusted /tmp/sing-box-extended_*.apk /tmp/metaboxd.apk
/etc/init.d/sing-box stop
/etc/init.d/sing-box disable
```

`--allow-untrusted` нужен, потому что пакет пока не подписан ключом, которому доверяет роутер. Служба форка `sing-box` выключается, потому что sing-box поднимает служба metabox.

Если сейчас sing-box поднимает homeproxy, оставьте его как есть: перехват metabox по умолчанию выключен и с ним не конфликтует.

Положите конфиг sing-box в `/etc/sing-box/config.json` и запустите службы — при установке пакета они сами не стартуют.

```sh
/etc/init.d/metabox-singbox enable
/etc/init.d/metabox-singbox start
/etc/init.d/metaboxd enable
/etc/init.d/metaboxd start
```

## Первый запуск

Откройте `http://<адрес роутера в LAN>:8088`, например `http://192.168.1.1:8088`. Адрес нужен IP, а не имя: демон отвечает, только если в заголовке `Host` стоит IP-адрес или `localhost`, поэтому `http://openwrt.lan:8088` не откроется.

Демон читает `/etc/sing-box/config.json` как есть, отдельного импорта нет. Рукописный конфиг открывается в формах, а то, чего формы не знают, сохраняется без изменений и помечается в интерфейсе. Если в конфиге нет `experimental.clash_api`, демон добавит её при первом применении (`127.0.0.1:9090`, случайный секрет): через неё панель читает соединения и прокси.

| Что                        | Где                                                                |
| -------------------------- | ------------------------------------------------------------------ |
| Настройки панели           | `/etc/config/metabox`                                              |
| Конфиг sing-box            | `/etc/sing-box/config.json`, задаётся `config_dir` и `config_name` |
| Версии конфига и состояние | `/etc/metabox/`                                                    |
| Логи                       | `logread` или экран «Логи»                                         |

### Перехват трафика LAN

По умолчанию перехват выключен: `option enabled '0'` в секции `dataplane` файла `/etc/config/metabox`. Если стоит homeproxy, сначала остановите его, иначе две системы будут заворачивать один и тот же трафик.

В конфиге sing-box должны быть входы на портах из секции `dataplane`: `direct` на 5333 для DNS, `redirect` на 5331, `tproxy` на 5332 для UDP, а `route.default_mark` должен быть равен `self_mark` (100).

> [!WARNING]
> Без входа на 5333 у всей сети пропадёт DNS: dnsmasq отправляет запросы туда.

```sh
uci set metabox.dataplane.enabled='1'
uci commit metabox
/etc/init.d/metabox-singbox restart
```

В режиме `acl_mode 'listed'` (по умолчанию) через sing-box идут только устройства, которым проход включён на экране «Устройства» или которые перечислены в `source_ip` и `source_mac`. В режиме `all` — все устройства с `br-lan`.

## Безопасность

> [!IMPORTANT]
> **Входа по паролю пока нет.** Любой, кто открыл панель, управляет маршрутизацией всей сети.

- Демон слушает только сети из `listen_interface` в `/etc/config/metabox`, по умолчанию `lan`, и никогда `0.0.0.0`. Гостевую сеть добавляйте туда, только если доверяете всем её устройствам.
- Никогда не открывайте порт 8088 из WAN.
- Страница из интернета, открытая в вашем браузере, может слать запросы на адреса LAN. Поэтому запрос, который что-то меняет, демон выполняет, только если заголовок `Origin` совпадает с адресом самой панели, а запрос без `Origin` отклоняет. Проверка `Host` на каждом запросе закрывает DNS rebinding. Заголовков CORS демон не отдаёт.
- При установке пакета службы не стартуют, и порт закрыт, пока вы их не запустили.

## Обновление и удаление

```sh
apk add --allow-untrusted /tmp/metaboxd.apk
/etc/init.d/metabox-singbox restart
/etc/init.d/metaboxd restart
```

Ваш `/etc/config/metabox` при обновлении не затирается: версия из пакета ложится рядом как `/etc/config/metabox.apk-new`. sysupgrade сохраняет `/etc/config/metabox` и `/etc/metabox/`.

```sh
/etc/init.d/metaboxd stop
/etc/init.d/metaboxd disable
/etc/init.d/metabox-singbox stop
/etc/init.d/metabox-singbox disable
apk del metaboxd
```

`stop` службы `metabox-singbox` снимает перехват: правила nftables, `ip rule` и фрагмент dnsmasq. После удаления sing-box не запущен — если он нужен, включите службу форка или homeproxy.

## Документация

- [`docs/PRD.md`](./docs/PRD.md) — требования, критерии приёмки, этапы
- [`docs/adr/`](./docs/adr/README.md) — архитектурные решения
- [`apps/metaboxd/docs/guides/`](./apps/metaboxd/docs/guides/README.md) — гайды демона: HTTP API, работа с устройством, ошибки и логи
- [`apps/web/docs/`](./apps/web/docs/README.md) — гайды фронтенда
- [`docs/Development.md`](./docs/Development.md) — сборка, стенд, команды
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — ветки, коммиты, проверки

## Лицензия

[GPL-3.0-or-later](./LICENSE). Код можно использовать, менять и распространять, в том числе за деньги. Тот, кто распространяет программу или изменённую версию, передаёт её под той же лицензией вместе с исходным кодом.
