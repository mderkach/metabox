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

| Команда              | Что делает                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `make daemon`        | собирает SPA и демон под текущую машину в `dist/metaboxd`                                                                                                    |
| `make daemon-device` | собирает SPA и демон под роутер (`linux/arm64`, без cgo) в `dist/metaboxd-linux-arm64`                                                                       |
| `make daemon-target` | собирает демон внутри dev-контейнера; на macOS `make daemon` даёт darwin-бинарь                                                                              |
| `make package`       | собирает пакет `dist/metaboxd.apk` той же стадией Docker, что ставит панель в стенд                                                                          |
| `make schema`        | перегенерирует схему конфига из форка в `apps/web/src/shared/api/generated.ts` и справочник полей для MCP в `apps/metaboxd/internal/mcp/fields.generated.go` |
| `make schema-daemon` | перепечатывает контракт демона для панели в `apps/web/src/shared/api/daemon.generated.ts`                                                                    |
| `make clean`         | удаляет `dist/`, сборку фронта и скопированную в демон статику                                                                                               |

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

## Схема и релизы форка

Схема генерируется из релиза sing-box-extended, закреплённого в блоке `replace` файла `tools/schemagen/go.mod`. Workflow `fork release watch` (`.github/workflows/fork-release-watch.yml`) запускается раз в сутки и вручную (`workflow_dispatch`; необязательный `dry_run` печатает diff и ничего не пушит). Он сравнивает закреплённую версию с последним релизом форка и при совпадении пишет в лог `no change`. Иначе пересобирает блок `replace` по `go.mod` форка на новом теге, поднимает `forkVersion` в `tools/schemagen/main.go`, выполняет `go mod tidy` и `make schema` и открывает один PR из ветки `build/bump-sing-box-extended`: в описании обе версии и diff схемы. Когда ветка уже предлагает последний релиз, workflow проверяет открытый PR в `main` и восстанавливает отсутствующий PR без изменения ветки. Существующая ветка с другой версией приводит к ошибке с пояснением, а не перезаписывается: перед повтором её нужно проверить и слить либо удалить. Новая ветка пушится обычным push, без force-push.

Workflow не трогает `SINGBOX_VERSION` стенда, `install.sh` и README: они следуют за бинарником, проверенным на роутере.

PR, открытый стандартным `GITHUB_TOKEN`, не запускает workflow, и обязательные `checks` и `integration` не пойдут. Поэтому перед push новой ветки или восстановлением отсутствующего PR workflow требует существующий секрет репозитория `FORK_BUMP_TOKEN` (токен с правом записи в `contents` и `pull requests`). Без него сравнение и `dry_run` работают со стандартным токеном, но необходимая запись завершается ошибкой с понятной подсказкой. Отказ при создании PR тоже завершает workflow ошибкой и оставляет ветку для повтора; следующий запуск восстанавливает её PR вместо ложного успеха. Workflow не меняет настройки и секреты репозитория. Ветви решения проверяются без сети командой `bash .github/scripts/fork-release-check.test.sh`, которая выполняется и в CI.

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

## Релиз

Релиз — тег `v*` на коммите из `main`. Workflow [`release`](../.github/workflows/release.yml) проверяет, что тег равен `v` плюс [`VERSION`](../VERSION), что `apps/web/package.json` объявляет ту же версию и что последний прогон `checks` в CI для коммита тега успешен, собирает пакет под `aarch64_cortex-a53` с подписью ключом из секрета `APK_SIGN_KEY`, сверяет подпись с `keys/metabox-release.pem` и публикует GitHub Release с пакетом, его sha256 и публичным ключом. Версия с суффиксом пре-релиза публикуется как prerelease. Затем workflow [`apk repository`](../.github/workflows/apk-repo.yml) пересобирает репозиторий пакетов из всех релизов и выкладывает его на GitHub Pages; его же можно запустить руками со вкладки Actions, так что релиз с упавшей выкладкой переиздаётся без нового тега. Pages владелец включает один раз с источником «GitHub Actions», а окружению `github-pages`, которое при этом создаётся, добавляет правило для тегов `v*`: релизная джоба деплоит с тега.

```sh
gh api -X POST repos/mderkach/metabox/pages -f build_type=workflow
gh api -X POST repos/mderkach/metabox/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
```

Шаги: PR с правкой `VERSION` и `apps/web/package.json`; после мержа — тег на коммит мержа:

