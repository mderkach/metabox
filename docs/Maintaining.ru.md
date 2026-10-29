[English](./Maintaining.md) · **Русский**

# Сопровождение

Задачи, для которых нужны права владельца репозитория: релизы, ключ подписи, GitHub Pages, правила веток, обновления sing-box-extended. Сборка и стенд — в [`Development.ru.md`](./Development.ru.md).

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

Если публикация упала, перезапустите исходный прогон workflow; новый прогон для того же тега не создавайте. Ссылка на исходный прогон есть в описании черновика релиза. Повтор восстанавливает сохранённые файлы, пропускает сборку и подпись и заново проверяет подпись пакета. Публикация начинается с черновика на коммите тега: workflow загружает только недостающие файлы, скачивает и сравнивает все четыре, затем публикует черновик; репозиторий пакетов черновики пропускает. Workflow останавливается, не заменяя файлы, если исходного артефакта нет или он просрочен, коммит другой, файл лишний или отличается либо релиз уже опубликован.

Регрессионные тесты публикации, включая повтор из чистого каталога, подменяют ответы GitHub: `python3 .github/tests/test_release_publish.py`.

Затем workflow [`apk repository`](../.github/workflows/apk-repo.yml) пересобирает репозиторий пакетов из всех релизов и выкладывает его на GitHub Pages. Он же копирует `install.sh` из самого нового релиза по адресу `https://mderkach.github.io/metabox/install.sh`. Если выкладка упала, запустите этот workflow руками со вкладки Actions; новый тег не нужен.

В репозитории два канала. В `testing` все релизы. В `stable` только версии без суффикса пре-релиза.

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

## Обновления sing-box-extended

Схема конфига генерируется по версии sing-box-extended, закреплённой в `tools/schemagen/go.mod`.

Workflow [`fork release watch`](../.github/workflows/fork-release-watch.yml) запускается раз в сутки и вручную (`dry_run` печатает diff и ничего не пушит). Когда выходит новый релиз sing-box-extended, он обновляет закреплённую версию, перегенерирует схему через `make schema` и открывает PR из ветки `build/bump-sing-box-extended`. Существующую ветку с другой версией он не перезаписывает: сначала проверьте и слейте её или удалите.

Workflow нужен секрет `FORK_BUMP_TOKEN` — токен с правом записи в `contents` и `pull requests`. PR, открытый стандартным `GITHUB_TOKEN`, не запускает CI, и обязательные проверки не пройдут никогда.

Логика workflow проверяется без сети командой `bash .github/scripts/fork-release-check.test.sh`; её же запускает CI.

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
