[English](./Development.md) · **Русский**

# Разработка

Как собрать metabox из исходников, поднять стенд и прогнать проверки. Процесс — ветки, коммиты, PR — в [`CONTRIBUTING.ru.md`](../CONTRIBUTING.ru.md), правила разработки — в [`AGENTS.md`](../AGENTS.md) и `AGENTS.md` каждого проекта.

## Устройство репозитория

Монорепозиторий: каждый проект держит в своей папке код, манифест, правила (`AGENTS.md`) и гайды. Сборку связывает [`Makefile`](../Makefile), JS-пакеты — pnpm-воркспейс.

| Проект           | Папка              | Что это                                                                |
| ---------------- | ------------------ | ---------------------------------------------------------------------- |
| Демон `metaboxd` | `apps/metaboxd/`   | Go, модуль `metabox`. Владеет файлами конфига и раздаёт встроенную SPA |
| Фронтенд         | `apps/web/`        | Vite и React, пакет pnpm-воркспейса. Собирается внутрь бинаря демона   |
| Генератор схемы  | `tools/schemagen/` | Go, отдельный модуль. Строит Zod-схему конфига из исходников форка     |

Стенд и образ OpenWrt — `.devcontainer/`, пакет для роутера — `apps/metaboxd/package/`, CI — `.github/workflows/`.

## Что нужно

- Go — версия в [`.go-version`](../.go-version).
- Node.js и pnpm — поля `engines` и `packageManager` в [`package.json`](../package.json).
- Docker — для стенда и сборки пакета: apk-tools 3, которым собирается пакет, есть только в контейнере.

Первая команда — `pnpm install`: она же ставит git-хуки lefthook.

Go-команды выполняются из каталога модуля, модуля в корне нет. Сборка, генерация и линт Go идут через `make` из корня, тесты демона можно запускать и напрямую: `cd apps/metaboxd && go test ./...`.

## Команды

Сборка и генерация:

| Команда              | Что делает                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `make daemon`        | собирает SPA и демон под текущую машину в `dist/metaboxd`                                 |
| `make daemon-device` | собирает SPA и демон под роутер (`linux/arm64`, без cgo) в `dist/metaboxd-linux-arm64`    |
| `make daemon-target` | собирает демон внутри dev-контейнера; на macOS `make daemon` даёт darwin-бинарь           |
| `make package`       | собирает пакет `dist/metaboxd.apk` той же стадией Docker, что ставит панель в стенд       |
| `make schema`        | перегенерирует схему конфига из форка в `apps/web/src/shared/api/generated.ts`            |
| `make schema-daemon` | перепечатывает контракт демона для панели в `apps/web/src/shared/api/daemon.generated.ts` |
| `make clean`         | удаляет `dist/`, сборку фронта и скопированную в демон статику                            |

Фронтенд без стенда:

| Команда                 | Что делает                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `make dev`              | дев-сервер Vite                                                                             |
| `make dev-mock`         | дев-сервер на моках MSW: демон и sing-box не нужны, данные берутся из фикстур               |
| `make dev-mock-missing` | моки отвечают только там, где у демона ещё нет ручек, остальные запросы идут на живой демон |

Стенд — OpenWrt в контейнере с procd, sing-box и панелью из пакета, с проводной, гостевой и внешней сетью ([ADR-0023](./adr/ADR-0023-build-the-bench-from-the-device-firmware.md)):

| Команда                     | Что делает                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| `make stand-base`           | собирает базу стенда из образа прошивки BPI-R4 с downloads.openwrt.org            |
| `make up`                   | поднимает стенд; панель на `http://localhost:8080`, Clash API на 9090             |
| `make up-dev`               | то же плюс дев-сервер Vite с HMR на 5173                                          |
| `make down`                 | останавливает стенд                                                               |
| `make stand-reset`          | возвращает конфиг стенда к эталону из образа                                      |
| `make sh`, `make target-sh` | shell в dev-контейнере и в контейнере OpenWrt                                     |
| `make apply-check`          | прогоняет цикл Apply в стенде                                                     |
| `make reach-check`          | проверяет, что панель отвечает из локальных сетей стенда и не отвечает из внешней |
| `make dataplane-check`      | проверяет перехват трафика; нужен privileged-контейнер и ядро с tproxy            |

Проверки:

| Команда             | Что делает                                    |
| ------------------- | --------------------------------------------- |
| `make test`         | тесты демона, генератора и фронтенда          |
| `make lint`         | golangci-lint по обоим Go-модулям             |
| `pnpm lint`         | oxlint по всему репозиторию                   |
| `pnpm format`       | oxfmt по всему репозиторию                    |
| `pnpm format:check` | проверка формата без правки                   |
| `make hooks`        | ставит git-хуки, если `pnpm install` не успел |

`pnpm lint` запускается только из корня: плагин Tailwind ищет конфиг фронта от каталога запуска. Полный список проверок перед коммитом и что гоняет CI — в [`CONTRIBUTING.ru.md`](../CONTRIBUTING.ru.md).

## Пакет на роутер

Архитектура пакета берётся из базового образа OpenWrt и должна совпадать с `/etc/apk/arch` на роутере, иначе apk пакет не поставит. Для роутеров mediatek/filogic (`aarch64_cortex-a53`) база собирается из образа прошивки; без `METABOX_BASE_IMAGE` пакет соберётся под `aarch64_generic`.

```sh
pnpm install
make stand-base
make package METABOX_BASE_IMAGE=metabox/openwrt-device:latest
```

На роутер копируются `dist/metaboxd.apk` и пакет [sing-box-extended](https://github.com/shtorm-7/sing-box-extended/releases) той же архитектуры. У dropbear на OpenWrt нет sftp-сервера, поэтому `scp` нужен с `-O`:

```sh
scp -O dist/metaboxd.apk sing-box-extended_1.14.1-extended-2.7.2_openwrt_aarch64_cortex-a53.apk root@192.168.1.1:/tmp/
```

На роутере, тем же способом и при обновлении:

```sh
apk add --allow-untrusted /tmp/sing-box-extended_*.apk /tmp/metaboxd.apk
```

`--allow-untrusted` нужен, потому что пакет из `make package` не подписан.

## Переменные сборки

Версия выпуска — файл [`VERSION`](../VERSION) в semver. Из неё `make` выводит версию бинаря и версию пакета apk: `0.1.0-rc.2` становится `0.1.0_rc2-r0` ([ADR-0050](./adr/ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)).

Настройки стенда и пакета — образ базы, архитектура, версия sing-box-extended — задаются в `.devcontainer/.env`, файл не коммитится. Таблица переменных — в разделе «Специфика частей» [`CONTRIBUTING.ru.md`](../CONTRIBUTING.ru.md). Без `.env` стенд и пакет собираются на публичном образе `openwrt/rootfs:aarch64_generic-25.12.4`.
