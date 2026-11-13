[English](./Maintaining.md) · **Русский**

# Сопровождение

Задачи, для которых нужны права владельца репозитория: релизы, ключ подписи, GitHub Pages, правила веток, обновления sing-box-extended и OpenWrt. Сборка и стенд — в [`Development.ru.md`](./Development.ru.md).

## Релиз

Релиз — тег `v*` на коммите из `main`.

1. Откройте PR, который меняет [`VERSION`](../VERSION) и версию в `apps/web/package.json`.
2. После мержа поставьте тег на коммит мержа:

   ```sh
   git switch main && git pull --ff-only
   git tag v$(cat VERSION)
   git push origin v$(cat VERSION)
   ```

Дальше workflow [`release`](../.github/workflows/release.yml):

- проверяет, что тег равен `v` плюс `VERSION` и что в `apps/web/package.json` та же версия;
- проверяет, что последний прогон `checks` в CI для коммита тега прошёл;
- собирает пакет под `aarch64_cortex-a53` с подписью ключом из секрета `APK_SIGN_KEY` и сверяет подпись с `keys/metabox-release.pem`;
- публикует GitHub Release с пакетом, его sha256 и публичным ключом. Версия с суффиксом пре-релиза публикуется как prerelease.

Публикации одного тега идут по очереди. До создания релиза workflow сохраняет четыре проверенных публичных файла одним неизменяемым артефактом Actions. Имя артефакта содержит тег и полный коммит, внутри — манифест SHA256, привязанный к репозиторию и прогону ([ADR-0068](./adr/ADR-0068-persist-the-verified-release-bundle-before-publication.md)). Ключа подписи в артефакте нет. Артефакт хранится 90 дней в пределах политики репозитория.