```sh
git switch main && git pull --ff-only
git tag v$(cat VERSION)
git push origin v$(cat VERSION)
```

### Ключ подписи

Создаёт владелец один раз, на своей машине и вне репозитория. Приватный ключ попадает только в секрет репозитория: в git его не коммитят и на роутер не кладут.

```sh
mkdir -p ~/.config/metabox keys
(umask 077 && openssl ecparam -name prime256v1 -genkey -noout -out ~/.config/metabox/release.key)
openssl ec -in ~/.config/metabox/release.key -pubout -out keys/metabox-release.pem
gh secret set APK_SIGN_KEY < ~/.config/metabox/release.key
```

`keys/metabox-release.pem` попадает в `main` через PR до первого тега, иначе релиз упадёт. Потеря приватного ключа — новая пара и замена публичного на каждом роутере; утёкший ключ меняется так же.

### Установка релиза на роутер

Публичный ключ кладётся на роутер один раз:

```sh
wget -O /etc/apk/keys/metabox-release.pem https://raw.githubusercontent.com/mderkach/metabox/main/keys/metabox-release.pem
```

После этого пакет релиза ставится и обновляется без `--allow-untrusted`, а пакет, изменённый по дороге или подписанный другим ключом, apk отвергает. `sing-box-extended` должен уже стоять: он этим ключом не подписан и в репозитории его нет.

Пакеты берутся из репозитория на GitHub Pages. Его индекс подписан тем же ключом, каналов два: в `testing` лежат все релизы, в `stable` — только версии без суффикса пре-релиза, поэтому `stable` пуст до первой такой версии. Канал подключается одной строкой в `/etc/apk/repositories.d/`:

```sh
echo https://mderkach.github.io/metabox/apk/testing/packages.adb > /etc/apk/repositories.d/metabox.list
apk update
apk add metaboxd
```

Новый релиз после этого ставится командой `apk upgrade metaboxd`; пакет перезапускает демон, если тот был запущен, а sing-box продолжает работать. Скачанный отдельно пакет по-прежнему ставится по пути: `apk add /tmp/metaboxd-<версия>.apk`.

Пакет, установленный из файла, записывается в `/etc/apk/world` с привязкой к хешу, `metaboxd><Q1…`, чтобы оставался именно этот файл. `apk upgrade metaboxd` такую запись не двигает, а `apk add -u metaboxd` обновляет пакет вместе с зависимостями и тянет за собой обновления системы. Чтобы вернуться на репозиторий, ставят из него точную версию, а затем обычное имя:

```sh
apk add metaboxd=<версия>
apk add metaboxd
```

Вторая команда превращает запись в обычное `metaboxd`; дальше `apk upgrade metaboxd` обновляет его как описано выше. Пакет, поставленный из файла, возвращает на версию из репозитория и `apk upgrade --available` ([apk-add(8)](https://gitlab.alpinelinux.org/alpine/apk-tools/-/blob/master/doc/apk-add.8.scd)).

На чистом роутере эти шаги делает [`install.sh`](../install.sh), а перед ними ставит пакет форка ([ADR-0058](./adr/ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md)). Релиз прикладывает скрипт к себе, а workflow apk-repo кладёт копию из самого нового релиза по адресу `https://mderkach.github.io/metabox/install.sh`. Версия форка и его sha256 записаны в скрипте: подъём форка меняет их вместе с `SINGBOX_VERSION` в `.devcontainer/target/Dockerfile`. sha256 — это `digest` ассета релиза: `gh api repos/shtorm-7/sing-box-extended/releases/tags/v<версия> --jq '.assets[] | select(.name | endswith("openwrt_aarch64_cortex-a53.apk")) | .digest'`.

## Переменные сборки

Версия выпуска — файл [`VERSION`](../VERSION) в semver. Из неё `make` выводит версию бинаря и версию пакета apk: `0.1.0-rc.2` становится `0.1.0_rc2-r0` ([ADR-0050](./adr/ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md)).

Настройки стенда и пакета — образ базы, архитектура, версия sing-box-extended — задаются в `.devcontainer/.env`, файл не коммитится. Таблица переменных — в разделе «Специфика частей» [`CONTRIBUTING.ru.md`](../CONTRIBUTING.ru.md). Без `.env` стенд и пакет собираются на публичном образе `openwrt/rootfs:aarch64_generic-25.12.4`.
