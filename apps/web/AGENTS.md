# Правила фронтенда metabox

Общие правила репозитория — в корневом [`AGENTS.md`](../../AGENTS.md). Здесь только то, что касается `apps/web/`.

## Когда читать гайды

Гайд читается по условию из таблицы, **полностью** и до внесения правки. О чём каждый документ — [`docs/README.md`](./docs/README.md).

| Читать полностью перед тем, как                           | Документ                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| создавать или менять прикладной код в `src`               | [Architecture&Style.md](./docs/guides/Architecture&Style.md) — FSD, Public API, нейминг, компоненты, стили |
| создавать или менять стор, селектор, любой код состояния  | [StateManagement.md](./docs/guides/StateManagement.md)                                                     |
| писать fetch-функцию, query-ключ, хук запроса или мутацию | [Query.md](./docs/guides/Query.md)                                                                         |
| писать форму или Zod-схему                                | [Form&Validation.md](./docs/guides/Form&Validation.md)                                                     |
| создавать или менять список, таблицу, её колонки и отбор  | [Tables.md](./docs/guides/Tables.md)                                                                       |
| писать или править тесты                                  | [UnitTesting.md](./docs/guides/UnitTesting.md)                                                             |
| сдавать фронтовую правку                                  | [ReviewChecklist.md](./docs/guides/ReviewChecklist.md) — пройти по чеклисту                                |

## Правки в `apps/web/`

- `src/shared/ui/**` — вендорная зона shadcn/ui: файлы генерирует CLI, правила нейминга к ним не применяются, переименовывать нельзя. Наружу зона видна через `src/shared/ui/index.ts`.
- `src/shared/api/generated.ts` — артефакт `tools/schemagen`, руками не правится. То же и `src/shared/api/daemon.generated.ts` — его пишет `cmd/contractgen` демона, пересобирает `make schema-daemon`.
- `src/i18n.generated.d.ts` — карта неймспейсов i18next, артефакт `tools/i18n.ts`. Пересобирается `pnpm --filter web gen:i18n`, на дев-сервере и в сборке — сама.
- Форматирование и линт — `pnpm format`, `pnpm lint`. Руками стиль не выравнивать.
