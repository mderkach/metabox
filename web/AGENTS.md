# Metabox web

## Фронтенд

При работе в `web/` читай [`web/docs/README.md`](./docs/README.md) и документы, на которые он ссылается:

- [Архитектура и стайлгайд](./docs/Architecture&Style.md) — FSD, Public API, нейминг, компоненты, стили
- [Управление состоянием](./docs/StateManagement.md) — Zustand + immer
- [Работа с запросами](./docs/Query.md) — TanStack Query
- [Формы и валидация](./docs/Form&Validation.md) — React Hook Form + Zod
- [Тестирование](./docs/UnitTesting.md) — Vitest + Testing Library
- [Чеклист код-ревью](./docs/ReviewChecklist.md)

Перед сдачей фронтовой правки проходись по чеклисту ревью.

## Команды

```bash
make test      # go test ./... + pnpm -C web test
make web       # сборка SPA
make daemon    # сборка демона (собирает web первым)
make schema    # регенерация web/src/schema.generated.ts
make dev
```

`web/src/schema.generated.ts` руками не правится — правится генератор.