Артефакт — ненадёжный источник восстановления: на rc.10 ([прогон 41328436212](https://github.com/mderkach/metabox/actions/runs/41328436212)) артефакт, сохранённый попыткой 2, исчез к старту попытки 3, и повтор остановился с «original verified publication bundle is unavailable». GitHub не документирует судьбу артефактов между попытками прогона.

Если публикация упала, сначала посмотрите артефакты исходного прогона (`gh api repos/<owner>/<repo>/actions/runs/<run id>/artifacts`). Если пакет там есть, перезапустите исходный прогон: он восстановит сохранённые файлы, пропустит сборку и подпись и заново проверит подпись пакета. Если нет, повтор падает намеренно, а черновик тега остаётся: владелец удаляет его вручную и перезапускает, workflow соберёт и подпишет новый пакет. Пока черновик есть, новый прогон для того же тега не создавайте. Публикация начинается с черновика на коммите тега: workflow загружает только недостающие файлы, скачивает и сравнивает все четыре, затем публикует черновик; репозиторий пакетов черновики пропускает. Workflow останавливается, не заменяя файлы, если исходного артефакта нет или он просрочен, коммит другой, файл лишний или отличается либо релиз уже опубликован.

Регрессионные тесты публикации, включая повтор из чистого каталога, подменяют ответы GitHub: `python3 .github/tests/test_release_publish.py`.

Затем workflow [`apk repository`](../.github/workflows/apk-repo.yml) пересобирает репозиторий пакетов из всех релизов и выкладывает его на GitHub Pages. Он же копирует `install.sh` из самого нового релиза по адресу `https://mderkach.github.io/metabox/install.sh`. Если выкладка упала, запустите этот workflow руками со вкладки Actions; новый тег не нужен.

В репозитории два канала. В `testing` релизы, включая пре-релизы. В `stable` только версии без суффикса пре-релиза.

Срок хранения: каждый канал держит 10 новейших версий (`RETAIN` в workflow), потому что пакет весит около 5,5 МБ, а лимит Pages — 1 ГБ. В `testing` дополнительно остаётся новейшая стабильная версия, даже если новее неё 10 пре-релизов, поэтому версия, на которую указывает `stable`, не выпадает. Старые пакеты уходят из индекса и с сайта при следующей выкладке; их GitHub Releases не трогаются, а если поднять `RETAIN` и перезапустить workflow, пакеты вернутся.

### GitHub Pages

Включите Pages один раз с источником «GitHub Actions». Затем разрешите теги `v*` в окружении `github-pages`, которое при этом создаётся: релиз деплоит с тега.

```sh
gh api -X POST repos/mderkach/metabox/pages -f build_type=workflow
gh api -X POST repos/mderkach/metabox/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
```

### Ключ подписи

Создаётся один раз, на своей машине, вне репозитория. Приватный ключ попадает только в секрет репозитория. В git его не коммитят и на роутер не кладут.

```sh
mkdir -p ~/.config/metabox keys
(umask 077 && openssl ecparam -name prime256v1 -genkey -noout -out ~/.config/metabox/release.key)
openssl ec -in ~/.config/metabox/release.key -pubout -out keys/metabox-release.pem
gh secret set APK_SIGN_KEY < ~/.config/metabox/release.key
```

`keys/metabox-release.pem` должен попасть в `main` через PR до первого тега, иначе релиз упадёт. Если приватный ключ потерян или утёк, создайте новую пару и замените публичный ключ на каждом роутере.

## Правило ветки

В `main` изменения попадают только через PR. Правило репозитория закрывает мерж, пока не прошли джобы CI `checks` и `integration`. `checks` уже включает `integration`; вторую запись из правила можно убрать. Правило хранит имена джоб, поэтому переименование джобы в `ci.yml` требует правки правила в том же изменении. Иначе мерж будет ждать проверку, которой больше нет.

## Actions в workflow

Каждый внешний action в `.github/workflows/` закреплён по SHA коммита, тег указан комментарием в конце строки (`uses: actions/checkout@<sha> # v5`). Тег можно переставить, SHA нельзя. Чтобы обновить action, получите SHA нового тега через `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (у аннотированного тега `type` равен `tag`: разыменуйте его через `git/tags/<sha>`) и замените SHA и комментарий вместе.

## Обновления sing-box-extended

Схема конфига генерируется по версии sing-box-extended, закреплённой в `tools/schemagen/go.mod`.

Workflow [`fork release watch`](../.github/workflows/fork-release-watch.yml) запускается раз в сутки и вручную (`dry_run` печатает diff и ничего не пушит). Когда выходит новый релиз sing-box-extended, он обновляет закреплённую версию, перегенерирует схему через `make schema` и открывает PR из ветки `build/bump-sing-box-extended`. Существующую ветку с другой версией он не перезаписывает: сначала проверьте и слейте её или удалите. Если в ветке последняя версия, а PR нет (например, PR-шаг упал после пуша), следующий прогон откроет PR из этой ветки, а если не сможет — упадёт; зелёным без PR он не закончится.

Workflow нужен секрет `FORK_BUMP_TOKEN` — токен с правом записи в `contents` и `pull requests`. PR, открытый стандартным `GITHUB_TOKEN`, не запускает CI, и обязательные проверки не пройдут никогда. Без секрета workflow падает до любого пуша, кроме `dry_run`. Стандартный токен к тому же не может открывать PR, пока в настройках репозитория не включено «Allow GitHub Actions to create and approve pull requests» (Settings, Actions, General); так первый прогон и упал с «GitHub Actions is not permitted to create or approve pull requests».

Логика workflow проверяется без сети командой `bash .github/scripts/fork-release-check.test.sh`; её же запускает CI.

### Ревью PR с обновлением

Генератор и панель зависят от внутренностей форка, которые тесты покрывают не полностью. Перед слиянием PR с обновлением пройдите по diff форка из описания PR и проверьте:

- **Типы под тегами сборки.** Какой тип узла требует какой тег сборки, генератор читает из исходников `include/` форка (`tools/schemagen/gates.go`, [ADR-0030](./adr/ADR-0030-read-the-build-composition-from-the-binary-and-the-fork-sources.md)). `TestBuildGates` проверяет известные случаи, а не полноту. Сверьте новые и изменённые строки `//go:build` в `include/` с `BUILD_TAG_OF_TYPE` в diff схемы.
- **Опции под тегами сборки.** Таблица `optionGates` в `tools/schemagen/optiongates.go` написана вручную. Генерация падает, если перечисленный в ней файл-заглушка переехал или сменил условие, но опцию, которую закрывает новая заглушка, никто не заметит. Для каждой новой заглушки `//go:build !with_*` вне `include/`, которая закрывает опцию конфига, добавьте запись в `optionGates`; после этого проверка типов потребует детектор в `OPTION_FINDERS` (`apps/web/src/entities/Config/model/Config.build.ts`).
- **`with_purego`.** `SCHEMA_TAGS` в `Makefile` добавляет `with_purego` к `release/DEFAULT_BUILD_TAGS` форка: без него `with_naive_outbound` линкует `libcronet.a` из cronet, который GNU ld в CI отвергает. Схема должна совпадать байт в байт со схемой, сгенерированной без этого тега: на машине, чей линкер принимает cronet (macOS принимает), `make schema SCHEMA_TAGS="$(cat <каталог модуля форка>/release/DEFAULT_BUILD_TAGS)"` не должен менять `generated.ts`. Если форк начнёт регистрировать типы, зависящие от cgo, тег придётся убрать.
- **`go:linkname` в `common/force_close`.** Форк линкует неэкспортируемые символы `golang.org/x/net/http2` и `net/http` через `//go:linkname`, в вариантах файла для `!go1.27`, `go1.27 && badlinkname` и `go1.27 && !badlinkname` (`badlinkname` приходит из тегов форка). Это внутренние символы Go: когда меняется форк или версия Go в `.go-version`, отсутствующий или устаревший вариант роняет `make test-schemagen` на линковке.
- **Строковые константы.** `constantStrings` в `tools/schemagen/types.go` читает пакет `constant` форка через `go/parser.ParseDir`, который не учитывает теги сборки (см. исключение в `.golangci.yml`). Это верно, пока от тегов там зависят только булевы константы. Если форк добавит зависящий от тега вариант файла со строковыми константами, переведите функцию на `golang.org/x/tools/go/packages`.
- **Эндпоинты rule providers.** Rule providers Clash API в форке — заглушка (`experimental/clashapi/ruleprovider.go`): `GET /providers/rules` возвращает пустой список, а любой запрос к `/providers/rules/{name}` отвечает 404. Набор правил `remote` обновляется только по своему `update_interval` или при перезапуске сервиса. Если форк реализует эти эндпоинты, заведите issue на действие обновления на экране наборов правил.

### Версия, которая ставится на роутеры

Workflow не меняет версию, которая ставится на роутеры и на стенд: она следует за сборкой, проверенной на настоящем роутере. [`install.sh`](../install.sh) закрепляет её в `SINGBOX_VERSION` и `SINGBOX_SHA256` и сверяет скачанный пакет с этим хешем. Чтобы перейти на новую версию, в одном коммите поменяйте:

- `sing-box-extended.sha256`: имя файла несёт версию, строка — хеш; стенд читает этот файл;
- `SINGBOX_VERSION` и `SINGBOX_SHA256` в `install.sh` (`make singbox-pin-check` сверяет их с файлом);
- проверенную версию в README и примеры в `docs/Development.md`.

В файле есть строки для `aarch64_cortex-a53` (роутер), `aarch64_generic` (стенд на публичном rootfs) и `x86_64` (стенд в CI). sha256 — это `digest` ассета релиза; для остальных строк замените суффикс архитектуры:

```sh
gh api repos/shtorm-7/sing-box-extended/releases/tags/v<версия> --jq '.assets[] | select(.name | endswith("openwrt_aarch64_cortex-a53.apk")) | .digest'
```

Решение о скрипте установки — [ADR-0058](./adr/ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md).

## Обновления OpenWrt

Стенд и CI следуют за релизом OpenWrt целевого устройства ([ADR-0023](./adr/ADR-0023-build-the-bench-from-the-device-firmware.md)). Релиз закреплён в нескольких местах; меняйте их одним коммитом:

- `DEVICE_IMAGE_URL` в `.devcontainer/target/device-base/Dockerfile`: sysupgrade-образ прошивки устройства, из которого `make stand-base` извлекает базу стенда;
- публичный rootfs локального стенда, `openwrt/rootfs:aarch64_generic-<релиз>`: `METABOX_BASE_IMAGE` в `Makefile`, `BASE_IMAGE` в `.devcontainer/docker-compose.yml` и `.devcontainer/target/Dockerfile`, таблица переменных стенда в `docs/Development.md` и `docs/Development.ru.md`;
- база стенда в CI, `openwrt/rootfs:x86-64-<релиз>`: `METABOX_BASE_IMAGE` задания `integration` в `.github/workflows/ci.yml`.

Перед слиянием проверьте:

- `make stand-base` собирается. Корневая файловая система ищется в sysupgrade-образе по сигнатуре squashfs; если формат образа изменится, сборка упадёт с ошибкой, в которой назван URL образа.
- Задание CI `integration` проходит на новом rootfs.
- Новый релиз по-прежнему использует apk: его требуют `install.sh` и пакет. Если меняется поддерживаемая ветка OpenWrt, обновите требования и бейдж в `README.md` и `README.ru.md`.

База извлекается из sysupgrade-образа, потому что OpenWrt не публикует docker-образ для `aarch64_cortex-a53`. Если он появится, замена извлечения — новое решение со своим ADR.
