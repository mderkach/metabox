[English](./Development.md) · **Русский**

# Разработка

Как собрать metabox из исходников, поднять стенд и прогнать проверки. Как прислать изменение — в [`CONTRIBUTING.ru.md`](../CONTRIBUTING.ru.md). Релизы и другие задачи мейнтейнера — в [`Maintaining.ru.md`](./Maintaining.ru.md).

## Быстрый старт

```sh
pnpm install
make dev-mock
```

`pnpm install` ставит зависимости и git-хуки. `make dev-mock` запускает дев-сервер Vite на тестовых данных (моках): панель работает без роутера, демона и sing-box. Откройте адрес, который напечатает Vite.

## Устройство репозитория

Монорепозиторий. Каждый проект держит в своей папке код, манифест, правила (`AGENTS.md`) и гайды. Сборку связывает [`Makefile`](../Makefile), JS-пакеты — pnpm-воркспейс.

| Проект           | Папка              | Что это                                                                   |
| ---------------- | ------------------ | ------------------------------------------------------------------------- |
| Демон `metaboxd` | `apps/metaboxd/`   | Go, модуль `metabox`. Владеет файлами конфига и раздаёт встроенную панель |
| Фронтенд         | `apps/web/`        | Vite и React, пакет pnpm-воркспейса. Собирается внутрь бинаря демона      |
| Генератор схемы  | `tools/schemagen/` | Go, отдельный модуль. Строит схему конфига по коду sing-box-extended      |

Остальное: стенд — в `.devcontainer/`, файлы пакета для роутера — в `apps/metaboxd/package/`, CI — в `.github/workflows/`.

## Что нужно

- Go — версия в [`.go-version`](../.go-version).
- Node.js и pnpm — поля `engines` и `packageManager` в [`package.json`](../package.json).
- Docker — для стенда и сборки пакета. Пакет собирается apk-tools 3, которые работают только в контейнере.

Git-хуки: их ставит `pnpm install` через скрипт `prepare` в `package.json`; `make hooks` ставит их заново.

Go-модуля в корне репозитория нет. Сборка, генерация и линт Go идут через `make` из корня. Тесты демона можно запускать и напрямую: `cd apps/metaboxd && go test ./...`.

## Команды

Сборка и генерация:

| Команда              | Что делает                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make daemon`        | собирает панель и демон под текущую машину в `dist/metaboxd`                                                                                        |
| `make daemon-device` | собирает панель и демон под роутер (`linux/arm64`, без cgo) в `dist/metaboxd-linux-arm64`                                                           |
| `make daemon-target` | собирает демон внутри dev-контейнера; на macOS `make daemon` даёт darwin-бинарь                                                                     |
| `make package`       | собирает пакет `dist/metaboxd.apk`                                                                                                                  |
| `make schema`        | перегенерирует схему конфига в `apps/web/src/shared/api/generated.ts` и справочник полей для MCP в `apps/metaboxd/internal/mcp/fields.generated.go` |
| `make schema-daemon` | перепечатывает контракт демона для панели в `apps/web/src/shared/api/daemon.generated.ts`                                                           |
| `make clean`         | удаляет `dist/`, сборку фронта и скопированную в демон статику                                                                                      |

Фронтенд без стенда:

| Команда                 | Что делает                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `make dev`              | дев-сервер Vite                                                                             |
| `make dev-mock`         | дев-сервер на моках: демон и sing-box не нужны                                              |
| `make dev-mock-missing` | моки отвечают только там, где у демона ещё нет ручек, остальные запросы идут на живой демон |

Проверки:

| Команда             | Что делает                           |
| ------------------- | ------------------------------------ |
| `make test`         | тесты демона, генератора и фронтенда |
| `make lint`         | golangci-lint по обоим Go-модулям    |
| `pnpm lint`         | oxlint по всему репозиторию          |
| `pnpm format`       | oxfmt по всему репозиторию           |
| `pnpm format:check` | проверка формата без правки          |
| `make hooks`        | ставит git-хуки заново               |

`pnpm lint` запускается только из корня: плагин Tailwind ищет конфиг фронта от текущего каталога. Полный список проверок перед коммитом — в [`CONTRIBUTING.ru.md`](../CONTRIBUTING.ru.md#проверки-перед-коммитом).

Схема конфига генерируется по версии sing-box-extended, закреплённой в блоке `replace` файла `tools/schemagen/go.mod`. Как обновляется эта версия — в [`Maintaining.ru.md`](./Maintaining.ru.md#обновления-sing-box-extended).

## Стенд

Стенд — OpenWrt в контейнере. В нём работают procd, sing-box и панель, поставленная из пакета, и есть проводная, гостевая и внешняя сети ([ADR-0023](./adr/ADR-0023-build-the-bench-from-the-device-firmware.md)).

На стенде панель слушает порт 8080, на роутере — 8088. Свой порт стенд задаёт в `.devcontainer/target/files/etc/config/metabox`.

| Команда                     | Что делает                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| `make stand-base`           | собирает базу стенда из образа прошивки BPI-R4 с downloads.openwrt.org            |
| `make up`                   | поднимает стенд; панель на `http://localhost:8080`, Clash API на 9090             |
| `make up-dev`               | то же плюс дев-сервер Vite с HMR на 5173                                          |
| `make down`                 | останавливает стенд                                                               |
| `make stand-reset`          | возвращает конфиг sing-box стенда к эталону из образа                             |
| `make sh`, `make target-sh` | shell в dev-контейнере и в контейнере OpenWrt                                     |
| `make apply-check`          | прогоняет цикл Apply на стенде                                                    |
| `make reach-check`          | проверяет, что панель отвечает из локальных сетей стенда и не отвечает из внешней |
| `make dataplane-check`      | проверяет перехват трафика LAN; нужен privileged-контейнер и ядро с tproxy        |

