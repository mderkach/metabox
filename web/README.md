# web — SPA metabox

React 19 + TypeScript + Vite. Сборка кладётся в `web/dist` и вшивается в демон (`cmd/metaboxd`).

Пакет воркспейса. Команды — в `scripts` из `package.json`: `dev`, `build`, `lint`, `test`; из корня репозитория они запускаются как `pnpm --filter web <скрипт>`. Форматирование общее на репозиторий — `pnpm format` в корне.

Правила фронтенда — [`AGENTS.md`](./AGENTS.md), гайды — [`docs/`](./docs/README.md), требования продукта — [`docs/PRD.md`](../docs/PRD.md).