Переменные стенда задаются в `.devcontainer/.env`. Файл не коммитится. Его читают и docker compose, и `make`, поэтому `make package` собирает пакет под ту же архитектуру, на которой работает стенд. Без `.env` стенд собирается на публичном образе OpenWrt — так же, как в CI.

| Переменная           | Значение по умолчанию                       | Зачем                                                                   |
| -------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `METABOX_BASE_IMAGE` | `openwrt/rootfs:aarch64_generic-25.12.4`    | база стенда; после `make stand-base` — `metabox/openwrt-device:latest`  |
| `DEVICE_IMAGE_URL`   | релизный образ BPI-R4 с filogic             | образ устройства, из которого `make stand-base` берёт корневую ФС       |
| `DAEMON_BINARY`      | `dist/metaboxd-linux-arm64`                 | бинарь, из которого собирается пакет                                    |
| `OPENWRT_PLATFORM`   | `linux/aarch64_generic`                     | платформа образа: у публичного rootfs она нестандартная и задаётся явно |
| `PKG_VERSION`        | из `VERSION`: `0.1.0-rc.2` → `0.1.0_rc2-r0` | версия пакета: пре-релиз semver apk пишет суффиксом `_rcN`              |
| `SINGBOX_VERSION`    | `1.14.1-extended-2.7.2`                     | релиз sing-box-extended, который ставится на стенд                      |
| `PKG_ARCH`           | пусто — архитектура базового образа         | архитектура пакета; релиз задаёт роутерную `aarch64_cortex-a53`         |
| `APK_SIGN_KEY`       | пусто — пакет без подписи                   | путь к приватному ключу, которым подписывается пакет                    |

`PKG_ARCH` и `APK_SIGN_KEY` читает только `make`. Их задаёт релиз, стенд собирается без них.

### Тест HTTP Apply на стенде CI

Интеграционная джоба CI также запускает `go test -tags integration -run TestApplyHTTPOnEphemeralBench -count=1 -v -timeout 5m .` из `apps/metaboxd` против своего одноразового стенда. Тест проверяет HTTP Apply, подтверждение, отказ без записи, откат по таймеру, перезапуск демона и прерванную запись.

Нужны `CI=true` и `METABOX_EPHEMERAL_BENCH=1`: тест меняет конфиг и перезапускает демон, поэтому на своём стенде его не включайте. `make apply-check` остаётся независимой проверкой окружения. Контейнерные тесты не подтверждают восстановление после отключения питания и `fsync` каталога на overlayfs роутера ([ADR-0067](./adr/ADR-0067-test-http-apply-on-the-disposable-ci-bench.md)).

## Пакет для роутера

`make package` собирает пакет той же стадией Docker, что ставит панель на стенд, поэтому они не могут разойтись.

Архитектура пакета берётся из базового образа стенда. Она должна совпадать с `/etc/apk/arch` на роутере, иначе apk пакет не поставит. Для роутеров mediatek/filogic (`aarch64_cortex-a53`) сначала соберите базу из образа прошивки. Без `METABOX_BASE_IMAGE` пакет соберётся под `aarch64_generic`.

```sh
pnpm install
make stand-base
make package METABOX_BASE_IMAGE=metabox/openwrt-device:latest
```

Версия пакета берётся из файла [`VERSION`](../VERSION) в semver: `0.1.0-rc.2` становится `0.1.0_rc2-r0` ([ADR-0050](./adr/ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)).

Скопируйте на роутер `dist/metaboxd.apk` и пакет [sing-box-extended](https://github.com/shtorm-7/sing-box-extended/releases) той же архитектуры. У dropbear на OpenWrt нет sftp-сервера, поэтому `scp` нужен с `-O`:

```sh
scp -O dist/metaboxd.apk sing-box-extended_1.14.1-extended-2.7.2_openwrt_aarch64_cortex-a53.apk root@192.168.1.1:/tmp/
```

На роутере (так же и при обновлении):

```sh
apk add --allow-untrusted /tmp/sing-box-extended_*.apk /tmp/metaboxd.apk
```

`--allow-untrusted` нужен, потому что пакет из `make package` не подписан. Пакет, поставленный из файла, закрепляется за этим файлом; как вернуться на репозиторий — в README, раздел «Обновление и удаление».
